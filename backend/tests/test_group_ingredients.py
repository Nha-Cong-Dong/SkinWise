"""/routine/check says which label entries put each product in a group, and where they stand.

Shown only: the warnings and groups are those the engine gives without these fields.
"""

from fastapi.testclient import TestClient
from sqlalchemy import Engine, text

# Bifida Biome Serum Toner: one PHA, near the end, just before an entry declared at 10 ppb.
BIFIDA_TONER = (
    "Purified Water, Butylene Glycol, Glycerin, Propanediol, Pentylene Glycol, Hamamelis "
    "Virginiana (Witch Hazel) Water, Lactobacillus Ferment Lysate, Lactococcus Ferment Lysate, "
    "Lactobacillus/Pumpkin Ferment Extract, Saccharomyces Ferment Filtrate, Betaine, Allantoin, "
    "Panthenol, Ceramide NP, Hyaluronic Acid, Hydrolyzed Hyaluronic Acid, Hydrolyzed "
    "Glycosaminoglycans, Sodium Hyaluronate, Sodium Hyaluronate Crosspolymer, Hydrogenated "
    "Lecithin, Bifida Ferment Filtrate, Bifida Ferment Lysate, Xylitol, Anhydroxylitol, "
    "Xylitylglucoside, Glucose, 1,2-Hexanediol, White Willow Bark Extract, Lactobionic Acid, "
    "Saccharum Officinarum (Sugarcane) Extract, Cutibacterium Granulosum Ferment Extract "
    "Filtrate (10Ppb), Fructose, Fructooligosaccharides, Caprylic/Capric Triglycerides, Benzyl "
    "Glycol, Tocopherol, Ethylhexylglycerin, Xanthan Gum, Disodium EDTA, Chondrus Crispus "
    "Extract, Chlorella Vulgaris Extract"
)
BHA = "paulas-choice-skin-perfecting-2-bha-liquid-exfoliant"
LOTION = "cerave-daily-moisturizing-lotion"


def check(client: TestClient, products: list[dict]) -> dict[str, dict]:
    body = {
        "products": products,
        "items": [
            {"product_key": p["key"], "session": "PM", "step": n, "days": [0]}
            for n, p in enumerate(products, start=1)
        ],
    }
    response = client.post("/routine/check", json=body)
    assert response.status_code == 200
    return {p["key"]: p for p in response.json()["products"]}


def test_pasted_list_names_the_entry_and_its_place(make_user) -> None:
    result = check(make_user(), [{"key": "toner", "inci": BIFIDA_TONER}])["toner"]
    assert result["groups"] == ["EXFOLIANT_ACID", "PHA"]
    assert result["group_ingredients"] == [
        {"group": "EXFOLIANT_ACID", "name": "Lactobionic Acid", "position": 29},
        {"group": "PHA", "name": "Lactobionic Acid", "position": 29},
    ]
    assert result["ingredient_count"] == 41
    assert result["ordered"] is True
    # In the dictionary with no group: not an active, so not listed.
    assert "White Willow Bark Extract" not in {g["name"] for g in result["group_ingredients"]}


def test_seeded_positions_match_the_product_detail(make_user, engine: Engine) -> None:
    client = make_user()
    with engine.connect() as conn:
        ids = [row.id for row in conn.execute(text("SELECT id FROM products ORDER BY id"))]
    results = check(client, [{"key": str(i), "product_id": i} for i in ids])
    assert any(r["group_ingredients"] for r in results.values())
    for pid in ids:
        result = results[str(pid)]
        detail = client.get(f"/products/{pid}").json()
        entries = {i["position"]: i for i in detail["ingredients"]}
        assert result["ingredient_count"] == len(detail["ingredients"])
        assert result["ordered"] is True
        # Every group of the product, and only those, has its entries listed.
        assert {g["group"] for g in result["group_ingredients"]} == set(result["groups"])
        for g in result["group_ingredients"]:
            assert entries[g["position"]]["raw_name"] == g["name"]
            assert g["group"] in entries[g["position"]]["groups"]
        expected = sorted(
            (i["position"], group) for i in detail["ingredients"] for group in i["groups"]
        )
        assert [(g["position"], g["group"]) for g in result["group_ingredients"]] == expected


def test_seeded_product_without_actives_lists_nothing(make_user, engine: Engine) -> None:
    with engine.connect() as conn:
        pid = conn.execute(text("SELECT id FROM products WHERE slug = :s"), {"s": LOTION}).scalar()
    result = check(make_user(), [{"key": "lotion", "product_id": pid}])["lotion"]
    assert result["groups"] == []
    assert result["group_ingredients"] == []
    assert result["ingredient_count"] > 0


def test_pasted_list_without_actives_lists_nothing(make_user) -> None:
    result = check(make_user(), [{"key": "mine", "inci": "Aqua, Glycerin, Xanthan Gum"}])["mine"]
    assert result["groups"] == []
    assert result["group_ingredients"] == []
    assert result["ingredient_count"] == 3
    assert result["ordered"] is True


def test_key_ingredient_list_is_not_in_order(make_user) -> None:
    text_ = "THÀNH PHẦN NỔI BẬT\n- Betaine: Giữ nước cho da.\n- Retinol: chống lão hoá cho da."
    result = check(make_user(), [{"key": "mine", "inci": text_}])["mine"]
    assert result["ordered"] is False
    assert result["ingredient_count"] == 2
    assert result["group_ingredients"] == [{"group": "RETINOID", "name": "Retinol", "position": 2}]


def test_drug_facts_label_is_not_in_order(make_user) -> None:
    text_ = (
        "Active ingredient Benzoyl peroxide 4% Purpose Acne treatment Use for acne Warnings For "
        "external use only Inactive ingredients water, glycerin, phenoxyethanol, niacinamide "
        "Questions or comments? 1-888"
    )
    result = check(make_user(), [{"key": "mine", "inci": text_}])["mine"]
    assert result["ordered"] is False
    assert {g["group"] for g in result["group_ingredients"]} == {"BENZOYL_PEROXIDE", "NIACINAMIDE"}


def test_new_fields_do_not_change_the_warnings(make_user, engine: Engine) -> None:
    """The toner and a seeded BHA: the duplicate-acid warning fires on groups alone."""
    with engine.connect() as conn:
        pid = conn.execute(text("SELECT id FROM products WHERE slug = :s"), {"s": BHA}).scalar()
    client = make_user()
    body = {
        "products": [{"key": "toner", "inci": BIFIDA_TONER}, {"key": "bha", "product_id": pid}],
        "items": [
            {"product_key": "toner", "session": "PM", "step": 1, "days": [0]},
            {"product_key": "bha", "session": "PM", "step": 2, "days": [0]},
        ],
    }
    result = client.post("/routine/check", json=body).json()
    by_key = {p["key"]: p for p in result["products"]}
    assert {g["group"] for g in by_key["bha"]["group_ingredients"]} == set(by_key["bha"]["groups"])
    (duplicate,) = [
        w for w in result["warnings"] if w["rule"]["key"] == "exfoliant-acid-duplicate-same-session"
    ]
    assert set(duplicate["product_keys"]) == {"toner", "bha"}
