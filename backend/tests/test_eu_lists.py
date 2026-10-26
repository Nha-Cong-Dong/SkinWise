from app.eu_lists import (
    parse_fragrance_allergens,
    parse_function_definitions,
    parse_glossary,
    parse_inventory,
    split_functions,
)
from app.inci import normalize_name, parse_inci
from app.seed import load_eu_names, load_fragrance_allergens, load_functions, load_toml

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

LABEL_IT = (
    "in the list of ingredients referred to in Article 19(1), point (g), when the concentration "
    "of the substance or substances exceeds: — 0,001 % in leave-on products — 0,01 % in rinse-off"
)
# Annex III rows: an allergen whose isomer continues on a row without the reference number, an
# allergen without a label name, an entry that is not an allergen; then Annex V, where "70" is
# another substance.
ANNEX_III = f"""<table>
<tr><td rowspan="2"><p>70</p></td><td>3,7-Dimethyl-2,6-octadienal</td><td><p>Citral</p></td>
<td>5392-40-5</td><td>226-394-6</td><td></td><td></td>
<td>The presence shall be indicated as ‘Citral’ {LABEL_IT}</td><td></td></tr>
<tr><td>(Z)-3,7-dimethylocta-2,6-dienal</td><td>Neral</td><td>106-26-3</td></tr>
<tr><td><p>88</p></td><td>dl-limonene</td><td><p>Limonene</p></td><td></td><td></td><td></td>
<td></td><td>The presence must be indicated {LABEL_IT}</td><td></td></tr>
<tr><td><p>98</p></td><td>Salicylic acid</td><td><p>Salicylic Acid</p></td><td></td><td></td>
<td>Rinse-off hair products</td><td>3 %</td><td>Not for children under 3</td><td></td></tr>
</table>
<table><tr><td>70</td><td>Phenoxyethanol</td><td>Phenoxyethanol</td><td></td><td></td><td></td>
<td>1 %</td><td></td><td></td></tr></table>"""


def test_parse_fragrance_allergens() -> None:
    glossary = ["CITRAL", "LIMONENE", "NERAL", "SALICYLIC ACID", "PHENOXYETHANOL"]
    assert parse_fragrance_allergens(ANNEX_III, glossary) == {
        "70": ["Citral", "Neral"],
        "88": ["Limonene"],
    }


def test_fragrance_allergen_list_has_the_2023_additions() -> None:
    allergens = load_fragrance_allergens()
    entries = {entry for _, entry in allergens}
    names = {normalize_name(name) for name, _ in allergens}
    assert len(entries) >= 80  # 24 before Regulation (EU) 2023/1545, 56 added by it
    assert {"limonene", "linalool", "citral", "menthol", "rose ketones"} <= names


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
