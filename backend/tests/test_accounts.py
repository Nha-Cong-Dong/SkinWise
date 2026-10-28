import hashlib
import logging
import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text

from app import mailer
from app.accounts import POLICY_VERSION, RateLimit, _new_email_token, reset_rate_limits
from app.accounts_api import COOKIE, DEV_ACCOUNT_EXISTS_VI, RESEND_SENT_VI, VERIFY_SENT_VI
from app.config import get_settings
from app.db import init_schema
from app.passwords import check_password, hash_password, password_problem

PASSWORD = "mot cum tu de nho"
OTHER_PASSWORD = "cum tu moi khac han"


@pytest.fixture(autouse=True)
def fresh_limits() -> Iterator[None]:
    reset_rate_limits()
    yield
    reset_rate_limits()


@pytest.fixture
def outbox(monkeypatch) -> list[tuple[str, str, str | None]]:
    """Every email the routes ask to send: (kind, address, link or None)."""
    sent: list[tuple[str, str, str | None]] = []
    real_send_link = mailer.send_link

    def send_link(kind, email, link, tasks):
        sent.append((kind, email, link))
        return real_send_link(kind, email, link, tasks)

    def send_account_exists(email, tasks):
        mailer.ensure_configured()
        sent.append(("account_exists", email, None))

    monkeypatch.setattr(mailer, "send_link", send_link)
    monkeypatch.setattr(mailer, "send_account_exists", send_account_exists)
    return sent


def new_email() -> str:
    return f"user-{uuid.uuid4().hex[:8]}@example.com"


def register(client: TestClient, email: str, password: str = PASSWORD, **change):
    body = {
        "email": email,
        "password": password,
        "consent": True,
        "policy_version": POLICY_VERSION,
        **change,
    }
    return client.post("/auth/register", json=body)


def token_of(response) -> str:
    return response.json()["dev_link"].split("token=")[1]


def login(client: TestClient, email: str, password: str = PASSWORD):
    return client.post("/auth/login", json={"email": email, "password": password})


def verify(client: TestClient, token: str, password: str = PASSWORD):
    return client.post("/auth/verify-email", json={"token": token, "password": password})


def resend(client: TestClient, email: str, password: str = PASSWORD):
    return client.post("/auth/resend-verification", json={"email": email, "password": password})


def sign_up(client: TestClient, email: str, password: str = PASSWORD) -> dict:
    """Register, verify and so sign in."""
    response = verify(client, token_of(register(client, email, password)), password)
    assert response.status_code == 200, response.text
    return response.json()


def forgot(client: TestClient, email: str):
    return client.post("/auth/forgot-password", json={"email": email})


def reset(client: TestClient, token: str, password: str = OTHER_PASSWORD):
    return client.post("/auth/reset-password", json={"token": token, "password": password})


def real_mode(monkeypatch) -> None:
    """A mode that sends real email (smtp; the emails themselves: tests/test_mailer.py)."""
    monkeypatch.setattr(mailer, "dev_mode", lambda: False)
    monkeypatch.setattr(mailer, "ensure_configured", lambda: None)
    monkeypatch.setattr(mailer, "send_link", lambda kind, email, link, tasks: None)
    monkeypatch.setattr(mailer, "send_account_exists", lambda email, tasks: None)


ROUTINE = {
    "products": [
        {"key": "p1", "name": "Retinol", "brand": "The Ordinary", "productId": 1, "inci": None,
         "groups": ["RETINOID"], "notices": []},
        {"key": "cx", "name": "Kem tự nhập", "brand": None, "productId": None,
         "inci": "Aqua, Glycerin", "groups": [], "notices": []},
    ],
    "entries": [
        {"id": "e1", "productKey": "p1", "session": "PM", "days": [0, 2, 4]},
        {"id": "e2", "productKey": "cx", "session": "AM", "days": [0, 1, 2, 3, 4, 5, 6]},
    ],
}  # fmt: skip


# --- passwords ---


def test_password_hash_is_salted_and_checked() -> None:
    stored = hash_password(PASSWORD)
    assert check_password(PASSWORD, stored)
    assert not check_password(PASSWORD.upper(), stored)
    assert hash_password(PASSWORD) != stored
    assert PASSWORD not in stored


def test_password_rules() -> None:
    email = "lan@example.com"
    assert password_problem("a" * 7, email) == "password must be 8 to 128 characters"
    assert password_problem("a" * 129, email) == "password must be 8 to 128 characters"
    assert password_problem("a" * 8, email) is None
    assert password_problem("a" * 128, email) is None
    assert password_problem(" LAN@example.com", email) == "password must not be the email"
    assert password_problem("12345678", email) is None  # no composition rules (NIST 800-63B)


# --- register and verify ---


def test_register_verify_then_sign_in(client: TestClient, engine: Engine) -> None:
    email = new_email()
    sent = register(client, f"  {email.upper()} ")
    assert sent.status_code == 202
    assert sent.json()["dev_link"].startswith("http://localhost:5173/#verify-email?token=")
    assert "Chế độ thử" in sent.json()["message_vi"]
    assert COOKIE not in client.cookies
    assert login(client, email).status_code == 403  # not verified yet

    me = verify(client, token_of(sent))
    assert me.status_code == 200
    assert COOKIE in client.cookies
    profile = client.get("/me").json()
    assert profile["email"] == email
    assert profile["dev_mode"] is True
    assert [(c["purpose"], c["policy_version"]) for c in profile["consents"]] == [
        ("account", POLICY_VERSION)
    ]
    with engine.connect() as conn:
        stored = conn.execute(
            text("SELECT password_hash FROM users WHERE email = :e"), {"e": email}
        ).scalar_one()
    assert stored.startswith("scrypt$") and PASSWORD not in stored

    client.cookies.clear()
    assert login(client, f" {email.upper()}").status_code == 200
    assert COOKIE in client.cookies


def test_verify_link_is_single_use_and_expires(client: TestClient, engine: Engine) -> None:
    token = token_of(register(client, new_email()))
    assert verify(client, token).status_code == 200
    assert verify(client, token).status_code == 400

    email = new_email()
    expired = token_of(register(client, email))
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE email_tokens SET expires_at = now() - interval '1 minute' WHERE email = :e"
            ),
            {"e": email},
        )
    assert verify(client, expired).status_code == 400
    assert verify(client, "x" * 43).status_code == 400
    assert verify(client, "short").status_code == 422
    assert client.post("/auth/verify-email", json={"token": "x" * 43}).status_code == 422


def test_register_validation(client: TestClient) -> None:
    email = new_email()
    cases = [
        (register(client, email, consent=False), 422, "consent is required"),
        (register(client, email, policy_version="old"), 409, None),
        (register(client, "not an email"), 422, "not an email address"),
        (register(client, email, "a" * 7), 422, "password must be 8 to 128 characters"),
        (register(client, email, "a" * 129), 422, "password must be 8 to 128 characters"),
        (register(client, email, email.upper()), 422, "password must not be the email"),
    ]
    for response, code, detail in cases:
        assert response.status_code == code, response.text
        if detail:
            assert response.json()["detail"] == detail
    assert client.post("/auth/register", json={"email": email}).status_code == 422  # pydantic


@pytest.mark.parametrize(
    "address", ["a,b@example.com", "a <b@example.com>", 'a"b@example.com', "a;b@example.com"]
)
def test_one_plain_address_only(client: TestClient, address: str) -> None:
    """Nothing that could name several recipients in a header or the SMTP envelope."""
    not_an_email = {"detail": "not an email address"}
    for response in (
        register(client, address),
        forgot(client, address),
        resend(client, address),
    ):
        assert response.status_code == 422 and response.json() == not_an_email
    login_answer = login(client, address)
    assert login_answer.status_code == 401  # as for any wrong email (decided: no 422 on login)
    assert login_answer.json() == {"detail": "wrong email or password"}


def test_register_again_with_a_verified_email_changes_nothing(
    client: TestClient, outbox, monkeypatch
) -> None:
    email = new_email()
    sign_up(client, email)
    client.cookies.clear()
    again = register(client, email, OTHER_PASSWORD)
    assert again.status_code == 202
    assert again.json() == {
        "message_vi": DEV_ACCOUNT_EXISTS_VI,
        "dev_link": None,
    }
    assert outbox[-1] == ("account_exists", email, None)
    assert login(client, email, OTHER_PASSWORD).status_code == 401
    assert login(client, email).status_code == 200

    # Outside dev mode the answer is the same as for a new address.
    real_mode(monkeypatch)
    answers = [register(client, e).json() for e in (email, new_email())]
    assert answers[0] == answers[1] == {"message_vi": VERIFY_SENT_VI, "dev_link": None}


def test_each_verify_link_activates_only_its_own_password(
    client: TestClient, engine: Engine
) -> None:
    """Someone registering an unverified address again with their own password cannot make
    the owner's link activate it."""
    email = new_email()
    first = token_of(register(client, email))  # the owner, PASSWORD
    second = token_of(register(client, email, OTHER_PASSWORD))  # registered again
    assert login(client, email, OTHER_PASSWORD).status_code == 403  # the latest password

    wrong = verify(client, second, PASSWORD)
    assert wrong.status_code == 401 and wrong.json() == {"detail": "wrong password"}
    assert verify(client, first, PASSWORD).status_code == 200
    client.cookies.clear()
    assert login(client, email).status_code == 200
    assert login(client, email, OTHER_PASSWORD).status_code == 401

    assert verify(client, second, PASSWORD).status_code == 401
    with engine.connect() as conn:
        unused = conn.execute(
            text("SELECT used_at IS NULL FROM email_tokens WHERE token_hash = :h"),
            {"h": hashlib.sha256(second.encode()).hexdigest()},
        )
        assert unused.scalar_one() is True  # a wrong password does not use the link up
    # The account is verified now: the other link cannot bring back its password.
    assert verify(client, second, OTHER_PASSWORD).status_code == 400
    client.cookies.clear()
    assert login(client, email).status_code == 200


def test_too_many_wrong_passwords_on_the_verify_page(client: TestClient) -> None:
    email = new_email()
    token = token_of(register(client, email))
    statuses = [verify(client, token, OTHER_PASSWORD).status_code for _ in range(6)]
    assert statuses == [401] * 5 + [429]
    assert verify(client, token).status_code == 429  # even the right password
    assert login(client, email).status_code == 429  # counted as failed sign-ins
    reset_rate_limits()
    assert verify(client, token).status_code == 200


def age(engine: Engine, email: str, *, links_expired: bool) -> None:
    """Make the account 8 days old, and its links expired if asked."""
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE users SET created_at = now() - interval '8 days' WHERE email = :e"),
            {"e": email},
        )
        if links_expired:
            conn.execute(
                text(
                    "UPDATE email_tokens SET expires_at = now() - interval '1 hour' "
                    "WHERE email = :e"
                ),
                {"e": email},
            )


def test_unverified_accounts_expire_after_a_week(client: TestClient, engine: Engine) -> None:
    email = new_email()
    token = token_of(register(client, email))
    age(engine, email, links_expired=True)
    register(client, new_email())  # someone registers: old unverified accounts are removed
    with engine.connect() as conn:
        count = conn.execute(text("SELECT count(*) FROM users WHERE email = :e"), {"e": email})
        assert count.scalar_one() == 0
    assert verify(client, token).status_code == 400


def test_a_week_old_account_with_a_usable_link_is_kept(client: TestClient, engine: Engine) -> None:
    """Registering again or asking for a new link after a week must not lose the account the
    new link is for."""
    again, resent = new_email(), new_email()
    register(client, again)
    token_again = token_of(register(client, again))  # registered again, on day 7
    register(client, resent)
    token_resent = token_of(resend(client, resent))  # asked for a new link, on day 7
    for email in (again, resent):
        age(engine, email, links_expired=False)  # a day later; the new links are still valid
    register(client, new_email())  # cleanup runs
    assert verify(client, token_again).status_code == 200
    assert verify(client, token_resent).status_code == 200


def test_resend_verification_needs_the_password(client: TestClient, outbox) -> None:
    email = new_email()
    register(client, email)
    sent_before = len(outbox)
    nothing = {"message_vi": RESEND_SENT_VI, "dev_link": None}
    wrong = resend(client, email, OTHER_PASSWORD)
    assert wrong.status_code == 202 and wrong.json() == nothing
    unknown = resend(client, new_email())
    assert unknown.status_code == 202 and unknown.json() == nothing
    assert len(outbox) == sent_before  # nothing was sent

    resent = resend(client, email)
    assert resent.status_code == 202
    assert outbox[-1][:2] == ("verify", email)
    assert verify(client, token_of(resent)).status_code == 200
    assert client.get("/me").json()["consents"][0]["policy_version"] == POLICY_VERSION

    reset_rate_limits()  # four requests for one address
    verified = resend(client, email)  # verified: nothing to send
    assert verified.json() == nothing
    assert resend(client, "nope").status_code == 422
    assert client.post("/auth/resend-verification", json={"email": email}).status_code == 422


def test_resend_after_old_links_are_cleaned_up(client: TestClient, engine: Engine) -> None:
    email = new_email()
    register(client, email)
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM email_tokens WHERE email = :e"), {"e": email})
    resent = resend(client, email)
    assert verify(client, token_of(resent)).status_code == 200
    profile = client.get("/me").json()
    assert [c["policy_version"] for c in profile["consents"]] == [POLICY_VERSION]
    with engine.connect() as conn:
        pending = conn.execute(
            text("SELECT pending_policy_version FROM users WHERE email = :e"), {"e": email}
        )
        assert pending.scalar_one() is None  # cleared once verified


# --- sign in ---


def test_wrong_email_and_wrong_password_answer_alike(client: TestClient) -> None:
    email = new_email()
    sign_up(client, email)
    client.cookies.clear()
    wrong_password = login(client, email, OTHER_PASSWORD)
    unknown = login(client, new_email())
    not_an_email = login(client, "nope")
    for response in (wrong_password, unknown, not_an_email):
        assert response.status_code == 401
        assert response.json() == {"detail": "wrong email or password"}
    assert COOKIE not in client.cookies


def test_unverified_needs_the_right_password_to_learn_it(client: TestClient) -> None:
    email = new_email()
    register(client, email)
    assert login(client, email, OTHER_PASSWORD).status_code == 401
    unverified = login(client, email)
    assert unverified.status_code == 403
    assert unverified.json() == {"detail": "email not verified"}


def test_too_many_wrong_passwords_block_even_the_right_one(client: TestClient) -> None:
    email = new_email()
    sign_up(client, email)
    client.cookies.clear()
    assert [login(client, email, OTHER_PASSWORD).status_code for _ in range(5)] == [401] * 5
    assert login(client, email).status_code == 429
    reset_rate_limits()
    assert login(client, email).status_code == 200


def test_right_passwords_are_not_counted(client: TestClient) -> None:
    email = new_email()
    sign_up(client, email)
    assert all(login(client, email).status_code == 200 for _ in range(7))


def test_wrong_passwords_from_one_ip_are_limited(client: TestClient) -> None:
    statuses = [login(client, new_email()).status_code for _ in range(21)]
    assert statuses == [401] * 20 + [429]


# --- forgot password ---


def test_forgot_password_resets_and_signs_out_other_devices(client: TestClient) -> None:
    email = new_email()
    sign_up(client, email)
    with TestClient(client.app) as other:
        assert login(other, email).status_code == 200
        client.cookies.clear()
        sent = forgot(client, email)
        assert sent.status_code == 202
        link = sent.json()["dev_link"]
        assert link.startswith("http://localhost:5173/#reset-password?token=")
        token = token_of(sent)

        done = reset(client, token)
        assert done.status_code == 200 and done.json()["email"] == email
        assert client.get("/me").status_code == 200  # this device is signed in
        assert other.get("/me").status_code == 401  # every other one is not
    assert reset(client, token, "mat khau thu ba").status_code == 400  # single use
    client.cookies.clear()
    assert login(client, email).status_code == 401
    assert login(client, email, OTHER_PASSWORD).status_code == 200


def test_reset_ends_every_other_reset_link(client: TestClient) -> None:
    email = new_email()
    sign_up(client, email)
    first, second = token_of(forgot(client, email)), token_of(forgot(client, email))
    assert reset(client, second).status_code == 200
    assert reset(client, first).status_code == 400


def test_forgot_password_does_not_tell_whether_an_account_exists(
    client: TestClient, monkeypatch, outbox
) -> None:
    unknown = forgot(client, new_email())
    assert unknown.status_code == 202 and unknown.json()["dev_link"] is None
    assert outbox == []
    email = new_email()
    sign_up(client, email)
    real_mode(monkeypatch)
    answers = [forgot(client, e).json() for e in (email, new_email())]
    assert answers[0] == answers[1]
    assert answers[0]["dev_link"] is None


def test_reset_link_checks(client: TestClient, engine: Engine) -> None:
    email = new_email()
    sign_up(client, email)
    token = token_of(forgot(client, email))
    assert reset(client, token, "a" * 7).json()["detail"] == "password must be 8 to 128 characters"
    assert reset(client, token, "a" * 129).status_code == 422
    assert reset(client, token, email).json()["detail"] == "password must not be the email"
    assert reset(client, "x" * 43).status_code == 400
    assert reset(client, token).status_code == 200  # the refused passwords kept the link

    expired = token_of(forgot(client, email))
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE email_tokens SET expires_at = now() - interval '1 minute' WHERE email = :e"
            ),
            {"e": email},
        )
    assert reset(client, expired).status_code == 400
    # A verify token is not a reset token.
    verify = token_of(register(client, new_email()))
    assert reset(client, verify).status_code == 400


def test_no_reset_for_an_unverified_account(client: TestClient, engine: Engine, outbox) -> None:
    """Whoever registered an address may not own it: a reset must not verify it, nor record
    the consent they gave."""
    email = new_email()
    register(client, email)
    sent = len(outbox)
    answer = forgot(client, email)
    assert answer.status_code == 202
    assert answer.json() == forgot(client, new_email()).json()  # same as an unknown address
    assert len(outbox) == sent
    with engine.begin() as conn:
        resets = conn.execute(
            text("SELECT count(*) FROM email_tokens WHERE email = :e AND purpose = 'reset'"),
            {"e": email},
        )
        assert resets.scalar_one() == 0
        # A reset link made before this rule is refused too.
        old_token = _new_email_token(conn, email, "reset")
    assert reset(client, old_token).status_code == 400
    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT u.email_verified_at, "
                "(SELECT count(*) FROM consents c WHERE c.user_id = u.id) "
                "FROM users u WHERE u.email = :e"
            ),
            {"e": email},
        ).one()
    assert row == (None, 0)
    # Still counted: register and one forgot so far, so the third passes and the fourth not.
    assert [forgot(client, email).status_code for _ in range(2)] == [202, 429]


def test_schema_run_again_keeps_new_accounts_unverified(client: TestClient, engine: Engine) -> None:
    email = new_email()
    register(client, email)
    init_schema(engine)
    assert login(client, email).status_code == 403
    with engine.connect() as conn:
        verified = conn.execute(
            text("SELECT email_verified_at FROM users WHERE email = :e"), {"e": email}
        )
        assert verified.scalar_one() is None


def test_rate_limit_keeps_no_address_and_forgets_idle_keys() -> None:
    limit = RateLimit({"email": (2, -1.0), "ip": (2, -1.0)})  # every event already outside
    limit.record("lan@example.com", "10.0.0.1")
    assert len(limit) == 2
    assert all("lan@example.com" not in key for key in limit._recent)
    assert not limit.blocked("lan@example.com", "10.0.0.1")
    assert len(limit) == 0
    assert not limit.blocked("other@example.com", None)
    assert len(limit) == 0  # checking does not add keys


def test_account_from_before_passwords_sets_one_by_reset(
    client: TestClient, engine: Engine
) -> None:
    """Accounts from the sign-in-by-link days have no password and count as verified."""
    email = new_email()
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO users (email, email_verified_at) VALUES (:e, now())"), {"e": email}
        )
    assert login(client, email).status_code == 401
    assert register(client, email).json()["dev_link"] is None  # already has an account
    assert reset(client, token_of(forgot(client, email))).status_code == 200
    client.cookies.clear()
    assert login(client, email, OTHER_PASSWORD).status_code == 200


def test_old_sign_in_by_link_routes_are_gone(client: TestClient) -> None:
    assert client.post("/auth/email-link", json={}).status_code in (404, 405)
    assert client.post("/auth/session", json={"token": "x" * 43}).status_code in (404, 405)


def test_too_many_emails_for_one_address(client: TestClient) -> None:
    email = new_email()
    statuses = [
        register(client, email).status_code,
        resend(client, email).status_code,
        forgot(client, email).status_code,
        forgot(client, email).status_code,
    ]
    assert statuses == [202, 202, 202, 429]


def test_no_email_outside_dev_mode(client: TestClient, engine: Engine, monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "login_email_mode", "smtp")
    email = new_email()
    assert register(client, email).status_code == 503
    assert forgot(client, email).status_code == 503
    assert forgot(client, new_email()).status_code == 503  # an unknown address answers alike
    assert resend(client, email).status_code == 503
    with engine.connect() as conn:
        for table in ("users", "email_tokens"):
            count = conn.execute(
                text(f"SELECT count(*) FROM {table} WHERE email = :e"), {"e": email}
            )
            assert count.scalar_one() == 0, table


def test_logs_never_hold_passwords_or_addresses(client: TestClient, caplog) -> None:
    email = new_email()
    with caplog.at_level(logging.DEBUG):
        sign_up(client, email)
        login(client, email, OTHER_PASSWORD)
        forgot(client, email)
    assert email not in caplog.text
    assert PASSWORD not in caplog.text and OTHER_PASSWORD not in caplog.text
    assert "scrypt$" not in caplog.text


# --- the signed-in user (unchanged) ---


def test_me_needs_a_session(client: TestClient) -> None:
    for path in ("/me", "/me/routine", "/me/export"):
        assert client.get(path).status_code == 401
    assert client.put("/me/routine", json={"data": ROUTINE, "base_version": 0}).status_code == 401
    client.cookies.set(COOKIE, "forged")
    assert client.get("/me").status_code == 401


def test_routine_sync_refuses_a_stale_write(client: TestClient) -> None:
    sign_up(client, new_email())
    assert client.get("/me/routine").json() == {"data": None, "version": 0, "updated_at": None}
    first = client.put("/me/routine", json={"data": ROUTINE, "base_version": 0})
    assert first.status_code == 200 and first.json()["version"] == 1
    assert first.json()["data"] == ROUTINE

    changed = {**ROUTINE, "entries": ROUTINE["entries"][:1]}
    assert (
        client.put("/me/routine", json={"data": changed, "base_version": 1}).json()["version"] == 2
    )
    # Another device still at version 1 (or 0) must not overwrite version 2.
    for stale in (1, 0):
        conflict = client.put("/me/routine", json={"data": ROUTINE, "base_version": stale})
        assert conflict.status_code == 409
        assert conflict.json()["version"] == 2 and conflict.json()["data"] == changed
    assert client.get("/me").json()["routine_updated_at"] is not None


def test_routine_must_be_well_formed(client: TestClient) -> None:
    sign_up(client, new_email())
    dangling = {
        **ROUTINE,
        "entries": [{"id": "e", "productKey": "nope", "session": "AM", "days": [0]}],
    }
    too_many = {"products": [{**ROUTINE["products"][1], "key": f"k{i}"} for i in range(51)],
                "entries": []}  # fmt: skip
    bad_day = {**ROUTINE, "entries": [{**ROUTINE["entries"][0], "days": [7]}]}
    for data in (dangling, too_many, bad_day):
        assert client.put("/me/routine", json={"data": data, "base_version": 0}).status_code == 422


def test_logout_ends_the_session_on_the_server(client: TestClient) -> None:
    sign_up(client, new_email())
    session_id = client.cookies[COOKIE]
    assert client.post("/auth/logout").status_code == 204
    client.cookies.set(COOKIE, session_id)  # replaying the old cookie
    assert client.get("/me").status_code == 401


def test_logout_everywhere(client: TestClient) -> None:
    email = new_email()
    sign_up(client, email)
    with TestClient(client.app) as other:
        assert login(other, email).status_code == 200
        assert client.post("/auth/logout-all").status_code == 204
        assert other.get("/me").status_code == 401


def test_export_then_delete_removes_everything(client: TestClient, engine: Engine) -> None:
    email = new_email()
    sign_up(client, email)
    client.put("/me/routine", json={"data": ROUTINE, "base_version": 0})
    forgot(client, email)  # a pending reset link for the address
    exported = client.get("/me/export")
    assert "attachment" in exported.headers["content-disposition"]
    assert exported.json()["email"] == email and exported.json()["routine"] == ROUTINE
    assert "password" not in exported.text and "scrypt" not in exported.text

    assert (
        client.request("DELETE", "/me", json={"confirm_email": "other@example.com"}).status_code
        == 422
    )
    assert client.request("DELETE", "/me", json={"confirm_email": email.upper()}).status_code == 204
    assert client.get("/me").status_code == 401
    with engine.connect() as conn:
        for table in ("users", "email_tokens"):
            count = conn.execute(
                text(f"SELECT count(*) FROM {table} WHERE email = :e"), {"e": email}
            )
            assert count.scalar_one() == 0, table
        for table in ("user_routines", "user_sessions"):
            orphans = conn.execute(
                text(
                    f"SELECT count(*) FROM {table} t LEFT JOIN users u ON u.id = t.user_id "
                    "WHERE u.id IS NULL"
                )  # fmt: skip
            )
            assert orphans.scalar_one() == 0, table


def test_routine_keeps_where_a_list_came_from(client: TestClient) -> None:
    sign_up(client, new_email())
    photo_product = {**ROUTINE["products"][1], "origin": {"kind": "photo", "confirmed": False}}
    data = {**ROUTINE, "products": [ROUTINE["products"][0], photo_product]}
    saved = client.put("/me/routine", json={"data": data, "base_version": 0})
    assert saved.status_code == 200
    assert saved.json()["data"] == data  # origin kept; absent where it was absent (no null)
    assert "origin" not in saved.json()["data"]["products"][0]
    assert client.get("/me/routine").json()["data"] == data

    for bad in ({"kind": "camera", "confirmed": True}, {"kind": "photo"}):
        wrong = {**data, "products": [ROUTINE["products"][0], {**photo_product, "origin": bad}]}
        assert client.put("/me/routine", json={"data": wrong, "base_version": 1}).status_code == 422


def test_tests_never_send_email() -> None:
    """tests/conftest.py pins dev mode whatever .env says (LOGIN_EMAIL_MODE=smtp included)."""
    settings = get_settings()
    assert settings.login_email_mode == "dev" and mailer.dev_mode()
    assert settings.smtp_host is None and settings.smtp_from is None
    assert settings.app_url == "http://localhost:5173"
