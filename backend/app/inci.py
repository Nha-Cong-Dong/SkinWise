"""Parse an INCI ingredient list as printed on a label. Pure functions, no database."""

import re
import unicodedata
from dataclasses import dataclass

_LABEL_PREFIX = re.compile(r"^\s*(ingredients?|inci|thành phần|thanh phan)\s*:\s*", re.IGNORECASE)
# Start of the colorant section that applies to some shades only ("May contain", "+/-").
_MAY_CONTAIN = re.compile(r"\bmay contain\b|\bpeut contenir\b|\+\s*/\s*-", re.IGNORECASE)
_SEPARATORS = {",", ";", "\n", "•", "·"}
_FOOTNOTE_MARKS = re.compile(r"[*†‡°]+")
_PERCENT = re.compile(r"\s*\d+(?:[.,]\d+)?\s*%")
_DASHES = re.compile(r"[‐‑‒–—−]")
_QUOTES = re.compile(r"[‘’`´]")
_EDGE_PUNCT = " \t.,;:-"


@dataclass(frozen=True)
class InciEntry:
    position: int  # 1-based order on the label
    raw: str  # the label text for this entry, cleaned of footnote marks
    candidates: tuple[str, ...]  # normalized names to look up, most specific first
    may_contain: bool = False


def normalize_name(name: str) -> str:
    """Lowercase, strip diacritics (incl. Vietnamese đ), unify dashes/quotes, collapse spaces."""
    name = name.replace("đ", "d").replace("Đ", "D")
    name = unicodedata.normalize("NFKD", name)
    name = "".join(ch for ch in name if not unicodedata.combining(ch))
    name = _DASHES.sub("-", _QUOTES.sub("'", name)).lower()
    return " ".join(name.split()).strip(_EDGE_PUNCT)


def parse_inci(text: str) -> list[InciEntry]:
    text = _LABEL_PREFIX.sub("", text.strip())
    match = _MAY_CONTAIN.search(text)
    if match is None:
        sections = [(text, False)]
    else:
        # "Aqua [+/- CI 77491]": drop the bracket that wrapped the section marker.
        before = text[: match.start()].rstrip().rstrip("[(")
        after = text[match.end() :].strip()
        opened = after.count("(") + after.count("[")
        if after[-1:] in ")]" and opened < after.count(")") + after.count("]"):
            after = after[:-1]
        sections = [(before, False), (after, True)]

    entries: list[InciEntry] = []
    for section, may_contain in sections:
        for token in _split_top_level(section):
            raw = " ".join(_FOOTNOTE_MARKS.sub("", token).split()).strip(_EDGE_PUNCT)
            candidates = _candidates(_PERCENT.sub("", raw))
            if candidates:
                entries.append(InciEntry(len(entries) + 1, raw, candidates, may_contain))
    return entries


def _split_top_level(text: str) -> list[str]:
    """Split on separators that are not inside parentheses/brackets or between digits.

    The digit case keeps chemical names like "1,2-Hexanediol" whole.
    """
    parts, current, depth = [], [], 0
    for i, ch in enumerate(text):
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth = max(depth - 1, 0)
        between_digits = ch == "," and text[i - 1 : i].isdigit() and text[i + 1 : i + 2].isdigit()
        if ch in _SEPARATORS and depth == 0 and not between_digits:
            parts.append("".join(current))
            current = []
        else:
            current.append(ch)
    parts.append("".join(current))
    return parts


def _candidates(name: str) -> tuple[str, ...]:
    """Full name first, then the parts of `A (B)` and `A/B/C`.

    The full name comes first because some real INCI names contain a slash
    (e.g. "Acrylates/C10-30 Alkyl Acrylate Crosspolymer").
    """
    names = [name]
    paren = re.fullmatch(r"(.*?)\s*[(\[](.*)[)\]]\s*", name)
    if paren:
        names += [paren.group(1), paren.group(2)]
    for n in list(names):
        if "/" in n:
            names += n.split("/")

    result: list[str] = []
    for n in names:
        normalized = normalize_name(n)
        if normalized and normalized not in result:
            result.append(normalized)
    return tuple(result)


# --- Text that is not a full INCI list --------------------------------------------------------
# A pasted text can look like an ingredient list without being one: brands often publish only
# "key ingredients" with what each does. Checking a routine against such a list misses every
# active it leaves out, so the API flags it instead of silently treating it as complete.

# "- Shea butter: moisturizes, soothes ..." (name, colon, a description of several words).
_DESCRIBED_LINE = re.compile(r"^\s*[-•*+]?\s*([^:：\n]{1,60}?)\s*[:：]\s*(\S+(?:\s+\S+){2,}.*)$")
# Section labels that legitimately precede an INCI list ("Inactive ingredients: ...").
_SECTION_LABEL = re.compile(r"^((active|inactive|other)\s+)?ingredients?$|^inci$|^thanh phan$")
_HIGHLIGHT_HEADING = re.compile(
    r"\bthanh phan (noi bat|chinh|chu dao|dac biet|vang)\b"
    r"|\b(key|hero|star|featured|highlighted) ingredients?\b"
)
MIN_FULL_LIST = 5  # full INCI lists rarely have fewer entries
MAX_NAME_WORDS = 6  # INCI names longer than this are almost always a sentence


@dataclass(frozen=True)
class LabelText:
    entries: list[InciEntry]
    notices: list[str]  # codes, see describe_notice in the API


def read_label_text(text: str) -> LabelText:
    """Parse pasted text as an ingredient list and say how far it can be trusted as one.

    Notice codes: "highlight_list" (key ingredients with descriptions, not the full list),
    "vietnamese_names" (common Vietnamese names, not INCI), "long_entries" (sentences mixed
    in), "few_entries" (too short to be a whole list).
    """
    highlights = _highlight_names(text)
    entries = parse_inci("\n".join(highlights)) if highlights else parse_inci(text)

    notices = []
    if highlights or _HIGHLIGHT_HEADING.search(normalize_name(text)):
        notices.append("highlight_list")
    if entries and sum(_has_diacritics(e.raw) for e in entries) * 4 >= len(entries):
        notices.append("vietnamese_names")
    if not highlights and any(len(e.raw.split()) > MAX_NAME_WORDS for e in entries):
        notices.append("long_entries")
    if "highlight_list" not in notices and len(entries) < MIN_FULL_LIST:
        notices.append("few_entries")
    return LabelText(entries, notices)


def _highlight_names(text: str) -> list[str] | None:
    """The names of a "name: what it does" list, or None when the text is not one."""
    names = []
    for line in text.splitlines():
        match = _DESCRIBED_LINE.match(line)
        if match and not _SECTION_LABEL.match(normalize_name(match.group(1))):
            names.append(match.group(1).strip())
    return names if len(names) >= 2 else None


def _has_diacritics(name: str) -> bool:
    """Vietnamese marks never appear in INCI names (which are ASCII apart from rare cases)."""
    return any(not ch.isascii() for ch in _FOOTNOTE_MARKS.sub("", name) if ch.isalpha())
