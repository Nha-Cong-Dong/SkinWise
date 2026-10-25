from app.inci import drug_facts_ingredients, normalize_name, parse_inci, read_label_text
from app.seed import load_toml


def names(text: str) -> list[str]:
    return [entry.candidates[0] for entry in parse_inci(text)]


def test_normalize_name() -> None:
    assert normalize_name("  Glycolic   ACID ") == "glycolic acid"
    assert normalize_name("Thành phần đặc biệt") == "thanh phan dac biet"
    assert normalize_name("L–Ascorbic Acid") == "l-ascorbic acid"
    assert normalize_name("Niacinamide.") == "niacinamide"


def test_splits_on_commas_semicolons_and_newlines() -> None:
    assert names("Aqua, Glycerin;Niacinamide\nZinc PCA") == [
        "aqua",
        "glycerin",
        "niacinamide",
        "zinc pca",
    ]


def test_comma_between_digits_is_part_of_the_name() -> None:
    assert names("Aqua, 1,2-Hexanediol,Glycerin") == ["aqua", "1,2-hexanediol", "glycerin"]


def test_positions_follow_label_order() -> None:
    entries = parse_inci("Aqua, , Glycerin")
    assert [(e.position, e.raw) for e in entries] == [(1, "Aqua"), (2, "Glycerin")]


def test_strips_label_prefix_footnotes_percent_and_final_period() -> None:
    assert names("Ingredients: Aqua, Niacinamide 10%, Aloe Vera Leaf Juice*, Zinc PCA.") == [
        "aqua",
        "niacinamide",
        "aloe vera leaf juice",
        "zinc pca",
    ]
    assert names("Thành phần: Aqua, Glycerin") == ["aqua", "glycerin"]


def test_parentheses_give_alternative_names() -> None:
    (entry,) = parse_inci("Water (Aqua)")
    assert entry.candidates == ("water (aqua)", "water", "aqua")


def test_commas_inside_parentheses_do_not_split() -> None:
    entries = parse_inci("Parfum (Fragrance, Linalool), Glycerin")
    assert [e.raw for e in entries] == ["Parfum (Fragrance, Linalool)", "Glycerin"]


def test_slash_gives_alternatives_but_full_name_first() -> None:
    (water,) = parse_inci("Aqua/Water/Eau")
    assert water.candidates == ("aqua/water/eau", "aqua", "water", "eau")

    (polymer,) = parse_inci("Acrylates/C10-30 Alkyl Acrylate Crosspolymer")
    assert polymer.candidates[0] == "acrylates/c10-30 alkyl acrylate crosspolymer"


def test_may_contain_section_is_kept_and_flagged() -> None:
    entries = parse_inci("Aqua, Glycerin. May contain: CI 77491, CI 77891")
    assert [(e.candidates[0], e.may_contain) for e in entries] == [
        ("aqua", False),
        ("glycerin", False),
        ("ci 77491", True),
        ("ci 77891", True),
    ]

    entries = parse_inci("Aqua [+/- CI 77491]")
    assert [e.may_contain for e in entries] == [False, True]


HIGHLIGHTS = """THÀNH PHẦN NỔI BẬT
- Bơ hạt mỡ: Dưỡng ẩm, ngăn ngừa sự thoát nước. Làm dịu da kích ứng.
- Betaine: Giữ nước, ngăn chặn quá trình thoát nước cho da.
- Rau má: làm dịu da, phục hồi, cải thiện đáng kể về độ ẩm của da.
- Allantoin: làm dịu da tấy đỏ, da khô nứt giúp da mềm mại hiệu quả."""


def test_key_ingredient_list_is_flagged_and_reduced_to_its_names() -> None:
    label = read_label_text(HIGHLIGHTS)
    assert [e.raw for e in label.entries] == ["Bơ hạt mỡ", "Betaine", "Rau má", "Allantoin"]
    assert label.notices == ["highlight_list", "vietnamese_names"]


def test_highlight_heading_alone_is_flagged() -> None:
    assert "highlight_list" in read_label_text("Key ingredients\nNiacinamide, Zinc PCA").notices


def test_section_labels_are_not_descriptions() -> None:
    text = "Active ingredients: Zinc Oxide 20%\nInactive ingredients: Water, Glycerin, Dimethicone"
    assert "highlight_list" not in read_label_text(text).notices


def test_marketing_sentences_and_short_lists_are_flagged() -> None:
    text = "Aqua, Glycerin, a gentle formula that keeps your skin soft all day long, Niacinamide"
    assert read_label_text(text).notices == ["long_entries", "few_entries"]


def test_seeded_full_lists_raise_no_notice() -> None:
    for product in load_toml("products.toml")["product"]:
        assert read_label_text(product["ingredients"]).notices == [], product["slug"]


# As copied from the DailyMed page of CeraVe Acne Foaming Cleanser (shortened).
DRUG_FACTS_FLAT = (
    "Active ingredient Benzoyl peroxide 4% Purpose Acne treatment Use for the treatment of acne "
    "Warnings For external use only When using this product skin irritation and dryness is more "
    "likely to occur if you use another topical acne medication at the same time. Directions use "
    "every morning and evening Inactive ingredients water, glycerin, niacinamide, glycolic acid, "
    "phenoxyethanol Other information store at 20-25C Questions or comments? 1-888-768-2915"
)

DRUG_FACTS_TABLE = """Drug Facts
Active ingredients (in each gram)          Purpose
Avobenzone 3% ............................ Sunscreen
Homosalate 10% ........................... Sunscreen
Uses helps prevent sunburn
Warnings For external use only
Inactive ingredients: Water, Glycerin, Dimethicone
Questions? Call 1-800-000-0000"""


def test_drug_facts_label_reads_only_ingredient_sections() -> None:
    label = read_label_text(DRUG_FACTS_FLAT)
    assert [e.raw for e in label.entries] == [
        "Benzoyl peroxide 4%", "water", "glycerin", "niacinamide", "glycolic acid",
        "phenoxyethanol",
    ]  # fmt: skip
    assert label.notices == ["drug_facts"]
    assert label.entries[0].declared == "4%"


def test_drug_facts_table_with_leader_dots() -> None:
    label = read_label_text(DRUG_FACTS_TABLE)
    assert [e.raw for e in label.entries] == [
        "Avobenzone 3%", "Homosalate 10%", "Water", "Glycerin", "Dimethicone"
    ]  # fmt: skip


def test_drug_facts_with_colons_and_actives_on_one_line() -> None:
    text = (
        "Active ingredients: Avobenzone 3% Homosalate 10% Purpose: Sunscreen\n"
        "Inactive Ingredients: Aqua, Glycerin"
    )
    assert [e.raw for e in read_label_text(text).entries] == [
        "Avobenzone 3%", "Homosalate 10%", "Aqua", "Glycerin"
    ]  # fmt: skip


def test_plain_inci_lists_are_not_drug_facts() -> None:
    assert drug_facts_ingredients("Aqua, Glycerin, Niacinamide, Zinc PCA, Phenoxyethanol") is None
