"""The public routine check of the landing page (POST /demo/check)."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text

from app.api import DEMO_CHECKS, reset_demo_limit
from app.schemas import DEMO_MAX_ITEMS, DEMO_MAX_PRODUCTS

URL = "/demo/check"


@pytest.fixture(autouse=True)
def fresh_limit() -> Iterator[None]:
    reset_demo_limit()
    yield
    reset_demo_limit()


@pytest.fixture(scope="module")
def product_ids(engine: Engine) -> list[int]:
    with engine.connect() as conn:
        return list(conn.execute(text("SELECT id FROM products ORDER BY id")).scalars())


def routine(ids: list[int]) -> dict:
    return {
        "products": [{"key": f"p{i}", "product_id": pid} for i, pid in enumerate(ids)],
        "items": [
            {"product_key": f"p{i}", "session": "PM", "days": [0, 2, 4], "step": i + 1}
            for i in range(len(ids))
        ],
    }


def test_no_sign_in_needed_and_same_result_as_the_routine_check(
    client: TestClient, make_user, product_ids: list[int]
) -> None:
    signed_in = make_user()
    found_a_warning = False
    # Several groups of sample products, so some results have warnings and some do not.
    for start in range(0, len(product_ids), 5):
        body = routine(product_ids[start : start + 5])
        demo = client.post(URL, json=body)
        assert demo.status_code == 200, demo.text
        full = signed_in.post("/routine/check", json=body)
        assert full.status_code == 200
        assert demo.json() == full.json()
        found_a_warning |= bool(demo.json()["warnings"])
    assert found_a_warning  # the comparison covered warnings too


def test_empty_routine_has_the_notice(client: TestClient) -> None:
    result = client.post(URL, json={"products": [], "items": []}).json()
    assert result["warnings"] == [] and result["notice_vi"]


def test_pasted_lists_are_refused(client: TestClient, product_ids: list[int]) -> None:
    pasted = {"products": [{"key": "a", "inci": "Aqua, Retinol"}], "items": []}
    assert client.post(URL, json=pasted).status_code == 422
    both = {"products": [{"key": "a", "product_id": product_ids[0], "inci": "Aqua"}], "items": []}
    assert client.post(URL, json=both).status_code == 422


def test_unknown_products_and_bad_shapes_are_refused(client: TestClient) -> None:
    unknown = routine([999_999_999])
    response = client.post(URL, json=unknown)
    assert response.status_code == 422 and "unknown product ids" in response.json()["detail"]
    dangling = {
        "products": [],
        "items": [{"product_key": "x", "session": "AM", "days": [0], "step": 1}],
    }
    assert client.post(URL, json=dangling).status_code == 422
    twice = {"products": [{"key": "a", "product_id": 1}, {"key": "a", "product_id": 2}]}
    assert client.post(URL, json={**twice, "items": []}).status_code == 422


def test_size_limits(client: TestClient, product_ids: list[int]) -> None:
    too_many = routine((product_ids * 2)[: DEMO_MAX_PRODUCTS + 1])
    too_many["items"] = []
    assert client.post(URL, json=too_many).status_code == 422
    body = routine(product_ids[:1])
    step = body["items"][0]
    body["items"] = [{**step, "step": n % 50 + 1} for n in range(DEMO_MAX_ITEMS + 1)]
    assert client.post(URL, json=body).status_code == 422
    body["items"] = body["items"][:DEMO_MAX_ITEMS]
    assert client.post(URL, json=body).status_code == 200


def test_checks_are_limited_per_ip(client: TestClient) -> None:
    empty = {"products": [], "items": []}
    codes = [client.post(URL, json=empty).status_code for _ in range(DEMO_CHECKS[0] + 1)]
    assert codes == [200] * DEMO_CHECKS[0] + [429]
