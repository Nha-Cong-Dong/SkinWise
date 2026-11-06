import re
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text
from sqlalchemy.engine import Connection

from app.accounts import POLICY_VERSION, create_session
from app.demo_account import (
    DEMO_EMAIL,
    SAMPLE_STEPS,
    ensure_demo_account,
    remove_demo_account,
)
from app.passwords import hash_password

ROUTINE_TS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "routine.ts"


@pytest.fixture
def conn(engine: Engine) -> Iterator[Connection]:
    with engine.connect() as conn:
        transaction = conn.begin()
        yield conn
        transaction.rollback()


def no_password() -> str:
    raise AssertionError("the password is asked only when the account is created")


def test_sample_steps_mirror_the_frontend_sample_routine() -> None:
    if not ROUTINE_TS.exists():
        pytest.skip("frontend not checked out")
    source = ROUTINE_TS.read_text(encoding="utf-8")
    block = source[
        source.index("const SAMPLE_STEPS") : source.index("export function sampleRoutine")
    ]
    steps = re.findall(r"slug: '([^']+)', session: '(AM|PM)'", block)
    assert steps == SAMPLE_STEPS


def test_demo_account_is_verified_consented_and_holds_the_sample_routine(conn: Connection) -> None:
    remove_demo_account(conn)
    account = ensure_demo_account(conn, lambda: hash_password("mat-khau-demo-thu"))
    assert account.created and account.routine_version == 1
    user = conn.execute(
        text("SELECT email_verified_at, password_hash FROM users WHERE id = :id"),
        {"id": account.user_id},
    ).one()
    assert user.email_verified_at is not None and user.password_hash
    consents = conn.execute(
        text("SELECT purpose, policy_version FROM consents WHERE user_id = :id"),
        {"id": account.user_id},
    ).all()
    assert [tuple(c) for c in consents] == [("account", POLICY_VERSION)]
    handle = conn.execute(
        text("SELECT handle FROM user_profiles WHERE user_id = :id"), {"id": account.user_id}
    ).scalar_one()
    assert handle == account.handle

    data = conn.execute(
        text("SELECT data FROM user_routines WHERE user_id = :id"), {"id": account.user_id}
    ).scalar_one()
    ids = dict(conn.execute(text("SELECT slug, id FROM products")).all())
    assert [p["productId"] for p in data["products"]] == [ids[s] for s, _ in SAMPLE_STEPS]
    assert [(e["productKey"], e["session"]) for e in data["entries"]] == [
        (f"p{ids[s]}", session) for s, session in SAMPLE_STEPS
    ]
    assert all(e["days"] == list(range(7)) for e in data["entries"])
    retinol = next(p for p in data["products"] if "retinol" in p["name"].lower())
    assert "RETINOID" in retinol["groups"] and retinol["inci"] is None


def test_running_again_updates_without_asking_for_the_password(conn: Connection) -> None:
    remove_demo_account(conn)
    first = ensure_demo_account(conn, lambda: hash_password("mat-khau-demo-thu"))
    conn.execute(text('UPDATE user_routines SET data = \'{"products": [], "entries": []}\'::jsonb'))
    again = ensure_demo_account(conn, no_password)
    assert again.user_id == first.user_id and not again.created
    assert again.routine_version == 2
    data = conn.execute(
        text("SELECT data FROM user_routines WHERE user_id = :id"), {"id": again.user_id}
    ).scalar_one()
    assert len(data["entries"]) == len(SAMPLE_STEPS)


def test_reset_only_removes_the_demo_account(conn: Connection) -> None:
    others = ["demo@skinwise.test.vn", "real-demo@skinwise.test", "demo@example.com"]
    for email in others:
        conn.execute(text("INSERT INTO users (email) VALUES (:e)"), {"e": email})
    remove_demo_account(conn)
    ensure_demo_account(conn, lambda: hash_password("mat-khau-demo-thu"))
    assert remove_demo_account(conn)
    left = conn.execute(
        text("SELECT email FROM users WHERE email = ANY(:e)"), {"e": [*others, DEMO_EMAIL]}
    ).scalars()
    assert sorted(left) == sorted(others)


def test_the_frontend_reads_the_demo_routine(engine: Engine, client: TestClient) -> None:
    with engine.begin() as conn:
        remove_demo_account(conn)
        account = ensure_demo_account(conn, lambda: hash_password("mat-khau-demo-thu"))
        session_id = create_session(conn, account.user_id)
    try:
        client.cookies.set("skinwise_session", session_id)
        stored = client.get("/me/routine")
        assert stored.status_code == 200
        body = stored.json()
        assert body["version"] == 1
        # Exactly what PUT /me/routine accepts, so the frontend can save it back unchanged.
        saved = client.put("/me/routine", json={"data": body["data"], "base_version": 1})
        assert saved.status_code == 200 and saved.json()["data"] == body["data"]
        products = [
            {"key": p["key"], "product_id": p["productId"]} for p in body["data"]["products"]
        ]
        steps = {"AM": 0, "PM": 0}
        items = []
        for e in body["data"]["entries"]:
            steps[e["session"]] += 1
            items.append(
                {
                    "product_key": e["productKey"],
                    "session": e["session"],
                    "days": e["days"],
                    "step": steps[e["session"]],
                }  # fmt: skip
            )
        check = client.post("/routine/check", json={"products": products, "items": items})
        assert check.status_code == 200
    finally:
        client.cookies.clear()
        with engine.begin() as conn:
            remove_demo_account(conn)
