"""Password hashing shared by user accounts and reviewers: scrypt with a random salt.

Neither a password nor its hash is ever logged.
"""

import hashlib
import hmac
import secrets

# scrypt cost: ~50 ms per check, which makes guessing slow.
_N, _R, _P = 2**14, 8, 1
# Compared against when the account is unknown, so a wrong name or email takes as long as a
# wrong password and the answer time does not tell which accounts exist.
DUMMY_HASH = "scrypt$16384$8$1$" + "00" * 16 + "$" + "00" * 32

# NIST SP 800-63B: at least 8 characters, a generous maximum, no composition rules.
MIN_LENGTH = 8
MAX_LENGTH = 128


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P)
    return f"scrypt${_N}${_R}${_P}${salt.hex()}${digest.hex()}"


def check_password(password: str, stored: str) -> bool:
    _, n, r, p, salt, digest = stored.split("$")
    actual = hashlib.scrypt(
        password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p)
    )
    return hmac.compare_digest(actual, bytes.fromhex(digest))


def password_problem(password: str, email: str) -> str | None:
    """Why a new user password is refused (the API `detail`), or None if it is acceptable.
    `email` is the normalized address."""
    if not MIN_LENGTH <= len(password) <= MAX_LENGTH:
        return f"password must be {MIN_LENGTH} to {MAX_LENGTH} characters"
    if password.strip().lower() == email:
        return "password must not be the email"
    return None
