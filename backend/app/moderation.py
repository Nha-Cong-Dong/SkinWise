"""Light moderation of community posts and comments: pure functions, no database.

auto_flags() marks text that should wait for a reviewer before others see it. It is a coarse
net, not a judgement: a flagged post is held back (status "pending"), never rejected, and a
reviewer decides. Nothing here ever reaches the warning engine.
"""

import re
import unicodedata

FLAG_ORDER = ("medical_claim", "phone", "email", "link")
# Distinct people reporting a visible post or comment before it is hidden for review.
REPORT_THRESHOLD = 3

# Cosmetics may not be presented as treating or curing a disease. Whole words only, so
# "giá trị" (value), "trị giá" (worth), "chính trị" (politics) or "sửa chữa" (repair) pass.
_NOT_BEFORE = ("giá ", "chính ", "quản ", "cai ", "thống ", "sửa ")
_NOT_AFTER = (" giá", " vì", " số")
_CLAIMS = (
    "điều trị",
    "đặc trị",
    "chữa khỏi",
    "chữa trị",
    "khỏi hẳn",
    "khỏi mụn",
    "khỏi bệnh",
    "dứt điểm",
    "trị",
    "chữa",
)
_LOOKBEHIND = "".join(f"(?<!{re.escape(w)})" for w in _NOT_BEFORE)
_LOOKAHEAD = "".join(f"(?!{re.escape(w)})" for w in _NOT_AFTER)
_MEDICAL = re.compile(
    rf"(?<!\w){_LOOKBEHIND}(?:{'|'.join(re.escape(c) for c in _CLAIMS)})(?!\w){_LOOKAHEAD}"
)
# The same claims typed without diacritics ("tri mun"). Unaccented "tri" or "chua" alone means
# too many things ("gia tri", "chua" = not yet), so only whole phrases count, and none that an
# ordinary accented phrase also turns into ("chưa khỏi" -> "chua khoi" is left out).
# "chua mun" is left out too: "chưa mụn lại" (no new spots yet) is ordinary.
_PLAIN_CLAIMS = ("dieu tri", "dac tri", "tri mun", "tri tham", "tri seo", "khoi mun")
_MEDICAL_PLAIN = re.compile(
    rf"(?<!\w)(?<!gia )(?:{'|'.join(re.escape(c) for c in _PLAIN_CLAIMS)})(?!\w)"
)

# A Vietnamese phone number: 10 digits starting with 0, or +84 and 9 digits; spaces, dots or
# dashes between digits are allowed; +84 may be in brackets ("(+84) 912 345 678").
_PHONE = re.compile(r"(?<![\d+(])(?:\(\+84\)|\+84|0)(?:[ .\-]?\d){9}(?![\d])")
_EMAIL = re.compile(r"[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+")
_TLDS = "com|vn|net|org|info|io|me|co|biz|shop|store|xyz|online|site|top|app|link|ly|asia"
_LINK = re.compile(
    rf"https?://|(?<![\w.])www\.|(?<![\w.@\-])[a-z0-9\-]+(?:\.[a-z0-9\-]+)*\.(?:{_TLDS})(?![\w])",
    re.IGNORECASE,
)


def _clean(text: str) -> str:
    """NFC (text pasted from a Mac may be decomposed), lower case, single spaces."""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", text)).lower()


def _without_diacritics(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text.replace("đ", "d"))
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def auto_flags(text: str) -> list[str]:
    """The reasons this text should wait for a reviewer, in FLAG_ORDER; [] when none."""
    t = _clean(text)
    found = set()
    if _MEDICAL.search(t) or _MEDICAL_PLAIN.search(_without_diacritics(t)):
        found.add("medical_claim")
    if _PHONE.search(t):
        found.add("phone")
    if _EMAIL.search(t):
        found.add("email")
    if _LINK.search(_EMAIL.sub(" ", t)):
        found.add("link")
    return [f for f in FLAG_ORDER if f in found]


def status_after_edit(current: str, flags: list[str]) -> str:
    """The status of a post after its author edits it. A flagged edit waits for a reviewer
    even if the post was visible (or approved before); a pending post that no longer has
    flags shows again. Hidden (reported) and removed posts stay as they are."""
    if current in ("visible", "pending"):
        return "pending" if flags else "visible"
    return current


def status_after_reports(current: str, reporters: int) -> str:
    """A visible post or comment is hidden once REPORT_THRESHOLD distinct people reported it
    (since the last reviewer decision)."""
    if current == "visible" and reporters >= REPORT_THRESHOLD:
        return "hidden"
    return current
