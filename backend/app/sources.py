"""Fetch a source page and check that given text appears on it verbatim.

Used to verify seeded ingredient lists (phase 1) and rule quotes (phase 2): correctness
comes from the source page, so the check runs against the live page, not our copy.
"""

import html
import re
import time
import unicodedata
import urllib.error
import urllib.request

USER_AGENT = (
    "SkinWise/0.1 (+https://github.com/Nha-Cong-Dong/SkinWise; "
    "verifies ingredient lists and quotes against their source)"
)
_TAG = re.compile(r"<[^>]+>")
# Bot-challenge pages (e.g. PMC serves reCAPTCHA after several quick fetches). Treating them
# as the real page would report a genuine quote as missing.
_CHALLENGE = re.compile(
    r"grecaptcha|g-recaptcha|_f_combinedSignature|cf-challenge|challenge-platform", re.IGNORECASE
)


class BlockedError(Exception):
    """The site answered with a bot-challenge page instead of the content."""


_JSON_UNICODE = re.compile(r"\\u([0-9a-fA-F]{4})")
_EUR_LEX_CELEX = re.compile(r"eur-lex\.europa\.eu/.*[?&]uri=CELEX(?::|%3A)(\w+)", re.IGNORECASE)
CELLAR_URL = "http://publications.europa.eu/resource/celex/{celex}"


def fetch_text(url: str, timeout: float = 30, retries: int = 2) -> str:
    """Page content as plain text. Script contents are kept: many shops embed the
    ingredient list in JSON rather than in visible HTML.

    Connection errors are retried with a pause: brand sites sometimes reset connections
    when several pages are fetched in a row. HTTP errors (403, 404, 500) are not retried.
    """
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    if celex := _EUR_LEX_CELEX.search(url):
        # eur-lex.europa.eu answers scripts with a bot challenge; the same text is served
        # for automated reuse by the Publications Office (CELLAR).
        request = urllib.request.Request(
            CELLAR_URL.format(celex=celex.group(1)),
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "application/xhtml+xml",
                "Accept-Language": "eng",
            },
        )
        timeout = max(timeout, 300)
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                page = response.read().decode(charset, errors="replace")
            break
        except urllib.error.HTTPError:
            raise
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            if attempt == retries:
                raise
            time.sleep(3 * (attempt + 1))
    if _CHALLENGE.search(page):
        raise BlockedError(f"{url} returned a bot-challenge page; retry later")
    page = _JSON_UNICODE.sub(lambda m: chr(int(m.group(1), 16)), page).replace("\\/", "/")
    return html.unescape(_TAG.sub(" ", page))


def comparable(s: str) -> str:
    """Loose form for matching: case, whitespace, dash and quote variants ignored."""
    s = unicodedata.normalize("NFKC", s).lower()
    s = re.sub(r"[‐‑‒–—−]", "-", re.sub(r"[‘’`´]", "'", s))
    return " ".join(s.split())


def missing_on_page(page_text: str, phrases: list[str]) -> list[str]:
    page = comparable(page_text)
    return [p for p in phrases if comparable(p) not in page]


def first_out_of_order(page_text: str, phrases: list[str]) -> str | None:
    """The first phrase not found after the previous one, or None if all appear in order.

    Catches a list that was reordered or stitched together from two versions of a page.
    """
    page = comparable(page_text)
    start = 0
    for phrase in phrases:
        i = page.find(comparable(phrase), start)
        if i < 0:
            return phrase
        start = i + len(comparable(phrase))
    return None
