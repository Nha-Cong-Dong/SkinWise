"""The demo account (scripts.demo_account): a verified account holding the sample routine, so a
demo can sign in and show a check without typing anything.

Only demo@skinwise.test is ever created, changed or deleted here.
"""

import json
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Connection

from app import blog, product_photos
from app.accounts import POLICY_VERSION, PURPOSE
from app.rules import load_product_groups
from app.schemas import StoredRoutineData

DEMO_EMAIL = "demo@skinwise.test"
DEMO_HANDLE = "skinwise.demo"
EVERY_DAY = list(range(7))  # 0 = Monday, as in frontend ALL_DAYS

# Mirrors SAMPLE_STEPS in frontend/src/routine.ts (sampleRoutine): keep the two in step.
SAMPLE_STEPS: list[tuple[str, str]] = [
    ("vichy-liftactiv-vitamin-c-15-serum", "AM"),
    ("la-roche-posay-anthelios-uvmune-400-anti-dark-spots-fluid-spf50", "AM"),
    ("vichy-normaderm-probio-bha-serum", "PM"),
    ("vichy-liftactiv-b3-pure-retinol-night-cream", "PM"),
]


def _demo_only(email: str) -> str:
    if email != DEMO_EMAIL or not email.endswith("@skinwise.test"):  # never a real address
        raise ValueError(email)
    return email


def sample_routine(conn: Connection) -> dict[str, Any]:
    """The sample routine as frontend/src/sync.ts stores it (PUT /me/routine, camelCase)."""
    slugs = list(dict.fromkeys(slug for slug, _ in SAMPLE_STEPS))
    products = {
        r.slug: r
        for r in conn.execute(
            text("SELECT id, slug, brand, name FROM products WHERE slug = ANY(:s)"), {"s": slugs}
        )
    }
    if missing := [s for s in slugs if s not in products]:
        raise ValueError(f"unknown product slugs (run scripts.seed first?): {missing}")
    groups = load_product_groups(conn, [products[s].id for s in slugs])
    data = {
        "products": [
            {
                "key": f"p{products[s].id}",  # productKeyFor() in routine.ts
                "name": products[s].name,
                "brand": products[s].brand,
                "productId": products[s].id,
                "inci": None,
                "groups": sorted(groups[products[s].id]),
                "notices": [],
            }
            for s in slugs
        ],
        "entries": [
            {
                "id": str(uuid.uuid4()),
                "productKey": f"p{products[slug].id}",
                "session": session,
                "days": EVERY_DAY,
            }
            for slug, session in SAMPLE_STEPS
        ],
    }
    # Same validation and output as PUT /me/routine.
    return StoredRoutineData.model_validate(data).model_dump(by_alias=True)


def remove_demo_account(conn: Connection, files: list[str] | None = None) -> bool:
    """Delete the demo account (sessions, consents, routine, profile and blog writing cascade;
    others' replies to its comments stay under an empty frame, as for any deleted account).
    The names of its blog images and product photos are added to `files`, to remove from disk
    after the commit."""
    email = _demo_only(DEMO_EMAIL)
    conn.execute(text("DELETE FROM email_tokens WHERE email = :e"), {"e": email})
    user_id = conn.execute(
        text("SELECT id::text FROM users WHERE email = :e"), {"e": email}
    ).scalar_one_or_none()
    if user_id is None:
        return False
    if files is not None:
        files += blog.image_files_of(conn, user_id) + product_photos.files_of(conn, user_id)
    blog.keep_threads_of(conn, user_id)
    conn.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})
    blog.after_account_deletion(conn)
    return True


@dataclass(frozen=True)
class DemoAccount:
    user_id: str
    created: bool
    handle: str
    routine_version: int


def ensure_demo_account(conn: Connection, password_hash: Any) -> DemoAccount:
    """Create the demo account, or bring an existing one up to date: verified, consent to the
    current policy, a handle, and the sample routine (replacing whatever routine it had).

    `password_hash` is called only when the account has to be created, so re-running the
    script does not ask for the password again.
    """
    email = _demo_only(DEMO_EMAIL)
    user_id = conn.execute(
        text("SELECT id::text FROM users WHERE email = :e"), {"e": email}
    ).scalar_one_or_none()
    created = user_id is None
    if created:
        user_id = conn.execute(
            text(
                "INSERT INTO users (email, password_hash, email_verified_at) "
                "VALUES (:e, :h, now()) RETURNING id::text"
            ),
            {"e": email, "h": password_hash()},
        ).scalar_one()
    else:
        conn.execute(
            text(
                "UPDATE users SET email_verified_at = coalesce(email_verified_at, now()), "
                "pending_policy_version = NULL WHERE id = :id"
            ),
            {"id": user_id},
        )
    conn.execute(
        text(
            "INSERT INTO consents (user_id, purpose, policy_version) VALUES (:id, :p, :v) "
            "ON CONFLICT DO NOTHING"
        ),
        {"id": user_id, "p": PURPOSE, "v": POLICY_VERSION},
    )

    profile = blog.get_profile(conn, user_id)
    if profile is None:
        handle, n = DEMO_HANDLE, 1
        while blog.handle_taken(conn, handle, user_id):
            handle, n = f"{DEMO_HANDLE}{n}", n + 1
        blog.put_profile(conn, user_id, handle, None)
    else:
        handle = profile.handle

    version = conn.execute(
        text(
            """
            INSERT INTO user_routines (user_id, data, version) VALUES (:id, CAST(:data AS jsonb), 1)
            ON CONFLICT (user_id) DO UPDATE
              SET data = excluded.data, version = user_routines.version + 1, updated_at = now()
            RETURNING version
            """
        ),
        {"id": user_id, "data": json.dumps(sample_routine(conn))},
    ).scalar_one()
    return DemoAccount(user_id, created, handle, version)
