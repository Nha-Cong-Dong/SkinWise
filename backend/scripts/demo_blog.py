"""Made-up community reviews for the blog demo, from data/demo_blog.toml:

uv run python -m scripts.demo_blog           # create what is missing; safe to run again
uv run python -m scripts.demo_blog --reset   # delete the @skinwise.test blog accounts, then create

Five verified accounts demo1..demo5@skinwise.test share one password, asked when an account
has to be created (or taken from DEMO_BLOG_PASSWORD). Only addresses at @skinwise.test are ever
created or deleted, and --reset keeps demo@skinwise.test (the account of scripts.demo_account).
Posts already there (same author and title) are left as they are.
"""

import getpass
import os
import sys
import tomllib
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Connection

from app import blog, images
from app.blog_api import _post_data
from app.console import use_utf8_output
from app.db import get_engine, init_schema
from app.demo_account import DEMO_EMAIL
from app.passwords import hash_password, password_problem
from app.schemas import PostIn

DOMAIN = "@skinwise.test"
DATA = Path(__file__).resolve().parent.parent / "data" / "demo_blog.toml"


def demo_email(n: int) -> str:
    email = f"demo{n}{DOMAIN}"
    if not email.endswith(DOMAIN):  # never touch a real address
        raise ValueError(email)
    return email


def remove_demo_accounts(conn: Connection) -> tuple[int, list[str]]:
    """Delete every @skinwise.test account except demo@skinwise.test (scripts.demo_account),
    with what cascades from it and its email links; returns the count and the image files to
    remove after the commit."""
    pattern = "%" + DOMAIN.replace("_", r"\_")
    match = "u.email LIKE :p AND u.email <> :keep"
    params = {"p": pattern, "keep": DEMO_EMAIL}
    files = list(
        conn.execute(
            text(
                "SELECT i.file_name FROM blog_images i JOIN users u ON u.id = i.owner_id "
                f"WHERE {match} UNION ALL "
                "SELECT ph.file_name FROM user_product_photos ph "
                f"JOIN users u ON u.id = ph.owner_id WHERE {match}"
            ),
            params,
        ).scalars()
    )
    # Others' replies to demo comments stay, under an empty frame (as when deleting an account).
    leaving = conn.execute(text(f"SELECT u.id::text FROM users u WHERE {match}"), params)
    for user_id in leaving.scalars().all():
        blog.keep_threads_of(conn, user_id)
    emails = list(
        conn.execute(text(f"DELETE FROM users u WHERE {match} RETURNING u.email"), params).scalars()
    )
    # email_tokens has no foreign key to users (links exist before the account is verified).
    conn.execute(text("DELETE FROM email_tokens WHERE email = ANY(:e)"), {"e": emails})
    blog.after_account_deletion(conn)
    return len(emails), files


def ask_password() -> str:
    password = os.environ.get("DEMO_BLOG_PASSWORD") or getpass.getpass(
        "Password for the demo accounts: "
    )
    if problem := password_problem(password, ""):
        raise SystemExit(f"Password refused: {problem}")
    if "DEMO_BLOG_PASSWORD" not in os.environ and getpass.getpass("Again: ") != password:
        raise SystemExit("Passwords do not match.")
    return password


def free_handle(conn: Connection, wanted: str, user_id: str) -> str:
    """`wanted`, or `wanted` with a suffix when another (non-demo) user already has it."""
    handle, n = wanted, 1
    while blog.handle_taken(conn, handle, user_id):
        handle = f"{wanted[: 30 - len(f'_demo{n}')]}_demo{n}"
        n += 1
    return handle


def ensure_accounts(conn: Connection, accounts: list[dict[str, Any]]) -> dict[int, str]:
    """Account number -> user id. Creates missing accounts (verified) and profiles."""
    ids: dict[int, str] = {}
    password_hash: str | None = None
    for account in accounts:
        email = demo_email(account["n"])
        user_id = conn.execute(
            text("SELECT id::text FROM users WHERE email = :e"), {"e": email}
        ).scalar_one_or_none()
        if user_id is None:
            if password_hash is None:
                password_hash = hash_password(ask_password())
            user_id = conn.execute(
                text(
                    "INSERT INTO users (email, password_hash, email_verified_at) "
                    "VALUES (:e, :h, now()) RETURNING id::text"
                ),
                {"e": email, "h": password_hash},
            ).scalar_one()
            print(f"Created {email}")
        if blog.get_profile(conn, user_id) is None:
            handle = free_handle(conn, account["handle"], user_id)
            if handle != account["handle"]:
                print(f"Handle {account['handle']} is taken; {email} uses {handle}")
            blog.put_profile(conn, user_id, handle, account.get("skin_type"))
        ids[account["n"]] = user_id
    return ids


def routine_file(steps: list[list[Any]], products: dict[str, Any]) -> dict[str, Any]:
    """A routine in the shape of a frontend routine file (share.ts)."""
    keys: dict[str, str] = {}
    for slug, _, _ in steps:
        keys.setdefault(slug, f"p{len(keys) + 1}")
    return {
        "format": "skinwise-routine",
        "version": 1,
        "products": [
            {"key": key, "name": products[slug].name, "productId": products[slug].id}
            for slug, key in keys.items()
        ],
        "entries": [
            {"productKey": keys[slug], "session": session, "days": days}
            for slug, session, days in steps
        ],
    }


def create_posts(conn: Connection, posts: list[dict[str, Any]], users: dict[int, str]) -> int:
    slugs = {s for p in posts for s in p["products"]} | {
        step[0] for p in posts for step in p.get("routine", [])
    }
    products = {
        r.slug: r
        for r in conn.execute(
            text("SELECT id, slug, name FROM products WHERE slug = ANY(:s)"), {"s": list(slugs)}
        )
    }
    if missing := slugs - products.keys():
        raise SystemExit(f"Unknown product slugs (run scripts.seed first?): {sorted(missing)}")
    created = 0
    for p in posts:
        author = users[p["author"]]
        post_id = conn.execute(
            text("SELECT id FROM blog_posts WHERE author_id = :a AND title = :t"),
            {"a": author, "t": p["title"]},
        ).scalar_one_or_none()
        if post_id is not None:
            ensure_comments(conn, post_id, p, users)
            continue
        body = PostIn.model_validate(
            {
                "title": p["title"],
                "body": p["body"],
                "rating": p.get("rating"),
                "skin_type": p.get("skin_type"),
                "disclosure": p.get("disclosure", "none"),
                "products": [{"product_id": products[s].id} for s in p["products"]],
                "routine": routine_file(p["routine"], products) if p.get("routine") else None,
            }
        )
        post_id = blog.create_post(conn, author, _post_data(body))
        for n in p.get("likes", []):
            blog.set_like(conn, post_id, users[n], True)
        ensure_comments(conn, post_id, p, users)
        created += 1
    return created


def ensure_comments(
    conn: Connection, post_id: int, post: dict[str, Any], users: dict[int, str]
) -> None:
    """Add the post's comments and replies that are not there yet (same author and text),
    then the comment likes. A comment [n, text, k] replies to comment number k (from 1) of
    the same post; comment_likes = [[k, [account numbers]]]."""
    ids: list[int] = []
    for n, body, *answered in post.get("comments", []):
        comment_id = conn.execute(
            text(
                "SELECT id FROM blog_comments WHERE post_id = :p AND author_id = :a "
                "AND body = :b AND deleted_at IS NULL"
            ),
            {"p": post_id, "a": users[n], "b": body},
        ).scalar_one_or_none()
        if comment_id is None:
            parent = ids[answered[0] - 1] if answered else None
            comment_id = blog.add_comment(conn, post_id, users[n], body, parent)
        ids.append(comment_id)
    for k, likers in post.get("comment_likes", []):
        for n in likers:
            blog.set_comment_like(conn, ids[k - 1], users[n], True)


def main(args: list[str]) -> int:
    if any(a not in ("--reset",) for a in args):
        print(__doc__)
        return 1
    data = tomllib.loads(DATA.read_text(encoding="utf-8"))
    engine = get_engine()
    init_schema(engine)
    if "--reset" in args:
        with engine.begin() as conn:
            removed, files = remove_demo_accounts(conn)
        images.delete_files(files)
        print(
            f"Removed {removed} {DOMAIN} blog accounts and everything they wrote "
            f"(kept {DEMO_EMAIL})."
        )
    with engine.begin() as conn:
        users = ensure_accounts(conn, data["account"])
        created = create_posts(conn, data["post"], users)
    print(f"{created} demo posts created ({len(data['post']) - created} already there).")
    return 0


if __name__ == "__main__":
    use_utf8_output()
    sys.exit(main(sys.argv[1:]))
