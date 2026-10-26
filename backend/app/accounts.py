"""User accounts: sign-in by an emailed link, sessions, and the routine kept for sync.

Design and legal obligations: plan/h-accounts.md. Only the email and the routine are kept.
Sign-in tokens and session ids are random; only their sha256 is stored, so a leaked database
cannot be replayed. Not open to real users until the legal questions there are answered.
"""

import hashlib
import json
import re
import secrets
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

LINK_TTL = timedelta(minutes=15)
SESSION_TTL = timedelta(days=30)
# The privacy policy the sign-in form shows (frontend PolicyText). A new version asks again.
POLICY_VERSION = "2026-10-26-draft"
PURPOSE = "account"  # sign in, and keep the routine for use on several devices
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s.]+$")
MAX_EMAIL = 254

Db = Session | Connection


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def normalize_email(raw: str) -> str | None:
    """Trimmed and lower case, or None if it does not look like an address. Gmail dots and
    "+tags" are kept: they may be different mailboxes elsewhere."""
    email = raw.strip().lower()
    return email if len(email) <= MAX_EMAIL and _EMAIL.match(email) else None


# --- Rate limits: in memory, per process. Enough for one server; nothing about the requester
# outlives the window. ---

_LIMITS = {"email": (3, 3600.0), "ip": (10, 3600.0)}  # requests per window (seconds)
_recent: dict[str, deque[float]] = defaultdict(deque)


def allow_link_request(email: str, ip: str | None) -> bool:
    now = time.monotonic()
    keys = [("email", email)] + ([("ip", ip)] if ip else [])
    for kind, value in keys:
        limit, window = _LIMITS[kind]
        times = _recent[f"{kind}:{value}"]
        while times and now - times[0] > window:
            times.popleft()
        if len(times) >= limit:
            return False
    for kind, value in keys:
        _recent[f"{kind}:{value}"].append(now)
    return True


def reset_rate_limits() -> None:
    _recent.clear()


# --- Sign-in links and sessions ---


def create_login_token(db: Db, email: str) -> str:
    """A single-use sign-in token for this address. Old links are cleaned up here."""
    db.execute(text("DELETE FROM login_tokens WHERE expires_at < now() - interval '1 day'"))
    token = secrets.token_urlsafe(32)
    db.execute(
        text(
            "INSERT INTO login_tokens (token_hash, email, policy_version, expires_at) "
            "VALUES (:hash, :email, :policy, :expires)"
        ),
        {
            "hash": _hash(token),
            "email": email,
            "policy": POLICY_VERSION,
            "expires": datetime.now(UTC) + LINK_TTL,
        },  # fmt: skip
    )
    return token


@dataclass(frozen=True)
class User:
    id: str
    email: str
    created_at: datetime


def redeem_login_token(db: Db, token: str) -> User | None:
    """The user the link signs in, creating them and recording the consent given when asking
    for the link. None if the token is unknown, expired or already used."""
    row = db.execute(
        text(
            "UPDATE login_tokens SET used_at = now() "
            "WHERE token_hash = :hash AND used_at IS NULL AND expires_at > now() "
            "RETURNING email, policy_version"
        ),
        {"hash": _hash(token)},
    ).first()
    if row is None:
        return None
    user = db.execute(
        text(
            "INSERT INTO users (email) VALUES (:email) "
            "ON CONFLICT (email) DO UPDATE SET last_seen_at = now() "
            "RETURNING id::text, email, created_at"
        ),
        {"email": row.email},
    ).one()
    db.execute(
        text(
            "INSERT INTO consents (user_id, purpose, policy_version) "
            "VALUES (:id, :purpose, :policy) ON CONFLICT DO NOTHING"
        ),
        {"id": user.id, "purpose": PURPOSE, "policy": row.policy_version},
    )
    return User(*user)


def create_session(db: Db, user_id: str) -> str:
    db.execute(text("DELETE FROM user_sessions WHERE expires_at < now()"))
    session_id = secrets.token_urlsafe(32)
    db.execute(
        text(
            "INSERT INTO user_sessions (id_hash, user_id, expires_at) VALUES (:hash, :id, :expires)"
        ),
        {"hash": _hash(session_id), "id": user_id, "expires": datetime.now(UTC) + SESSION_TTL},
    )
    return session_id


def session_user(db: Db, session_id: str) -> User | None:
    """The signed-in user, or None. Using a session extends it (30 days from the last use)."""
    row = db.execute(
        text(
            """
            UPDATE user_sessions s SET expires_at = :expires
            FROM users u
            WHERE s.id_hash = :hash AND s.expires_at > now() AND u.id = s.user_id
            RETURNING u.id::text, u.email, u.created_at
            """
        ),
        {"hash": _hash(session_id), "expires": datetime.now(UTC) + SESSION_TTL},
    ).first()
    if row is None:
        return None
    db.execute(text("UPDATE users SET last_seen_at = now() WHERE id = :id"), {"id": row.id})
    return User(*row)


def end_session(db: Db, session_id: str) -> None:
    db.execute(text("DELETE FROM user_sessions WHERE id_hash = :hash"), {"hash": _hash(session_id)})


def end_all_sessions(db: Db, user_id: str) -> None:
    db.execute(text("DELETE FROM user_sessions WHERE user_id = :id"), {"id": user_id})


def consents(db: Db, user_id: str) -> list[dict[str, Any]]:
    rows = db.execute(
        text(
            "SELECT purpose, policy_version, granted_at FROM consents "
            "WHERE user_id = :id ORDER BY granted_at"
        ),
        {"id": user_id},
    )
    return [dict(r._mapping) for r in rows]


# --- The routine kept for sync ---


@dataclass(frozen=True)
class StoredRoutine:
    data: dict[str, Any] | None  # None: nothing stored yet
    version: int  # 0 when nothing is stored
    updated_at: datetime | None


def get_routine(db: Db, user_id: str) -> StoredRoutine:
    row = db.execute(
        text("SELECT data, version, updated_at FROM user_routines WHERE user_id = :id"),
        {"id": user_id},
    ).first()
    return (
        StoredRoutine(row.data, row.version, row.updated_at)
        if row
        else StoredRoutine(None, 0, None)
    )


def put_routine(
    db: Db, user_id: str, data: dict[str, Any], base_version: int
) -> StoredRoutine | None:
    """Store the routine if no other device wrote since `base_version`; return the new
    version, or None on a conflict (the caller then reads what is stored)."""
    payload = json.dumps(data)
    if base_version == 0:
        row = db.execute(
            text(
                "INSERT INTO user_routines (user_id, data, version) "
                "VALUES (:id, CAST(:data AS jsonb), 1) "
                "ON CONFLICT (user_id) DO NOTHING RETURNING data, version, updated_at"
            ),
            {"id": user_id, "data": payload},
        ).first()
    else:
        row = db.execute(
            text(
                """
                UPDATE user_routines
                SET data = CAST(:data AS jsonb), version = version + 1, updated_at = now()
                WHERE user_id = :id AND version = :base
                RETURNING data, version, updated_at
                """
            ),
            {"id": user_id, "data": payload, "base": base_version},
        ).first()
    return StoredRoutine(row.data, row.version, row.updated_at) if row else None


# --- Rights of the user (Law 91/2025/QH15 Art. 4): export and deletion ---


def export_user(db: Db, user: User) -> dict[str, Any]:
    stored = get_routine(db, user.id)
    return {
        "email": user.email,
        "created_at": user.created_at.isoformat(),
        "consents": [
            {**c, "granted_at": c["granted_at"].isoformat()} for c in consents(db, user.id)
        ],
        "routine": stored.data,
        "routine_updated_at": stored.updated_at.isoformat() if stored.updated_at else None,
    }


def delete_user(db: Db, user: User) -> None:
    """Everything about the user goes: sessions, routine and consents cascade; pending sign-in
    links for the address are removed too."""
    db.execute(text("DELETE FROM login_tokens WHERE email = :email"), {"email": user.email})
    db.execute(text("DELETE FROM users WHERE id = :id"), {"id": user.id})
