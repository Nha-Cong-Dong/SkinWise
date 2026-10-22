from app.inci import normalize_name, parse_inci


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
