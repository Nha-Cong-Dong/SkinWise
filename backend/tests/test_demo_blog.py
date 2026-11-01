import tomllib

import pytest
from sqlalchemy import Engine, text

from app.blog import get_profile, put_profile
from scripts.demo_blog import DATA, demo_email, ensure_accounts, free_handle


def test_demo_data_is_well_formed() -> None:
    data = tomllib.loads(DATA.read_text(encoding="utf-8"))
    assert {a["n"] for a in data["account"]} == {1, 2, 3, 4, 5}
    assert all(demo_email(a["n"]).endswith("@skinwise.test") for a in data["account"])
    claims = [p for p in data["post"] if "trị" in p["title"] + p["body"]]
    assert len(claims) == 1  # exactly one post holds a claim on purpose


def test_a_taken_handle_gets_a_suffix(engine: Engine, monkeypatch) -> None:
    monkeypatch.setenv("DEMO_BLOG_PASSWORD", "mat-khau-demo-thu")
    with engine.connect() as conn:
        outer = conn.begin()
        try:
            someone = conn.execute(
                text(
                    "INSERT INTO users (email) VALUES ('nguoi-that@example.com') RETURNING id::text"
                )
            ).scalar_one()
            conn.execute(text("DELETE FROM users WHERE email LIKE '%@skinwise.test'"))
            put_profile(conn, someone, "mai.dadau", None)
            assert free_handle(conn, "mai.dadau", "00000000-0000-0000-0000-000000000000") == (
                "mai.dadau_demo1"
            )
            users = ensure_accounts(conn, [{"n": 1, "handle": "mai.dadau", "skin_type": "oily"}])
            assert get_profile(conn, users[1]).handle == "mai.dadau_demo1"
            assert get_profile(conn, someone).handle == "mai.dadau"
        finally:
            outer.rollback()


@pytest.mark.parametrize("n", [1, 5])
def test_demo_emails(n: int) -> None:
    assert demo_email(n) == f"demo{n}@skinwise.test"


def test_reset_only_touches_skinwise_test_addresses(engine: Engine) -> None:
    from scripts.demo_blog import remove_demo_accounts

    kept = [
        "x@skinwise.test.vn",
        "skinwise.test@example.com",
        "a@notskinwise.testing",
        "real@notskinwise.test",
    ]
    gone = ["demo9@skinwise.test", "other@skinwise.test"]
    with engine.connect() as conn:
        outer = conn.begin()
        try:
            for email in kept + gone:
                conn.execute(text("INSERT INTO users (email) VALUES (:e)"), {"e": email})
            remove_demo_accounts(conn)
            left = set(
                conn.execute(
                    text("SELECT email FROM users WHERE email = ANY(:e)"), {"e": kept + gone}
                ).scalars()
            )
            assert left == set(kept)
        finally:
            outer.rollback()
