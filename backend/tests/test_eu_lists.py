from app.eu_lists import (
    parse_function_definitions,
    parse_glossary,
    parse_inventory,
    split_functions,
)
from app.inci import normalize_name, parse_inci
from app.seed import load_eu_names, load_functions, load_toml

GLOSSARY = """<table><tr><td>Entry</td><td>Common Ingredient name</td></tr>
<tr><td></td><td></td></tr>
<tr><td><p>1</p></td><td><p>(20S)-PROTOPANAXADIOL</p></td></tr>
<tr><td><p>2</p></td><td><p>AQUA</p></td></tr></table>
<table><tr><td>(1)</td><td>Recital text</td></tr></table>"""

INVENTORY = """<p>8. Function ... The listed functions are defined as follows:
ANTIOXIDANT Inhibits reactions promoted by oxygen.
HUMECTANT Holds and retains moisture. UV FILTER Filters certain UV rays.</p>
<table><tr><td>INCI name</td><td>INN name</td><td>Ph. Eur. Name</td><td>CAS No</td>
<td>EINECS/ELINCS No</td><td>Chem/IUPAC Name</td><td>Restriction</td><td>Function</td></tr>
<tr><td>GLYCERIN</td><td>glycerol</td><td>glycerolum</td><td>56-81-5</td><td>200-289-5</td>
<td>Glycerol</td><td></td><td>Denaturant/humectant/solvent</td></tr>
<tr><td>16.</td><td>Ampho</td><td></td><td></td><td></td><td></td><td></td><td>Ampho</td></tr>
</table>"""


def test_parse_glossary_keeps_numbered_rows_only() -> None:
    assert parse_glossary(GLOSSARY) == ["(20S)-PROTOPANAXADIOL", "AQUA"]


def test_parse_inventory_reads_functions_and_skips_other_tables() -> None:
    assert parse_inventory(INVENTORY) == {"GLYCERIN": ["DENATURANT", "HUMECTANT", "SOLVENT"]}


def test_parse_function_definitions() -> None:
    assert parse_function_definitions(INVENTORY) == {
        "ANTIOXIDANT": "Inhibits reactions promoted by oxygen.",
        "HUMECTANT": "Holds and retains moisture.",
        "UV FILTER": "Filters certain UV rays.",
    }


def test_split_functions_fixes_slips_in_the_inventory() -> None:
    assert split_functions("Emulsifying/viscosity/controlling") == [
        "EMULSIFYING",
        "VISCOSITY CONTROLLING",
    ]
    assert split_functions("Sufactant; skin protectant") == ["SURFACTANT", "SKIN PROTECTING"]
    assert split_functions("Oral care, antiplaque") == ["ORAL CARE", "ANTIPLAQUE"]


def test_every_function_has_a_vietnamese_name() -> None:
    used = {code for _, _, codes in load_eu_names().values() for code in codes}
    translated = {f["code"] for f in load_functions()}
    assert used <= translated
    assert all(f["name_vi"] and f["description_vi"] for f in load_functions())


def test_cosmetic_actives_in_the_dictionary_are_eu_names() -> None:
    # Prescription retinoids are banned in EU cosmetics, so the glossary does not list them.
    drugs = {"Adapalene", "Tretinoin", "Isotretinoin", "Trifarotene"}
    names = load_eu_names()
    for ing in load_toml("ingredients.toml")["ingredient"]:
        if ing["inci"] not in drugs:
            assert normalize_name(ing["inci"]) in names, ing["inci"]


def test_eu_lists_recognise_nearly_every_seeded_ingredient() -> None:
    names = load_eu_names()
    entries = [
        e for p in load_toml("products.toml")["product"] for e in parse_inci(p["ingredients"])
    ]
    known = sum(any(c in names for c in e.candidates) for e in entries)
    assert known / len(entries) >= 0.95
