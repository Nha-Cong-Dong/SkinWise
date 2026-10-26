"""Parse an INCI ingredient list as printed on a label. Pure functions, no database."""

import re
import unicodedata
from dataclasses import dataclass

_LABEL_PREFIX = re.compile(r"^\s*(ingredients?|inci|thành phần|thanh phan)\s*:\s*", re.IGNORECASE)
# Start of the colorant section that applies to some shades only ("May contain", "+/-").
_MAY_CONTAIN = re.compile(r"\bmay contain\b|\bpeut contenir\b|\+\s*/\s*-", re.IGNORECASE)
_SEPARATORS = {",", ";", "\n", "•", "·"}
_FOOTNOTE_MARKS = re.compile(r"[*†‡°]+")
# A concentration printed with an entry: "Niacinamide 10%", "Panthenol (4,000Ppm)".
_CONCENTRATION = re.compile(r"(\d+(?:[.,]\d+)*)\s*(%|ppm)", re.IGNORECASE)
_CONCENTRATION_TEXT = re.compile(
    r"\s*[(\[]\s*\d+(?:[.,]\d+)*\s*(?:%|ppm)\s*[)\]]|\s*\d+(?:[.,]\d+)*\s*(?:%|ppm)", re.IGNORECASE
)
_DASHES = re.compile(r"[‐‑‒–—−]")
_QUOTES = re.compile(r"[‘’`´]")
_EDGE_PUNCT = " \t.,;:-"
_INNER_PAREN = re.compile(r"\s*[(\[][^)\]]*[)\]]\s*")
_VIETNAMESE_ACID = re.compile(r"(?:axit|acid) ([a-z0-9-]+)")


@dataclass(frozen=True)
class InciEntry:
    position: int  # 1-based order on the label
    raw: str  # the label text for this entry, cleaned of footnote marks
    candidates: tuple[str, ...]  # normalized names to look up, most specific first
    may_contain: bool = False
    declared: str | None = None  # concentration printed with the entry, e.g. "10%", "4,000 ppm"


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
            candidates = _candidates(_CONCENTRATION_TEXT.sub("", raw))
            if candidates:
                position = len(entries) + 1
                entries.append(InciEntry(position, raw, candidates, may_contain, _declared(raw)))
    return entries


def _declared(raw: str) -> str | None:
    match = _CONCENTRATION.search(raw)
    if match is None:
        return None
    number, unit = match.groups()
    return f"{number}%" if unit == "%" else f"{number} ppm"


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
    # US-style "Simmondsia Chinensis (Jojoba) Seed Oil": the EU name drops the common name.
    without = _INNER_PAREN.sub(" ", name)
    if without != name:
        names.append(without)
    for n in list(names):
        if "/" in n:
            names += n.split("/")

    result: list[str] = []
    for n in names:
        normalized = normalize_name(n)
        if normalized and normalized not in result:
            result.append(normalized)
    # Vietnamese labels put "axit"/"acid" first: "Acid salicylic" is Salicylic Acid.
    for n in list(result):
        if (match := _VIETNAMESE_ACID.fullmatch(n)) and f"{match.group(1)} acid" not in result:
            result.append(f"{match.group(1)} acid")
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

    Notice codes: "drug_facts" (a US Drug Facts label: only its active and inactive
    ingredient sections were read, and their order says nothing about amounts),
    "highlight_list" (key ingredients with descriptions, not the full list),
    "vietnamese_names" (common Vietnamese names, not INCI), "long_entries" (sentences mixed
    in), "few_entries" (too short to be a whole list).
    """
    if (drug_facts := drug_facts_ingredients(text)) is not None:
        entries = parse_inci(drug_facts)
        notices = ["drug_facts"]
        if any(_name_words(e.raw) > MAX_NAME_WORDS for e in entries):
            notices.append("long_entries")
        return LabelText(entries, notices)

    highlights = _highlight_names(text)
    entries = parse_inci("\n".join(highlights)) if highlights else parse_inci(text)

    notices = []
    if highlights or _HIGHLIGHT_HEADING.search(normalize_name(text)):
        notices.append("highlight_list")
    if entries and sum(_has_diacritics(e.raw) for e in entries) * 4 >= len(entries):
        notices.append("vietnamese_names")
    if not highlights and any(_name_words(e.raw) > MAX_NAME_WORDS for e in entries):
        notices.append("long_entries")
    if "highlight_list" not in notices and len(entries) < MIN_FULL_LIST:
        notices.append("few_entries")
    return LabelText(entries, notices)


_ALTERNATE_NAMES = re.compile(r"[()\[\]/]")


def _name_words(raw: str) -> int:
    """Words in the longest name of an entry. "A (B)" and "A / B" print two names for one
    ingredient ("Coix Lacryma-Jobi Ma-yuen Seed Extract (Coix Seed Extract)"); together they
    are longer than any single name, but they are not a sentence."""
    return max(len(name.split()) for name in _ALTERNATE_NAMES.split(raw))


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


# --- US Drug Facts labels -------------------------------------------------------------------
# OTC drugs (acne washes, sunscreens) print the active ingredient apart from the others:
#   Active ingredient            Purpose
#   Benzoyl peroxide 4% ........ Acne treatment
#   Use ... Warnings ... Directions ...
#   Inactive ingredients water, glycerin, ...
# Read as one list, the active is lost in "Active ingredient Benzoyl peroxide 4% Purpose ..."
# and every warning sentence becomes an "ingredient". Only the two ingredient sections count.

_ACTIVE_HEADING = re.compile(r"(?<![a-z])active ingredients?(?:\s*\([^)]*\))?\s*:?", re.IGNORECASE)
_INACTIVE_HEADING = re.compile(r"\binactive ingredients?\s*:?", re.IGNORECASE)
_PURPOSE_HEADING = re.compile(r"\bpurposes?\b\s*:?", re.IGNORECASE)
# Headings that end an ingredient section.
_SECTION_END = re.compile(
    r"\b(?:uses?|warnings?|directions|other information|questions(?: or comments)?|"
    r"purposes?|inactive ingredients?|drug facts|principal display panel)\b",
    re.IGNORECASE,
)
_LEADER = re.compile(r"\s*(?:\.{2,}|…+).*$")  # "Benzoyl peroxide 4% ........ Acne treatment"
_AFTER_PERCENT = re.compile(r"(\d\s*%)\s+(?=[A-Za-z])")  # "Avobenzone 3% Homosalate 10%"


def drug_facts_ingredients(text: str) -> str | None:
    """The active and inactive ingredients of a Drug Facts label as one list, or None."""
    inactive = _INACTIVE_HEADING.search(text)
    active = _ACTIVE_HEADING.search(text)
    if inactive is None or active is None:
        return None

    actives = _section(text, active.end(), stop_at_purpose=False)
    # Flattened ("Benzoyl peroxide 4% Purpose Acne treatment"): actives come before Purpose.
    # Table header ("Active ingredient Purpose" then lines with leader dots): after it.
    purpose = _PURPOSE_HEADING.search(actives)
    if purpose and actives[: purpose.start()].strip():
        actives = actives[: purpose.start()]
    else:
        actives = _PURPOSE_HEADING.sub(" ", actives)
    actives = "\n".join(_LEADER.sub("", line) for line in actives.splitlines())
    actives = _AFTER_PERCENT.sub(r"\1\n", actives)

    inactives = _section(text, inactive.end(), stop_at_purpose=True)
    return f"{actives}\n{inactives}"


def _section(text: str, start: int, stop_at_purpose: bool) -> str:
    rest = text[start:]
    for match in _SECTION_END.finditer(rest):
        heading = match.group(0).lower()
        if not stop_at_purpose and heading.startswith("purpose"):
            continue  # handled by the caller
        return rest[: match.start()]
    return rest
