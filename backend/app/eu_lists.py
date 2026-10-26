"""Parse the EU ingredient lists published in the Official Journal. Pure functions, no database.

- Glossary of common ingredient names, Implementing Decision (EU) 2025/1175: every name that
  may appear on an EU cosmetic label. Used to say "this is a known ingredient name".
- Inventory of cosmetic ingredients, Decision 2006/257/EC (Section I): INCI names with their
  usual functions and the official definition of each function. No longer in force (Decision
  96/335/EC, which it amended, was repealed in 2020); used only to describe what an
  ingredient is typically for.

- Annex III of Regulation (EC) 1223/2009, consolidated text: the fragrance allergens, whose
  presence must be named on the label above 0.001 % (leave-on) / 0.01 % (rinse-off).
  Consolidated texts are documentation only; Regulation (EU) 2023/1545 is the legal basis
  for the current list. Used only to label an ingredient, never to raise a warning.
  Entries whose labelling applies only when the substance is not used as a preservative
  (Benzyl Alcohol) are left out: an ingredient list does not say what it is used for.

All are fetched from the EU Publications Office (CELLAR) as XHTML: scripts/import_eu_lists.py.
"""

import html
import re
from collections.abc import Iterable

from app.inci import normalize_name

GLOSSARY_CELEX = "32025D1175"
INVENTORY_CELEX = "32006D0257"
# Latest consolidated version when imported; find newer ones by the "02009R1223-" prefix.
ANNEX_III_CELEX = "02009R1223-20260518"

_TABLE = re.compile(r"<table.*?</table>", re.S)
_ROW = re.compile(r"<tr.*?</tr>", re.S)
_CELL = re.compile(r"<t[dh][ >].*?</t[dh]>", re.S)
_TAG = re.compile(r"<[^>]+>")
_PARAGRAPH = re.compile(r"<p[ >].*?</p>", re.S)
# "Rose ketone 4 (Damascenone)": a name and its alias. Chemical names also have parentheses,
# but never after a space ("(E)-2-methoxy-4-(prop-1-enyl)phenol"), so they are not split.
_ALIAS = re.compile(r"^(.*\S)\s+\(([^()]+)\)$")

# Spelling slips and combined entries in the 2006 inventory's function column.
FUNCTION_ALIASES = {
    "SUFACTANT": "SURFACTANT",
    "SKIN PROTECTANT": "SKIN PROTECTING",
    "FOAMING CLEANSING": "FOAMING",
    "HAIR WAVING": "HAIR WAVING OR STRAIGHTENING",
}


def _text(fragment: str) -> str:
    return " ".join(html.unescape(_TAG.sub(" ", fragment)).split())


def _cells(row: str) -> list[str]:
    return [_text(c) for c in _CELL.findall(row)]


def parse_glossary(xhtml: str) -> list[str]:
    """Names from the glossary annex: the two-column table "Entry | Common Ingredient name"."""
    names = []
    for table in _TABLE.findall(xhtml):
        for row in _ROW.findall(table):
            cells = _cells(row)
            if len(cells) == 2 and cells[0].isdigit() and cells[1]:
                names.append(cells[1])
    return names


def parse_inventory(xhtml: str) -> dict[str, list[str]]:
    """INCI name -> function codes (upper case, e.g. "SKIN CONDITIONING") from Section I.

    Rows have eight cells: INCI name, INN, Ph. Eur. name, CAS, EINECS/ELINCS, chemical
    name or description, restriction, function(s) separated by "/".
    """
    inventory: dict[str, list[str]] = {}
    for row in _ROW.findall(xhtml):
        cells = _cells(row)
        # Skip the header row and rows of the nomenclature-conventions table ("16.", "Ampho").
        if len(cells) != 8 or not re.search(r"[A-Z]{2}", cells[0]) or cells[0] == "INCI name":
            continue
        inventory[cells[0]] = split_functions(cells[7])
    return inventory


def split_functions(field: str) -> list[str]:
    codes: list[str] = []
    field = re.sub(r"viscosity\s*/\s*controlling", "viscosity controlling", field, flags=re.I)
    for part in re.split(r"[/,;]", field):
        code = " ".join(re.sub(r"[^A-Za-z ]", " ", part).split()).upper()
        code = FUNCTION_ALIASES.get(code, code)
        if code == "FOAMING" and "CLEANSING" in field.upper() and "CLEANSING" not in codes:
            codes.append("CLEANSING")
        if code and code not in codes:
            codes.append(code)
    return codes


def parse_function_definitions(xhtml: str) -> dict[str, str]:
    """The official definition of each function, from the inventory's introduction:
    "ABRASIVE Removes materials from ... HUMECTANT Holds and retains moisture. ..."."""
    text = " ".join(html.unescape(_TAG.sub(" ", xhtml)).split())
    start = text.find("The listed functions are defined as follows:")
    if start < 0:
        return {}
    block = text[start + len("The listed functions are defined as follows:") :]
    # A definition runs from an upper-case name to the next upper-case name; the list ends
    # where the ingredient table's header row starts.
    end = re.search(r" INCI name INN name", block)
    block = block[: end.start()] if end else block
    definitions = {}
    for match in re.finditer(
        r"([A-Z][A-Z]+(?: [A-Z]{2,})*) ([A-Z][a-z].*?)(?= [A-Z][A-Z]+(?: [A-Z]{2,})* [A-Z][a-z]|$)",
        block,
    ):
        definitions[match.group(1)] = match.group(2).strip()
    return definitions


# The "Other" column of a fragrance allergen's Annex III entry: name it on the label above
# 0.001 % in leave-on and 0.01 % in rinse-off products ("shall be" since 2023, "must be" before).
_ALLERGEN_LABELLING = re.compile(
    r"in the list of ingredients referred to in Article 19\(1\).*0,001 % in leave-on", re.S
)
# 'shall be indicated as "Citral" in the list of ingredients': the name the label must use.
_LABELLED_AS = re.compile(r"indicated as \W(.+?)\W in the list of ingredients")
# Benzyl Alcohol (entry 45): the labelling applies only "For purposes other than inhibiting
# the development of microorganisms", i.e. not when it is the product's preservative.
_NOT_AS_PRESERVATIVE = re.compile(r"other than inhibiting the development of micro-?organisms")


def _names(cell: str) -> list[str]:
    """Names in a cell, one per paragraph and/or separated by ";" ("Pinus Mugo Leaf Oil;
    Pinus Mugo Twig Oil")."""
    parts = [_text(p) for p in _PARAGRAPH.findall(cell)] or [_text(cell)]
    return [n.strip() for part in parts for n in part.split(";") if n.strip()]


def _aliases(name: str) -> list[str]:
    match = _ALIAS.match(name)
    return list(match.groups()) if match else [name.removeprefix("(").removesuffix(")")]


def _key(name: str) -> str:
    """Spaces and hyphens ignored: the Annex prints "Rose ketone 4" for glossary "ROSE KETONE-4"."""
    return re.sub(r"[\s-]+", "", normalize_name(name))


def parse_fragrance_allergens(xhtml: str, glossary: Iterable[str]) -> dict[str, list[str]]:
    """Annex III entry number -> the names that identify the allergen on a label: the name
    the entry says to print ("Citral"), then the glossary names of its substances (Citral,
    Geranial). `glossary` is the list of glossary names (parse_glossary).

    An entry's first row has nine cells: reference number, chemical name, glossary name, CAS,
    EC, product type, maximum concentration, other (labelling), wording of warnings. An entry
    with several substances continues on rows without the reference number, and the source's
    row spans are not reliable enough to tell their columns apart; a name in those rows (a
    cell, or a part in parentheses: "Rose ketone 4 (Damascenone)") that is a glossary name is
    taken as one of the entry's substances, spelled as in the glossary.
    """
    known = {_key(n): n for n in glossary}
    allergens: dict[str, list[str]] = {}
    for table in _TABLE.findall(xhtml):
        entries: list[tuple[str, list[list[str]]]] = []  # (reference, rows of raw cells)
        for row in _ROW.findall(table):
            cells = _CELL.findall(row)
            if len(cells) == 9 and _text(cells[0]).isdigit():
                entries.append((_text(cells[0]), [cells]))
            elif entries:
                entries[-1][1].append(cells)
        for ref, (first, *more) in entries:
            other = _text(first[7])
            if not _ALLERGEN_LABELLING.search(other) or _NOT_AS_PRESERVATIVE.search(other):
                continue
            names = [re.sub(r"\s*/\s*", "/", n) for n in _LABELLED_AS.findall(other)]
            names += _names(first[2])
            names += [
                known[_key(part)]
                for row in more
                for cell in row
                for name in _names(cell)
                for part in _aliases(name)
                if _key(part) in known
            ]
            unique: dict[str, str] = {}
            for name in names:
                unique.setdefault(_key(name), name)
            allergens[ref] = list(unique.values())
    return allergens
