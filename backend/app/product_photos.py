"""Users' own photos of products they typed or pasted in (not catalogue products).

Stored like blog photos (app/images.py: WebP without metadata, random file names in UPLOAD_DIR)
and seen by their owner only. The routine keeps the photo's id as `photoId` on the product; the
frontend keeps one photo per product (replacing deletes the old one). Photos the routine stored
on the server has not referred to for ORPHAN_DAYS are removed by scripts.purge. Display only:
nothing here reaches the warning engine.
"""

from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.accounts import RateLimit

Db = Session | Connection

MAX_PER_ACCOUNT = 60
UPLOADS_PER_HOUR = 30
ORPHAN_DAYS = 7

# In memory, per process, like the blog limits; the key is the user id.
_uploads = RateLimit({"email": (UPLOADS_PER_HOUR, 3600.0)})


def allow_upload(user_id: str) -> bool:
    """Count one upload; False once the user reached the hourly limit."""
    if _uploads.blocked(user_id, None):
        return False
    _uploads.record(user_id, None)
    return True


def reset_limit() -> None:
    _uploads.clear()


def photo_url(photo_id: int) -> str:
    return f"/me/product-photos/{photo_id}"


def lock_owner(db: Db, owner: str) -> None:
    """Hold the owner's row until the transaction ends, so two uploads at once cannot both
    pass the MAX_PER_ACCOUNT check."""
    db.execute(text("SELECT 1 FROM users WHERE id = :o FOR UPDATE"), {"o": owner})


def count_of(db: Db, owner: str) -> int:
    return db.execute(
        text("SELECT count(*) FROM user_product_photos WHERE owner_id = :o"), {"o": owner}
    ).scalar_one()


def add_photo(db: Db, owner: str, file_name: str, width: int, height: int) -> int:
    return db.execute(
        text(
            "INSERT INTO user_product_photos (owner_id, file_name, width, height) "
            "VALUES (:o, :f, :w, :h) RETURNING id"
        ),
        {"o": owner, "f": file_name, "w": width, "h": height},
    ).scalar_one()


def file_of(db: Db, photo_id: int, owner: str) -> str | None:
    """The file of the owner's photo; None for an unknown id or someone else's photo."""
    return db.execute(
        text("SELECT file_name FROM user_product_photos WHERE id = :id AND owner_id = :o"),
        {"id": photo_id, "o": owner},
    ).scalar_one_or_none()


def delete_photo(db: Db, photo_id: int, owner: str) -> str | None:
    """Delete the owner's photo; returns its file to remove after the commit, None if there
    was no such photo of theirs."""
    return db.execute(
        text(
            "DELETE FROM user_product_photos WHERE id = :id AND owner_id = :o RETURNING file_name"
        ),
        {"id": photo_id, "o": owner},
    ).scalar_one_or_none()


def files_of(db: Db, owner: str) -> list[str]:
    """Every photo file of the user, to remove after their account is deleted."""
    return list(
        db.execute(
            text("SELECT file_name FROM user_product_photos WHERE owner_id = :o"), {"o": owner}
        ).scalars()
    )


def export_photos(db: Db, owner: str) -> list[dict[str, Any]]:
    rows = db.execute(
        text(
            "SELECT id, width, height, created_at FROM user_product_photos "
            "WHERE owner_id = :o ORDER BY id"
        ),
        {"o": owner},
    )
    return [
        {"id": r.id, "width": r.width, "height": r.height, "created_at": r.created_at.isoformat()}
        for r in rows
    ]


# A photo is in use while the owner's routine on the server has a product with its photoId.
_REFERENCED = """
    EXISTS (
      SELECT 1 FROM user_routines r,
        jsonb_array_elements(coalesce(r.data -> 'products', '[]'::jsonb)) AS p
      WHERE r.user_id = ph.owner_id AND p ->> 'photoId' = ph.id::text)
"""


def purge_orphans(db: Db) -> list[str]:
    """Mark the photos in use as seen now, and remove those not seen for ORPHAN_DAYS; returns
    the files to remove after the commit."""
    db.execute(text(f"UPDATE user_product_photos ph SET last_seen_at = now() WHERE {_REFERENCED}"))
    return list(
        db.execute(
            text(
                "DELETE FROM user_product_photos "
                "WHERE last_seen_at < now() - make_interval(days => :d) RETURNING file_name"
            ),
            {"d": ORPHAN_DAYS},
        ).scalars()
    )
