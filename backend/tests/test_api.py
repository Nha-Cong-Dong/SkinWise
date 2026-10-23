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
    assert search(client, "bí đao")[0] == "cocoon-tinh-chat-bi-dao-n7"
    assert search(client, "bi dao")[0] == "cocoon-tinh-chat-bi-dao-n7"


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
        "may_contain": False,
    }  # fmt: skip
    assert body["unresolved_count"] == 2  # Aqua and Foo Bar are not in the actives dictionary


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


def test_pair_lookup_finds_any_kind(client: TestClient) -> None:
    body = client.get("/rules", params={"groups": ["EXFOLIANT_ACID", "RETINOID"]}).json()
    assert [r["key"] for r in body["rules"]] == ["retinoid-exfoliant-acid-same-session"]


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
