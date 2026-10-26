from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text

from app.api import NO_ROUTINE_WARNING_VI, NO_VERIFIED_INFO_VI

RETINOL = "the-ordinary-retinol-05-in-squalane"
BHA = "paulas-choice-skin-perfecting-2-bha-liquid-exfoliant"
LOTION = "cerave-daily-moisturizing-lotion"
EVERY_DAY = list(range(7))


@pytest.fixture(scope="module")
def ids(engine: Engine) -> dict[str, int]:
    with engine.connect() as conn:
        return {slug: id for slug, id in conn.execute(text("SELECT slug, id FROM products"))}


def search(client: TestClient, q: str) -> list[str]:
    response = client.get("/products", params={"q": q})
    assert response.status_code == 200
    return [p["slug"] for p in response.json()]


def test_groups_have_vietnamese_names(client: TestClient) -> None:
    groups = {g["code"]: g for g in client.get("/groups").json()}
    assert groups["RETINOID"]["name_vi"].startswith("Retinoid")


def test_product_search_tolerates_typos_and_case(client: TestClient) -> None:
    assert search(client, "ordnary niacinamid")[0] == "the-ordinary-niacinamide-10-zinc-1"
    assert search(client, "PAULS CHOISE") == [BHA]
    assert set(search(client, "cerave")) >= {LOTION, "cerave-renewing-sa-cleanser"}


def test_product_search_ignores_vietnamese_diacritics(client: TestClient) -> None:
    winter_melon = {"cocoon-tinh-chat-bi-dao-n7", "cocoon-gel-bi-dao-rua-mat"}
    assert set(search(client, "bí đao")[:2]) == winter_melon
    assert set(search(client, "bi dao")[:2]) == winter_melon
    assert search(client, "tinh chat bi dao")[0] == "cocoon-tinh-chat-bi-dao-n7"


def test_product_search_without_query_lists_products_with_groups(client: TestClient) -> None:
    products = {p["slug"]: p for p in client.get("/products").json()}
    assert len(products) >= 15
    assert products[RETINOL]["groups"] == ["RETINOID"]
    assert products[LOTION]["groups"] == []


def test_product_search_treats_like_wildcards_literally(client: TestClient) -> None:
    products = client.get("/products", params={"q": "%"}).json()
    assert products
    assert all("%" in p["name"] for p in products)


def test_product_detail(client: TestClient, ids: dict[str, int]) -> None:
    product = client.get(f"/products/{ids[BHA]}").json()
    assert product["source_url"].startswith("https://")
    assert product["ingredients_source"] == "seed"
    assert set(product["groups"]) == {"BHA", "EXFOLIANT_ACID"}
    salicylic = next(i for i in product["ingredients"] if i["raw_name"] == "Salicylic Acid")
    assert salicylic["inci_name"] == "Salicylic Acid"
    assert [i["position"] for i in product["ingredients"]][:3] == [1, 2, 3]
    assert product["application"] == "leave_on"


def test_products_say_rinse_off_or_leave_on(client: TestClient) -> None:
    products = {p["slug"]: p for p in client.get("/products").json()}
    assert products["cerave-renewing-sa-cleanser"]["application"] == "rinse_off"
    assert products[LOTION]["application"] == "leave_on"


def test_analyze_marks_fragrance_allergens(client: TestClient) -> None:
    text = "Aqua, Linalool, Citrus Aurantium Dulcis (Orange) Peel Oil, Retinol, Parfum"
    body = client.post("/inci/analyze", json={"text": text}).json()
    # Orange peel oil is listed by its name without the parenthesis.
    assert [i["fragrance_allergen"] for i in body["ingredients"]] == [
        False, True, True, False, False
    ]  # fmt: skip
    assert body["groups"] == ["RETINOID"]  # never an active, never a warning


def test_unknown_product_is_404(client: TestClient) -> None:
    assert client.get("/products/999999").status_code == 404


def test_analyze_inci(client: TestClient) -> None:
    response = client.post(
        "/inci/analyze", json={"text": "Ingredients: Aqua (Water), Retinol, Citric Acid, Foo Bar"}
    )
    assert response.status_code == 200
    body = response.json()
    assert [i["raw_name"] for i in body["ingredients"]] == [
        "Aqua (Water)", "Retinol", "Citric Acid", "Foo Bar"
    ]  # fmt: skip
    assert body["groups"] == ["RETINOID"]
    assert body["ingredients"][2] == {
        "position": 3, "raw_name": "Citric Acid", "inci_name": "Citric Acid", "groups": [],
        "eu_name": "CITRIC ACID", "functions": ["BUFFERING", "CHELATING"], "known": True,
        "common_name_of": [], "common_name_note": None, "declared_concentration": None,
        "at_most_one_percent": False, "suggestions": [], "may_contain": False,
        "fragrance_allergen": False,
    }  # fmt: skip
    aqua = body["ingredients"][0]
    assert (aqua["inci_name"], aqua["eu_name"], aqua["known"]) == (None, "AQUA", True)
    assert body["ingredients"][3]["known"] is False
    assert body["unresolved_count"] == 1  # Foo Bar
    assert [n["code"] for n in body["notices"]] == ["few_entries"]


def test_functions_have_vietnamese_names(client: TestClient) -> None:
    functions = {f["code"]: f for f in client.get("/functions").json()}
    assert functions["HUMECTANT"]["name_vi"] == "Giữ ẩm"
    assert functions["HUMECTANT"]["definition_en"] == "Holds and retains moisture."
    assert functions["FIRMING"]["definition_en"] is None


def test_product_detail_lists_functions(client: TestClient, ids: dict[str, int]) -> None:
    product = client.get(f"/products/{ids[RETINOL]}").json()
    jojoba = next(i for i in product["ingredients"] if i["raw_name"].startswith("Simmondsia"))
    assert jojoba["eu_name"] == "SIMMONDSIA CHINENSIS SEED OIL"
    assert all(i["known"] for i in product["ingredients"])


def test_analyze_flags_a_key_ingredient_list(client: TestClient) -> None:
    text = "THÀNH PHẦN NỔI BẬT\n- Betaine: Giữ nước cho da.\n- Allantoin: làm dịu da tấy đỏ."
    body = client.post("/inci/analyze", json={"text": text}).json()
    assert [i["raw_name"] for i in body["ingredients"]] == ["Betaine", "Allantoin"]
    assert body["notices"][0]["code"] == "highlight_list"
    assert "không phải bảng thành phần đầy đủ" in body["notices"][0]["message_vi"]


def test_analyze_rejects_empty_text(client: TestClient) -> None:
    assert client.post("/inci/analyze", json={"text": "   "}).status_code == 422


def entry(key: str, session: str = "PM", step: int = 1, days=EVERY_DAY) -> dict:
    return {"product_key": key, "session": session, "step": step, "days": days}


def test_routine_check_warns_with_sources(client: TestClient, ids: dict[str, int]) -> None:
    body = {
        "products": [
            {"key": "bha", "product_id": ids[BHA]},
            {"key": "retinol", "product_id": ids[RETINOL]},
            {"key": "lotion", "product_id": ids[LOTION]},
        ],
        "items": [entry("bha", step=1), entry("retinol", step=2), entry("lotion", step=3)],
    }
    response = client.post("/routine/check", json=body)
    assert response.status_code == 200
    result = response.json()
    assert result["notice_vi"] is None
    (warning,) = [
        w for w in result["warnings"] if w["rule"]["key"] == "retinoid-exfoliant-acid-same-session"
    ]
    assert set(warning["product_keys"]) == {"bha", "retinol"}
    assert {p["key"]: p["application"] for p in result["products"]}["bha"] == "leave_on"
    assert warning["occurrences"] == [{"day": d, "session": "PM"} for d in EVERY_DAY]
    assert all(s["quote"] and s["url"] for s in warning["rule"]["sources"])
    assert {p["key"]: p["groups"] for p in result["products"]}["lotion"] == []


def test_routine_check_with_pasted_inci(client: TestClient, ids: dict[str, int]) -> None:
    body = {
        "products": [
            {"key": "mine", "inci": "Aqua, Glycolic Acid, Glycerin"},
            {"key": "retinol", "product_id": ids[RETINOL]},
        ],
        "items": [entry("mine", "PM", 1, [0, 2]), entry("retinol", "PM", 2, [2, 4])],
    }
    result = client.post("/routine/check", json=body).json()
    assert {p["key"]: p["groups"] for p in result["products"]}["mine"] == [
        "AHA", "EXFOLIANT_ACID"
    ]  # fmt: skip
    (warning,) = result["warnings"]
    assert warning["occurrences"] == [{"day": 2, "session": "PM"}]


def test_pasted_product_used_twice_is_not_compared_with_itself(client: TestClient) -> None:
    body = {
        "products": [{"key": "mine", "inci": "Retinol, Salicylic Acid"}],
        "items": [entry("mine", step=1), entry("mine", step=3)],
    }
    result = client.post("/routine/check", json=body).json()
    assert result["warnings"] == []
    assert result["notice_vi"] == NO_ROUTINE_WARNING_VI


def test_routine_check_rejects_bad_input(client: TestClient, ids: dict[str, int]) -> None:
    def status(body: dict) -> int:
        return client.post("/routine/check", json=body).status_code

    one = [{"key": "a", "product_id": ids[RETINOL]}]
    assert status({"products": one, "items": [entry("missing")]}) == 422
    assert status({"products": [{"key": "a"}], "items": []}) == 422
    assert status({"products": [{"key": "a", "product_id": 1, "inci": "x"}], "items": []}) == 422
    assert status({"products": one * 2, "items": []}) == 422
    assert status({"products": one, "items": [entry("a", days=[7])]}) == 422
    assert status({"products": one, "items": [entry("a", days=[])]}) == 422
    assert status({"products": one, "items": [entry("a", session="noon")]}) == 422
    assert status({"products": [{"key": "a", "product_id": 999999}], "items": []}) == 422


def test_myth_cards(client: TestClient) -> None:
    body = client.get("/rules", params={"kind": "myth"}).json()
    assert body["notice_vi"] is None
    assert "vitamin-c-niacinamide-myth" in [r["key"] for r in body["rules"]]
    assert all(r["kind"] == "myth" and r["sources"] for r in body["rules"])


def lookup(client: TestClient, *groups: str) -> list[str]:
    response = client.get("/rules", params={"groups": list(groups)})
    assert response.status_code == 200
    return [r["key"] for r in response.json()["rules"]]


def test_pair_lookup_finds_any_kind(client: TestClient) -> None:
    assert lookup(client, "EXFOLIANT_ACID", "RETINOID") == ["retinoid-exfoliant-acid-same-session"]
    assert lookup(client, "NIACINAMIDE", "VITAMIN_C") == ["vitamin-c-niacinamide-myth"]


def test_pair_lookup_counts_a_group_as_its_umbrella(client: TestClient) -> None:
    # The rule is written for EXFOLIANT_ACID; asking about BHA must not answer "no info".
    assert lookup(client, "RETINOID", "BHA") == ["retinoid-exfoliant-acid-same-session"]
    # Matched like the engine: an AHA product and a BHA product are two exfoliant acids.
    assert lookup(client, "AHA", "BHA") == ["exfoliant-acid-duplicate-same-session"]


def test_pair_lookup_of_one_group_twice_asks_about_two_products(client: TestClient) -> None:
    # "Can I use two retinoid products together?" is the duplicate rule, not every rule
    # involving retinoids.
    assert lookup(client, "RETINOID", "RETINOID") == ["retinoid-duplicate-same-session"]


def test_single_group_lookup_lists_rules_involving_it(client: TestClient) -> None:
    assert set(lookup(client, "PHA")) == {
        "exfoliant-acid-duplicate-same-session",
        "retinoid-exfoliant-acid-same-session",
    }


def test_lookup_without_verified_rule_says_so(client: TestClient) -> None:
    body = client.get("/rules", params={"groups": ["AZELAIC_ACID", "NIACINAMIDE"]}).json()
    assert body == {"rules": [], "notice_vi": NO_VERIFIED_INFO_VI}
    assert client.get("/rules", params={"groups": ["NOPE"]}).status_code == 422


@pytest.fixture
def cleanup_questions(engine: Engine) -> Iterator[list[int]]:
    created: list[int] = []
    yield created
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM user_questions WHERE id = ANY(:ids)"), {"ids": created})


def test_submit_question(
    client: TestClient, engine: Engine, ids: dict[str, int], cleanup_questions: list[int]
) -> None:
    response = client.post(
        "/questions",
        json={
            "question": "  Azelaic acid dùng chung với niacinamide được không?  ",
            "product_ids": [ids[RETINOL], ids[RETINOL]],
            "group_codes": ["NIACINAMIDE", "AZELAIC_ACID"],
        },
    )
    assert response.status_code == 201
    question_id = response.json()["id"]
    cleanup_questions.append(question_id)
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT question, product_ids, group_codes, status FROM user_questions "
                 "WHERE id = :id"), {"id": question_id}
        ).one()  # fmt: skip
    assert row.question == "Azelaic acid dùng chung với niacinamide được không?"
    assert row.product_ids == [ids[RETINOL]]
    assert row.group_codes == ["AZELAIC_ACID", "NIACINAMIDE"]
    assert row.status == "new"


def test_question_rejects_bad_input(client: TestClient) -> None:
    assert client.post("/questions", json={"question": "hi"}).status_code == 422
    assert client.post("/questions", json={"question": "x" * 2001}).status_code == 422
    unknown_product = {"question": "Câu hỏi hợp lệ?", "product_ids": [999999]}
    assert client.post("/questions", json=unknown_product).status_code == 422
    unknown_group = {"question": "Câu hỏi hợp lệ?", "group_codes": ["NOPE"]}
    assert client.post("/questions", json=unknown_group).status_code == 422


def test_analyze_marks_entries_after_a_one_percent_preservative(client: TestClient) -> None:
    text = (
        "Aqua, Glycerin, Niacinamide 5%, Phenoxyethanol, Retinol, Panthenol (4,000Ppm), "
        "CI 77891, Iron Oxides"
    )
    body = client.post("/inci/analyze", json={"text": text}).json()
    assert body["one_percent_marker"] == "Phenoxyethanol"
    marks = {i["raw_name"]: i["at_most_one_percent"] for i in body["ingredients"]}
    assert marks == {
        "Aqua": False, "Glycerin": False, "Niacinamide 5%": False, "Phenoxyethanol": False,
        "Retinol": True, "Panthenol (4,000Ppm)": True,
        "CI 77891": False, "Iron Oxides": False,  # colorants may be listed last at any amount
    }  # fmt: skip
    declared = {i["raw_name"]: i["declared_concentration"] for i in body["ingredients"]}
    assert declared["Niacinamide 5%"] == "5%"
    assert declared["Panthenol (4,000Ppm)"] == "4,000 ppm"
    # The 1% line never changes which actives are found.
    assert body["groups"] == ["NIACINAMIDE", "RETINOID"]


def test_key_ingredient_lists_get_no_one_percent_line(client: TestClient) -> None:
    text = "- Phenoxyethanol: bảo quản sản phẩm.\n- Retinol: chống lão hoá cho da."
    body = client.post("/inci/analyze", json={"text": text}).json()
    assert body["one_percent_marker"] is None
    assert not any(i["at_most_one_percent"] for i in body["ingredients"])


def test_seeded_product_detail_has_the_one_percent_line(
    client: TestClient, ids: dict[str, int]
) -> None:
    product = client.get(f"/products/{ids[LOTION]}").json()
    assert product["one_percent_marker"] == "PHENOXYETHANOL"  # as printed on the CeraVe label
    after = [i["raw_name"] for i in product["ingredients"] if i["at_most_one_percent"]]
    assert "CERAMIDE NP" in after


def test_benzoyl_peroxide_rules_fire_on_seeded_products(
    client: TestClient, ids: dict[str, int]
) -> None:
    body = {
        "products": [
            {"key": "bp-wash", "product_id": ids["cerave-acne-foaming-cream-cleanser"]},
            {"key": "bha", "product_id": ids[BHA]},
            {"key": "bp-gel", "inci": "Benzoyl Peroxide 2.5%, Aqua, Carbomer"},
        ],
        "items": [entry("bp-wash", step=1), entry("bha", step=2), entry("bp-gel", step=3)],
    }
    result = client.post("/routine/check", json=body).json()
    fired = {(w["rule"]["key"], tuple(sorted(w["product_keys"]))) for w in result["warnings"]}
    assert ("benzoyl-peroxide-bha-same-session", ("bha", "bp-wash")) in fired
    assert ("benzoyl-peroxide-bha-same-session", ("bha", "bp-gel")) in fired
    assert ("benzoyl-peroxide-duplicate-same-session", ("bp-gel", "bp-wash")) in fired


def test_new_myth_cards_show_on_seeded_routines(client: TestClient, ids: dict[str, int]) -> None:
    body = {
        "products": [
            {"key": "retinol", "product_id": ids[RETINOL]},
            {"key": "niacinamide", "product_id": ids["the-ordinary-niacinamide-10-zinc-1"]},
            {"key": "glucoside", "product_id": ids["the-ordinary-ascorbyl-glucoside-solution-12"]},
        ],
        "items": [
            entry("glucoside", step=1),
            entry("niacinamide", step=2),
            entry("retinol", step=3),
        ],
    }
    result = client.post("/routine/check", json=body).json()
    myths = {
        (w["rule"]["key"], tuple(sorted(w["product_keys"])))
        for w in result["warnings"]
        if w["rule"]["kind"] == "myth"
    }
    assert myths == {
        ("retinoid-niacinamide-myth", ("niacinamide", "retinol")),
        ("vitamin-c-derivative-niacinamide-myth", ("glucoside", "niacinamide")),
    }
    cards = [r["key"] for r in client.get("/rules", params={"kind": "myth"}).json()["rules"]]
    assert "azelaic-acid-retinoid-myth" in cards


def test_drug_facts_paste_finds_the_active(client: TestClient) -> None:
    text = (
        "Active ingredient Benzoyl peroxide 4% Purpose Acne treatment Use for acne Warnings For "
        "external use only Inactive ingredients water, glycerin, phenoxyethanol, niacinamide "
        "Questions or comments? 1-888"
    )
    body = client.post("/inci/analyze", json={"text": text}).json()
    assert body["groups"] == ["BENZOYL_PEROXIDE", "NIACINAMIDE"]
    assert [n["code"] for n in body["notices"]] == ["drug_facts"]
    # Drug Facts lists are not in order of weight: no 1% line.
    assert body["one_percent_marker"] is None


def test_unrecognised_names_get_suggestions_but_never_count(client: TestClient) -> None:
    body = client.post(
        "/inci/analyze", json={"text": "Aqua, Salicilic Acid, Glycerine, Foo Bar, Niacinamide"}
    ).json()
    by_name = {i["raw_name"]: i for i in body["ingredients"]}
    first = by_name["Salicilic Acid"]["suggestions"][0]
    assert first == {"name": "Salicylic Acid", "groups": ["BHA", "EXFOLIANT_ACID"]}
    assert by_name["Glycerine"]["suggestions"][0]["name"] == "GLYCERIN"
    assert by_name["Foo Bar"]["suggestions"] == []
    assert by_name["Niacinamide"]["suggestions"] == []  # recognised: nothing to suggest
    assert body["groups"] == ["NIACINAMIDE"]  # the misspelled BHA is not counted


def test_routine_check_flags_possible_misspelled_actives(
    client: TestClient, ids: dict[str, int]
) -> None:
    body = {
        "products": [
            {"key": "mine", "inci": "Aqua, Benzoil Peroxide, Glycerin, Carbomer, Aqua"},
            {"key": "retinol", "product_id": ids[RETINOL]},
        ],
        "items": [entry("mine", step=1), entry("retinol", step=2)],
    }
    result = client.post("/routine/check", json=body).json()
    products = {p["key"]: p for p in result["products"]}
    assert products["mine"]["groups"] == []
    assert products["mine"]["possible_actives"] == ["Benzoyl Peroxide"]
    assert products["retinol"]["possible_actives"] == []
    assert result["warnings"] == []  # suggestions never create warnings
