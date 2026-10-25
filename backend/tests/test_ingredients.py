from sqlalchemy import Engine, text

from app.inci import normalize_name, parse_inci
from app.ingredients import product_groups, resolve
from app.seed import load_eu_names, load_toml, seed


def resolve_text(engine: Engine, inci: str):
    with engine.connect() as conn:
        return resolve(conn, parse_inci(inci))


def test_glycolic_acid_is_aha_and_exfoliant(engine: Engine) -> None:
    (glycolic,) = resolve_text(engine, "Glycolic Acid")
    assert glycolic.inci_name == "Glycolic Acid"
    assert glycolic.groups == ("AHA", "EXFOLIANT_ACID")


def test_citric_acid_is_known_but_not_an_active(engine: Engine) -> None:
    (citric,) = resolve_text(engine, "Citric Acid")
    assert citric.inci_name == "Citric Acid"
    assert citric.groups == ()


def test_synonyms_resolve_to_one_ingredient(engine: Engine) -> None:
    resolved = resolve_text(engine, "Ascorbic Acid, L-Ascorbic Acid, Vitamin C (Ascorbic Acid)")
    assert {r.ingredient_id for r in resolved} == {resolved[0].ingredient_id}
    assert all(r.groups == ("VITAMIN_C",) for r in resolved)


def test_case_and_diacritics_do_not_matter(engine: Engine) -> None:
    (niacinamide,) = resolve_text(engine, "  NIACINAMIDE ")
    assert niacinamide.groups == ("NIACINAMIDE",)


def test_unknown_ingredients_are_kept_with_label_text(engine: Engine) -> None:
    aqua, retinol = resolve_text(engine, "Aqua (Water), Retinol")
    assert (aqua.ingredient_id, aqua.entry.raw, aqua.groups) == (None, "Aqua (Water)", ())
    assert retinol.groups == ("RETINOID",)


def test_product_groups_collects_all_groups(engine: Engine) -> None:
    resolved = resolve_text(engine, "Aqua, Salicylic Acid, Niacinamide, Citric Acid")
    assert product_groups(resolved) == {"BHA", "EXFOLIANT_ACID", "NIACINAMIDE"}


def test_every_ingredient_group_exists() -> None:
    codes = {g["code"] for g in load_toml("functional_groups.toml")["group"]}
    for ing in load_toml("ingredients.toml")["ingredient"]:
        assert set(ing.get("groups", [])) <= codes, ing["inci"]


def test_every_member_of_a_group_is_in_its_parent() -> None:
    groups = load_toml("functional_groups.toml")["group"]
    codes = {g["code"] for g in groups}
    parents = {g["code"]: g["parent"] for g in groups if "parent" in g}
    assert set(parents.values()) <= codes
    for ing in load_toml("ingredients.toml")["ingredient"]:
        for code in ing.get("groups", []):
            if code in parents:
                assert parents[code] in ing["groups"], f"{ing['inci']}: {code} without parent"


def test_reseeding_keeps_ids_stable(engine: Engine) -> None:
    query = text("SELECT inci_name, id FROM ingredients ORDER BY inci_name")
    with engine.connect() as conn:
        before = conn.execute(query).all()
    seed(engine)
    with engine.connect() as conn:
        assert conn.execute(query).all() == before


def test_look_alikes_are_not_counted_as_actives(engine: Engine) -> None:
    resolved = resolve_text(
        engine,
        "Ethylhexyl Salicylate, Willow Bark Extract, Sodium Lactate, Hyaluronic Acid, Niacin, "
        "Ascorbyl Palmitate, Sodium Ascorbate, Calcium Ascorbate",
    )
    assert all(r.ingredient_id is not None for r in resolved)
    assert product_groups(resolved) == set()


def test_no_synonym_points_to_two_ingredients() -> None:
    owner: dict[str, str] = {}
    for ing in load_toml("ingredients.toml")["ingredient"]:
        for name in {normalize_name(n) for n in [ing["inci"], *ing.get("synonyms", [])]}:
            assert name not in owner, f"{name!r}: {owner.get(name)} and {ing['inci']}"
            owner[name] = ing["inci"]


def test_everyday_vietnamese_names_resolve_to_eu_names(engine: Engine) -> None:
    rau_ma, extract, cuc = resolve_text(engine, "Rau má, Chiết xuất rau má, Cúc La Mã")
    assert rau_ma.eu_name == "CENTELLA ASIATICA EXTRACT"
    assert rau_ma.common_name_of == ("CENTELLA ASIATICA EXTRACT", "CENTELLA ASIATICA LEAF EXTRACT")
    assert extract.eu_name == rau_ma.eu_name
    assert cuc.common_name_note and "Anthemis" in cuc.common_name_note


def test_vietnamese_name_of_an_active_counts_as_the_active(engine: Engine) -> None:
    (salicylic,) = resolve_text(engine, "Axit Salicylic")
    assert salicylic.groups == ("BHA", "EXFOLIANT_ACID")
    (willow,) = resolve_text(engine, "Vỏ liễu trắng")
    assert willow.inci_name == "Salix Alba Bark Extract"
    assert willow.groups == ()


def test_inci_names_win_over_everyday_names(engine: Engine) -> None:
    (aqua,) = resolve_text(engine, "Aqua")
    assert aqua.common_name_of == ()


def test_common_names_are_unique_and_never_shadowed() -> None:
    """A name the dictionary or the EU lists already know is looked up first, so a common
    name entry for it would never be used."""
    dictionary = {
        normalize_name(n)
        for ing in load_toml("ingredients.toml")["ingredient"]
        for n in [ing["inci"], *ing.get("synonyms", [])]
    }
    eu_names = load_eu_names()
    seen: set[str] = set()
    for entry in load_toml("common_names.toml")["name"]:
        name = normalize_name(entry["name"])
        assert name not in seen, entry["name"]
        assert name not in dictionary, f"{entry['name']} is already a dictionary name"
        assert name not in eu_names, f"{entry['name']} is already an EU name"
        seen.add(name)


def test_vietnamese_acid_word_order(engine: Engine) -> None:
    """Vietnamese labels write "Acid salicylic" / "Axit malic"; missing them loses warnings."""
    salicylic, glycolic, malic, hyaluronic = resolve_text(
        engine, "Acid salicylic, Axít Glycolic, Axit malic, Acid hyaluronic"
    )
    assert salicylic.groups == ("BHA", "EXFOLIANT_ACID")
    assert glycolic.groups == ("AHA", "EXFOLIANT_ACID")
    assert malic.groups == ("AHA", "EXFOLIANT_ACID")
    assert hyaluronic.inci_name == "Hyaluronic Acid"
    assert hyaluronic.groups == ()
