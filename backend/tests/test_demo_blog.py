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


def test_reset_keeps_the_demo_account_and_drops_email_links(engine: Engine) -> None:
    from app.demo_account import DEMO_EMAIL
    from scripts.demo_blog import remove_demo_accounts

    with engine.connect() as conn:
        outer = conn.begin()
        try:
            for email in [DEMO_EMAIL, "demo7@skinwise.test"]:
                conn.execute(text("INSERT INTO users (email) VALUES (:e)"), {"e": email})
                conn.execute(
                    text(
                        "INSERT INTO email_tokens (token_hash, email, purpose, expires_at) "
                        "VALUES (:h, :e, 'verify', now() + interval '1 day')"
                    ),
                    {"h": f"hash-{email}", "e": email},
                )
            removed, _ = remove_demo_accounts(conn)
            assert removed >= 1
            users = set(conn.execute(text("SELECT email FROM users")).scalars())
            assert DEMO_EMAIL in users and "demo7@skinwise.test" not in users
            tokens = set(conn.execute(text("SELECT email FROM email_tokens")).scalars())
            assert DEMO_EMAIL in tokens and "demo7@skinwise.test" not in tokens
        finally:
            outer.rollback()


def test_demo_replies_point_to_earlier_comments() -> None:
    data = tomllib.loads(DATA.read_text(encoding="utf-8"))
    accounts = {a["n"] for a in data["account"]}
    for post in data["post"]:
        comments = post.get("comments", [])
        for i, (n, _, *answered) in enumerate(comments, start=1):
            assert n in accounts
            assert not answered or 1 <= answered[0] < i, post["title"]
        for k, likers in post.get("comment_likes", []):
            assert 1 <= k <= len(comments) and set(likers) <= accounts, post["title"]


def test_demo_posts_get_replies_and_comment_likes_once(engine: Engine, monkeypatch) -> None:
    from scripts.demo_blog import create_posts

    monkeypatch.setenv("DEMO_BLOG_PASSWORD", "mat-khau-demo-thu")
    data = tomllib.loads(DATA.read_text(encoding="utf-8"))
    with engine.connect() as conn:
        outer = conn.begin()
        try:
            conn.execute(text("DELETE FROM users WHERE email LIKE '%@skinwise.test'"))
            users = ensure_accounts(conn, data["account"])
            create_posts(conn, data["post"], users)

            def counts() -> tuple[int, int, int]:
                return conn.execute(
                    text(
                        "SELECT (SELECT count(*) FROM blog_comments WHERE parent_id IS NOT NULL),"
                        " (SELECT count(*) FROM blog_comments WHERE reply_to_id IS NOT NULL),"
                        " (SELECT count(*) FROM blog_comment_likes)"
                    )
                ).one()

            first = counts()
            replies = sum(len(c) == 3 for p in data["post"] for c in p.get("comments", []))
            likes = sum(len(x) for p in data["post"] for _, x in p.get("comment_likes", []))
            assert first[0] == replies and first[1] >= 1 and first[2] == likes
            create_posts(conn, data["post"], users)  # again: nothing is added twice
            assert counts() == first
        finally:
            outer.rollback()


def _thread(conn, demo_email: str) -> tuple[int, int]:  # noqa: ANN001
    """A post by a real user, a comment by the demo account and a real user's reply to it;
    returns (comment id, reply id)."""
    real = conn.execute(
        text("INSERT INTO users (email) VALUES ('that-tu-that@example.com') RETURNING id")
    ).scalar_one()
    demo = conn.execute(
        text("INSERT INTO users (email) VALUES (:e) RETURNING id"), {"e": demo_email}
    ).scalar_one()
    post = conn.execute(
        text(
            "INSERT INTO blog_posts (author_id, title, body) VALUES (:u, 'Bài thật', 'Nội dung') "
            "RETURNING id"
        ),
        {"u": real},
    ).scalar_one()

    def comment(author, body: str, parent: int | None) -> int:  # noqa: ANN001
        return conn.execute(
            text(
                "INSERT INTO blog_comments (post_id, author_id, body, parent_id) "
                "VALUES (:p, :a, :b, :parent) RETURNING id"
            ),
            {"p": post, "a": author, "b": body, "parent": parent},
        ).scalar_one()

    root = comment(demo, "Bình luận demo", None)
    return root, comment(real, "Trả lời của người thật", root)


@pytest.mark.parametrize("which", ["blog", "account"])
def test_demo_reset_keeps_real_users_replies(engine: Engine, which: str) -> None:
    from app.demo_account import DEMO_EMAIL, remove_demo_account
    from scripts.demo_blog import remove_demo_accounts

    with engine.connect() as conn:
        outer = conn.begin()
        try:
            if which == "blog":
                root, reply = _thread(conn, "demo8@skinwise.test")
                remove_demo_accounts(conn)
            else:
                conn.execute(text("DELETE FROM users WHERE email = :e"), {"e": DEMO_EMAIL})
                root, reply = _thread(conn, DEMO_EMAIL)
                assert remove_demo_account(conn)
            rows = {
                r.id: r
                for r in conn.execute(
                    text(
                        "SELECT id, body, author_id, deleted_at FROM blog_comments "
                        "WHERE id = ANY(:ids)"
                    ),
                    {"ids": [root, reply]},
                )
            }
            assert reply in rows and rows[reply].body == "Trả lời của người thật"
            frame = rows[root]
            assert frame.body == "" and frame.author_id is None and frame.deleted_at is not None
        finally:
            outer.rollback()
