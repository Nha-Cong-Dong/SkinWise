import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text

from app.accounts import POLICY_VERSION, reset_rate_limits
from app.accounts_api import COOKIE
from app.config import get_settings


@pytest.fixture(autouse=True)
def fresh_limits() -> Iterator[None]:
    reset_rate_limits()
    yield
    reset_rate_limits()


def new_email() -> str:
    return f"user-{uuid.uuid4().hex[:8]}@example.com"


def ask_link(client: TestClient, email: str, **change) -> dict:
    body = {"email": email, "consent": True, "policy_version": POLICY_VERSION, **change}
    return client.post("/auth/email-link", json=body)


def token_of(response) -> str:
    return response.json()["dev_link"].split("token=")[1]


def sign_in(client: TestClient, email: str) -> dict:
    response = client.post("/auth/session", json={"token": token_of(ask_link(client, email))})
    assert response.status_code == 200, response.text
    return response.json()


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


def test_sign_in_by_link_creates_account_and_session(client: TestClient) -> None:
    sent = ask_link(client, "  Lan.Nguyen@Example.COM ")
    assert sent.status_code == 202
    assert sent.json()["dev_link"].startswith("http://localhost:5173/#sign-in?token=")
    assert "Chế độ thử" in sent.json()["message_vi"]
    me = client.post("/auth/session", json={"token": token_of(sent)})
    assert me.status_code == 200
    assert COOKIE in client.cookies
    profile = client.get("/me").json()
    assert profile["email"] == "lan.nguyen@example.com"
    assert profile["dev_mode"] is True
    assert [(c["purpose"], c["policy_version"]) for c in profile["consents"]] == [
        ("account", POLICY_VERSION)
    ]


def test_link_is_single_use_and_expires(client: TestClient, engine: Engine) -> None:
    token = token_of(ask_link(client, new_email()))
    assert client.post("/auth/session", json={"token": token}).status_code == 200
    assert client.post("/auth/session", json={"token": token}).status_code == 400

    expired = token_of(ask_link(client, new_email()))
    with engine.begin() as conn:
        conn.execute(text("UPDATE login_tokens SET expires_at = now() - interval '1 minute'"))
    assert client.post("/auth/session", json={"token": expired}).status_code == 400
    assert client.post("/auth/session", json={"token": "x" * 43}).status_code == 400


def test_link_request_needs_consent_current_policy_and_an_address(client: TestClient) -> None:
    assert ask_link(client, new_email(), consent=False).status_code == 422
    assert ask_link(client, new_email(), policy_version="old").status_code == 409
    assert ask_link(client, "not an email").status_code == 422


def test_answer_does_not_tell_whether_an_account_exists(client: TestClient) -> None:
    existing = new_email()
    sign_in(client, existing)
    answers = [ask_link(client, e).json() for e in (existing, new_email())]
    assert answers[0]["message_vi"] == answers[1]["message_vi"]


def test_too_many_links_for_one_address(client: TestClient) -> None:
    email = new_email()
    assert [ask_link(client, email).status_code for _ in range(4)] == [202, 202, 202, 429]


def test_no_email_sent_outside_dev_mode(client: TestClient, engine: Engine, monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "login_email_mode", "smtp")
    email = new_email()
    assert ask_link(client, email).status_code == 503
    with engine.connect() as conn:
        stored = conn.execute(
            text("SELECT count(*) FROM login_tokens WHERE email = :e"), {"e": email}
        )
        assert stored.scalar_one() == 0


def test_me_needs_a_session(client: TestClient) -> None:
    for path in ("/me", "/me/routine", "/me/export"):
        assert client.get(path).status_code == 401
    assert client.put("/me/routine", json={"data": ROUTINE, "base_version": 0}).status_code == 401
    client.cookies.set(COOKIE, "forged")
    assert client.get("/me").status_code == 401


def test_routine_sync_refuses_a_stale_write(client: TestClient) -> None:
    sign_in(client, new_email())
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
    sign_in(client, new_email())
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
    sign_in(client, new_email())
    session_id = client.cookies[COOKIE]
    assert client.post("/auth/logout").status_code == 204
    client.cookies.set(COOKIE, session_id)  # replaying the old cookie
    assert client.get("/me").status_code == 401


def test_logout_everywhere(engine: Engine, client: TestClient) -> None:
    email = new_email()
    sign_in(client, email)
    with TestClient(client.app) as other:
        sign_in(other, email)
        assert client.post("/auth/logout-all").status_code == 204
        assert other.get("/me").status_code == 401


def test_export_then_delete_removes_everything(client: TestClient, engine: Engine) -> None:
    email = new_email()
    sign_in(client, email)
    client.put("/me/routine", json={"data": ROUTINE, "base_version": 0})
    ask_link(client, email)  # a pending link for the address
    exported = client.get("/me/export")
    assert "attachment" in exported.headers["content-disposition"]
    assert exported.json()["email"] == email and exported.json()["routine"] == ROUTINE

    assert (
        client.request("DELETE", "/me", json={"confirm_email": "other@example.com"}).status_code
        == 422
    )
    assert client.request("DELETE", "/me", json={"confirm_email": email.upper()}).status_code == 204
    assert client.get("/me").status_code == 401
    with engine.connect() as conn:
        for table, column in (("users", "email"), ("login_tokens", "email")):
            count = conn.execute(
                text(f"SELECT count(*) FROM {table} WHERE {column} = :e"), {"e": email}
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
