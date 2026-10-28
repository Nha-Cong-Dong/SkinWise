"""Reviewer accounts and sign-in sessions for the review page.

Reviewers are added from the command line (scripts.reviewers); there is no sign-up. A session
is a random bearer token; only its sha256 is stored, so a leaked database cannot be replayed.
"""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.passwords import DUMMY_HASH, check_password, hash_password

SESSION_TTL = timedelta(hours=12)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def set_reviewer(db: Session | Connection, name: str, password: str) -> None:
    """Add a reviewer, or change their password. Existing sessions stay valid."""
    db.execute(
        text(
            """
            INSERT INTO reviewers (name, password_hash) VALUES (:name, :hash)
            ON CONFLICT (name) DO UPDATE SET password_hash = excluded.password_hash
            """
        ),
        {"name": name, "hash": hash_password(password)},
    )


def remove_reviewer(db: Session | Connection, name: str) -> bool:
    """Remove a reviewer and sign them out everywhere."""
    result = db.execute(text("DELETE FROM reviewers WHERE name = :name"), {"name": name})
    return result.rowcount > 0


def list_reviewers(db: Session | Connection) -> list[str]:
    return list(db.execute(text("SELECT name FROM reviewers ORDER BY name")).scalars())


@dataclass(frozen=True)
class SignIn:
    token: str
    name: str
    expires_at: datetime


def sign_in(db: Session | Connection, name: str, password: str) -> SignIn | None:
    stored = db.execute(
        text("SELECT password_hash FROM reviewers WHERE name = :name"), {"name": name}
    ).scalar_one_or_none()
    if not check_password(password, stored or DUMMY_HASH) or stored is None:
        return None
    db.execute(text("DELETE FROM reviewer_sessions WHERE expires_at < now()"))
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + SESSION_TTL
    db.execute(
        text(
            "INSERT INTO reviewer_sessions (token_hash, reviewer, expires_at) "
            "VALUES (:hash, :name, :expires_at)"
        ),
        {"hash": _token_hash(token), "name": name, "expires_at": expires_at},
    )
    return SignIn(token, name, expires_at)


def session_reviewer(db: Session | Connection, token: str) -> str | None:
    """The reviewer signed in with this token, or None if it is unknown or expired."""
    return db.execute(
        text(
            "SELECT reviewer FROM reviewer_sessions WHERE token_hash = :hash AND expires_at > now()"
        ),
        {"hash": _token_hash(token)},
    ).scalar_one_or_none()


def sign_out(db: Session | Connection, token: str) -> None:
    db.execute(
        text("DELETE FROM reviewer_sessions WHERE token_hash = :hash"), {"hash": _token_hash(token)}
    )
