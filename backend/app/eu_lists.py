"""Parse the EU ingredient lists published in the Official Journal. Pure functions, no database.

- Glossary of common ingredient names, Implementing Decision (EU) 2025/1175: every name that
  may appear on an EU cosmetic label. Used to say "this is a known ingredient name".
- Inventory of cosmetic ingredients, Decision 2006/257/EC (Section I): INCI names with their
  usual functions and the official definition of each function. No longer in force (Decision
  96/335/EC, which it amended, was repealed in 2020); used only to describe what an
  ingredient is typically for.

Both are fetched from the EU Publications Office (CELLAR) as XHTML: scripts/import_eu_lists.py.
"""

import html
import re

GLOSSARY_CELEX = "32025D1175"
INVENTORY_CELEX = "32006D0257"

_TABLE = re.compile(r"<table.*?</table>", re.S)
_ROW = re.compile(r"<tr.*?</tr>", re.S)
_CELL = re.compile(r"<t[dh][ >].*?</t[dh]>", re.S)
_TAG = re.compile(r"<[^>]+>")

# Spelling slips and combined entries in the 2006 inventory's function column.
FUNCTION_ALIASES = {
    "SUFACTANT": "SURFACTANT",
    "SKIN PROTECTANT": "SKIN PROTECTING",
    "FOAMING CLEANSING": "FOAMING",
    "HAIR WAVING": "HAIR WAVING OR STRAIGHTENING",
}


def _cells(row: str) -> list[str]:
    return [" ".join(html.unescape(_TAG.sub(" ", c)).split()) for c in _CELL.findall(row)]


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
