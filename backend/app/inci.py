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
