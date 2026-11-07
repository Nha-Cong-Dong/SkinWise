import pytest
from fastapi.testclient import TestClient

from app import open_beauty_facts as obf
from app.barcodes import barcode_problems, normalize_barcode
from app.seed import load_toml


def test_normalize_barcode_checks_the_check_digit() -> None:
    assert normalize_barcode("3337875597180") == "3337875597180"
    assert normalize_barcode(" 3337875-597180 ") == "3337875597180"
    assert normalize_barcode("96385074") == "96385074"  # EAN-8
    assert normalize_barcode("3337875597181") is None  # one digit off
    assert normalize_barcode("33378755971") is None  # 11 digits
    assert normalize_barcode("３３３７８７５５９７１８０") is None  # full-width digits
    assert normalize_barcode("") is None


def test_normalize_barcode_files_upc_a_as_ean_13() -> None:
    # Open Beauty Facts answers 500 to the 12-digit form.
    assert normalize_barcode("079298300086") == "0079298300086"


def test_seeded_barcodes_are_valid_unique_and_sourced() -> None:
    products = load_toml("products.toml")["product"]
    assert barcode_problems(products) == []
    assert any(p.get("barcodes") for p in products)


def test_barcode_problems() -> None:
    url = "https://example.com/p"
    products = [
        {"slug": "a", "barcodes": [{"code": "3337875597181", "source_url": url}]},  # check digit
        {"slug": "b", "barcodes": [{"code": "3337875597180"}]},  # no source
        {"slug": "c", "barcodes": [{"code": "3337875597180", "source_url": url}]},
        {"slug": "d", "barcodes": [{"code": "079298300086", "source_url": url}] * 2},
        # The UPC-A and EAN-13 spellings of one code are the same barcode.
        {"slug": "e", "barcodes": [{"code": "0079298300086", "source_url": url}]},
    ]
    assert barcode_problems(products) == [
        "a: '3337875597181' is not a valid barcode",
        "b: barcode 3337875597180 has no source_url",
        "c: barcode 3337875597180 is also on b",
        "d: barcode 079298300086 is listed twice",
        "e: barcode 0079298300086 is also on d",
    ]


@pytest.fixture
def no_open_beauty_facts(monkeypatch: pytest.MonkeyPatch) -> None:
    def fetch_record(code: str) -> dict:
        raise AssertionError("a seeded barcode must not reach Open Beauty Facts")

    monkeypatch.setattr(obf, "fetch_record", fetch_record)


@pytest.mark.usefixtures("no_open_beauty_facts")
def test_barcode_route_finds_a_seeded_product(client: TestClient) -> None:
    response = client.get("/barcode/3337872412998")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "skinwise"
    assert body["barcode"] == "3337872412998"
    assert body["size"] == "40ml"
    product = body["product"]
    assert product["slug"] == "la-roche-posay-cicaplast-baume-b5-plus"
    assert product["brand"] == "La Roche-Posay"
    assert isinstance(product["groups"], list)


@pytest.mark.usefixtures("no_open_beauty_facts")
def test_barcode_route_finds_a_seeded_upc_a_in_either_form(client: TestClient) -> None:
    slug = "paulas-choice-skin-perfecting-2-bha-liquid-exfoliant"
    for code in ("0655439920100", "655439920100", "655439-920100"):
        body = client.get(f"/barcode/{code}").json()
        assert body["source"] == "skinwise", code
        assert body["barcode"] == "0655439920100"
        assert body["product"]["slug"] == slug
