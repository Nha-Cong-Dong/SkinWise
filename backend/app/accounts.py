"""User accounts: sign-in by email and password, email verification, password reset, sessions,
and the routine kept for sync.

Design and legal obligations: plan/h-accounts.md. Only the email, a scrypt hash of the password
and the routine are kept. Link tokens and session ids are random; only their sha256 is stored,
so a leaked database cannot be replayed. Not open to real users until the legal questions
there are answered.
"""

import hashlib
import json
import re
import secrets
import time
from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import Enum
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.passwords import DUMMY_HASH, check_password, hash_password

TOKEN_TTL = {"verify": timedelta(hours=24), "reset": timedelta(minutes=30)}
UNVERIFIED_TTL = timedelta(days=7)  # unverified accounts are removed after this
SESSION_TTL = timedelta(days=30)
# The privacy policy the sign-in form shows (frontend PolicyText). A new version asks again.
POLICY_VERSION = "2026-10-26-draft"
PURPOSE = "account"  # sign in, and keep the routine for use on several devices
# One plain address: no characters that could make a header or the SMTP envelope name
# several recipients ("a,b@x", "a <b@x>", quotes, brackets).
_NOT_IN_ADDRESS = r'@\s,;<>()\[\]"\\:'
_EMAIL = re.compile(rf"^[^{_NOT_IN_ADDRESS}]+@[^{_NOT_IN_ADDRESS}]+\.[^.{_NOT_IN_ADDRESS}]+$")
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


class RateLimit:
    """At most `limit` events per `window` seconds for each key (an email or an IP). Addresses
    are kept only as sha256, and a key goes as soon as its window holds no events."""

    def __init__(self, limits: dict[str, tuple[int, float]]) -> None:
        self._limits = limits  # kind -> (limit, window in seconds)
        self._recent: dict[str, deque[float]] = {}

    def _keys(self, email: str, ip: str | None) -> list[tuple[str, str]]:
        keys = [("email", f"email:{_hash(email)}")]
        return keys + ([("ip", f"ip:{ip}")] if ip else [])

    def blocked(self, email: str, ip: str | None) -> bool:
        now = time.monotonic()
        blocked = False
        for kind, key in self._keys(email, ip):
            limit, window = self._limits[kind]
            times = self._recent.get(key)
            if times is None:
                continue
            while times and now - times[0] > window:
                times.popleft()
            if not times:
                del self._recent[key]
            elif len(times) >= limit:
                blocked = True
        return blocked

    def record(self, email: str, ip: str | None) -> None:
        now = time.monotonic()
        for _, key in self._keys(email, ip):
            self._recent.setdefault(key, deque()).append(now)

    def __len__(self) -> int:
        return len(self._recent)

    def clear(self) -> None:
        self._recent.clear()


# Every request that sends an email (register, resend verification, forgot password).
_email_requests = RateLimit({"email": (3, 3600.0), "ip": (10, 3600.0)})
# Wrong passwords only; a right one is not counted.
_failed_logins = RateLimit({"email": (5, 900.0), "ip": (20, 900.0)})


def allow_email_request(email: str, ip: str | None) -> bool:
    """Count a request to send an email; False once the address or IP asked too often."""
    if _email_requests.blocked(email, ip):
        return False
    _email_requests.record(email, ip)
    return True


def reset_rate_limits() -> None:
    _email_requests.clear()
    _failed_logins.clear()


# --- Accounts, email links and sessions ---


@dataclass(frozen=True)
class User:
    id: str
    email: str
    created_at: datetime


_USER_COLUMNS = "id::text, email, created_at"


def _new_email_token(
    db: Db,
    email: str,
    purpose: str,
    policy_version: str | None = None,
    password_hash: str | None = None,
) -> str:
    """A single-use link token. Old tokens are cleaned up here."""
    db.execute(text("DELETE FROM email_tokens WHERE expires_at < now() - interval '1 day'"))
    token = secrets.token_urlsafe(32)
    db.execute(
        text(
            "INSERT INTO email_tokens "
            "(token_hash, email, purpose, policy_version, password_hash, expires_at) "
            "VALUES (:hash, :email, :purpose, :policy, :password_hash, :expires)"
        ),
        {
            "hash": _hash(token),
            "email": email,
            "purpose": purpose,
            "policy": policy_version,
            "password_hash": password_hash,
            "expires": datetime.now(UTC) + TOKEN_TTL[purpose],
        },  # fmt: skip
    )
    return token


def _valid_email_token(db: Db, token: str, purpose: str) -> Any:
    """(email, policy_version, password_hash) of an unused, unexpired token, without using it."""
    return db.execute(
        text(
            "SELECT email, policy_version, password_hash FROM email_tokens "
            "WHERE token_hash = :hash AND purpose = :purpose "
            "AND used_at IS NULL AND expires_at > now()"
        ),
        {"hash": _hash(token), "purpose": purpose},
    ).first()


def _redeem_email_token(db: Db, token: str, purpose: str) -> Any:
    """Mark the token used; its (email, policy_version, password_hash), or None if unknown,
    expired or used (also when two requests race for it)."""
    return db.execute(
        text(
            "UPDATE email_tokens SET used_at = now() "
            "WHERE token_hash = :hash AND purpose = :purpose "
            "AND used_at IS NULL AND expires_at > now() "
            "RETURNING email, policy_version, password_hash"
        ),
        {"hash": _hash(token), "purpose": purpose},
    ).first()


def _revoke_email_tokens(db: Db, email: str, purpose: str) -> None:
    db.execute(
        text(
            "UPDATE email_tokens SET used_at = now() "
            "WHERE email = :email AND purpose = :purpose AND used_at IS NULL"
        ),
        {"email": email, "purpose": purpose},
    )


def _record_consent(db: Db, user_id: str, policy_version: str) -> None:
    db.execute(
        text(
            "INSERT INTO consents (user_id, purpose, policy_version) "
            "VALUES (:id, :purpose, :policy) ON CONFLICT DO NOTHING"
        ),
        {"id": user_id, "purpose": PURPOSE, "policy": policy_version},
    )


def _account_state(db: Db, email: str) -> Any:
    return db.execute(
        text(
            "SELECT id::text, password_hash, email_verified_at, pending_policy_version "
            "FROM users WHERE email = :email"
        ),
        {"email": email},
    ).first()


def register(db: Db, email: str, password: str, policy_version: str) -> str | None:
    """Create an unverified account, or replace the password of one that is still unverified,
    and return a verify token tied to this password. A verified address is left as it is: None.
    Earlier verify links stay valid, each only for the password it was sent with. Unverified
    accounts older than UNVERIFIED_TTL are removed here, unless a verify link sent to them is
    still usable (they registered again or asked for a new link)."""
    password_hash = hash_password(password)  # always, so every case takes as long
    db.execute(
        text(
            """
            DELETE FROM users u WHERE u.email_verified_at IS NULL
              AND u.created_at < now() - make_interval(days => :days)
              AND NOT EXISTS (
                SELECT 1 FROM email_tokens t
                WHERE t.email = u.email AND t.purpose = 'verify'
                  AND t.used_at IS NULL AND t.expires_at > now()
              )
            """
        ),
        {"days": UNVERIFIED_TTL.days},
    )
    row = db.execute(
        text(
            """
            INSERT INTO users (email, password_hash, pending_policy_version)
            VALUES (:email, :hash, :policy)
            ON CONFLICT (email) DO UPDATE
              SET password_hash = excluded.password_hash,
                  pending_policy_version = excluded.pending_policy_version
              WHERE users.email_verified_at IS NULL
            RETURNING id
            """
        ),
        {"email": email, "hash": password_hash, "policy": policy_version},
    ).first()
    if row is None:  # verified: nothing changes
        return None
    return _new_email_token(db, email, "verify", policy_version, password_hash)


def resend_verification(db: Db, email: str, password: str) -> str | None:
    """A new verify token, only for an unverified account whose (latest) password this is.
    Otherwise None and nothing is sent; an unknown address is checked against a dummy hash so
    it answers as slowly as a known one."""
    account = _account_state(db, email)
    stored = account.password_hash if account else None
    if not check_password(password, stored or DUMMY_HASH) or stored is None:
        return None
    if account.email_verified_at is not None or account.pending_policy_version is None:
        return None
    return _new_email_token(db, email, "verify", account.pending_policy_version, stored)


class VerifyOutcome(Enum):
    OK = "ok"
    INVALID_LINK = "invalid_link"  # unknown, expired or used; or the account is gone / verified
    WRONG_PASSWORD = "wrong_password"  # the link is kept
    LIMITED = "limited"  # too many wrong passwords for the address or IP


def verify_email(
    db: Db, token: str, password: str, ip: str | None
) -> tuple[VerifyOutcome, User | None]:
    """Verify the address with the link and the password of the registration that sent it.
    A wrong password counts as a failed sign-in and leaves the link usable. On success the
    account takes the link's password, the consent given when registering is recorded and
    every other session of the account ends."""
    link = _valid_email_token(db, token, "verify")
    if link is None:
        return VerifyOutcome.INVALID_LINK, None
    if _failed_logins.blocked(link.email, ip):
        return VerifyOutcome.LIMITED, None
    if not check_password(password, link.password_hash or DUMMY_HASH) or not link.password_hash:
        _failed_logins.record(link.email, ip)
        return VerifyOutcome.WRONG_PASSWORD, None
    redeemed = _redeem_email_token(db, token, "verify")
    if redeemed is None:
        return VerifyOutcome.INVALID_LINK, None
    account = _account_state(db, redeemed.email)
    if account is None or account.email_verified_at is not None:
        # Already verified (by another link or a reset): an older link must not bring back
        # the password it was sent with.
        return VerifyOutcome.INVALID_LINK, None
    user = db.execute(
        text(
            "UPDATE users SET password_hash = :hash, email_verified_at = now(), "
            "pending_policy_version = NULL, last_seen_at = now() "
            f"WHERE id = :id RETURNING {_USER_COLUMNS}"
        ),
        {"id": account.id, "hash": redeemed.password_hash},
    ).one()
    _record_consent(db, account.id, redeemed.policy_version)
    end_all_sessions(db, account.id)
    return VerifyOutcome.OK, User(*user)


@dataclass(frozen=True)
class LoginResult:
    user: User | None  # None: refused, for the reason below or a wrong email or password
    limited: bool = False
    unverified: bool = False


def login(db: Db, email: str | None, password: str, ip: str | None) -> LoginResult:
    """Check a password. Too many wrong ones for the address or IP block even a right one.
    An unknown address is checked against a dummy hash, so it answers as slowly as a known one."""
    key = email or "(not an address)"
    if _failed_logins.blocked(key, ip):
        return LoginResult(None, limited=True)
    account = _account_state(db, email) if email else None
    stored = account.password_hash if account else None
    if not check_password(password, stored or DUMMY_HASH) or stored is None:
        _failed_logins.record(key, ip)
        return LoginResult(None)
    if account.email_verified_at is None:
        return LoginResult(None, unverified=True)
    user = db.execute(
        text(f"UPDATE users SET last_seen_at = now() WHERE id = :id RETURNING {_USER_COLUMNS}"),
        {"id": account.id},
    ).one()
    return LoginResult(User(*user))


def create_reset_token(db: Db, email: str) -> str | None:
    """A password reset token, or None if no verified account has this address. An unverified
    account gets none: whoever registered it may not own the mailbox, and a reset must not
    stand in for the verify link (nor record the consent they gave)."""
    account = _account_state(db, email)
    if account is None or account.email_verified_at is None:
        return None
    return _new_email_token(db, email, "reset")


def reset_target(db: Db, token: str) -> str | None:
    """The address a reset token is for, without using it up (to check the new password)."""
    link = _valid_email_token(db, token, "reset")
    return link.email if link else None


def reset_password(db: Db, token: str, password: str) -> User | None:
    """Set a new password with a reset link; every session and every other reset link of the
    account ends. None if the token is unknown, expired or used, or the account is gone or not
    verified (reset links are only sent to verified accounts)."""
    redeemed = _redeem_email_token(db, token, "reset")
    if redeemed is None:
        return None
    before = _account_state(db, redeemed.email)
    if before is None or before.email_verified_at is None:
        return None
    user = db.execute(
        text(
            "UPDATE users SET password_hash = :hash, last_seen_at = now() "
            f"WHERE id = :id RETURNING {_USER_COLUMNS}"
        ),
        {"id": before.id, "hash": hash_password(password)},
    ).one()
    _revoke_email_tokens(db, redeemed.email, "reset")
    end_all_sessions(db, before.id)
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
    """Everything about the user goes: sessions, routine and consents cascade; pending verify
    and reset links for the address are removed too. The export never includes the password
    hash."""
    db.execute(text("DELETE FROM email_tokens WHERE email = :email"), {"email": user.email})
    db.execute(text("DELETE FROM users WHERE id = :id"), {"id": user.id})
