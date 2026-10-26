import io
import json
import urllib.error
import urllib.request

import pytest
from fastapi.testclient import TestClient

from app import open_beauty_facts as obf
from app.open_beauty_facts import (
    IngredientsText,
    choose_text,
    ingredient_texts,
    normalize_barcode,
)

# Trimmed from the real record of 3337875598996 (CeraVe, fetched 26/10/2026): the main field is
# a French translation, the English field holds the INCI names.
CERAVE = {
    "product_name": "moisturising cream",
    "brands": "CeraVe",
    "lang": "fr",
    "last_modified_t": 1779263998,
    "ingredients_text": "Eau, glycérine, alcool cétéarylique, niacinamide",
    "ingredients_text_languages": {
        "en": "aqua, water, glycerin, cetearyl alcohol, niacinamide",
        "fr": "Eau, glycérine, alcool cétéarylique, niacinamide",
    },
}


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


def test_ingredient_texts_lists_each_text_once_main_first() -> None:
    texts = ingredient_texts(CERAVE)
    assert texts == [
        IngredientsText("Eau, glycérine, alcool cétéarylique, niacinamide", "fr"),
        IngredientsText("aqua, water, glycerin, cetearyl alcohol, niacinamide", "en"),
    ]
    assert ingredient_texts({"ingredients_text": "  ", "ingredients_text_de": ""}) == []
    # Older records have one field per language instead of the dictionary.
    assert ingredient_texts({"ingredients_text_nl": "Aqua"}) == [IngredientsText("Aqua", "nl")]


def test_choose_text_prefers_the_list_with_more_known_names() -> None:
    fr = IngredientsText("Eau, glycérine", "fr")
    en = IngredientsText("Aqua, Glycerin", "en")
    de = IngredientsText("Aqua, Glycerin, Wasser", "de")
    counts = {fr.text: 0, en.text: 2, de.text: 2}
    assert choose_text([fr, de, en], counts.__getitem__) == en  # tie: English
    assert choose_text([fr, de], counts.__getitem__) == de


def test_barcode_route_returns_the_best_list_with_attribution(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    asked = []
    monkeypatch.setattr(obf, "fetch_record", lambda code: asked.append(code) or CERAVE)
    response = client.get("/barcode/3337875598996")
    assert response.status_code == 200
    body = response.json()
    assert asked == ["3337875598996"]
    assert body["ingredients_text"] == "aqua, water, glycerin, cetearyl alcohol, niacinamide"
    assert body["name"] == "moisturising cream"
    assert body["brand"] == "CeraVe"
    assert body["source_url"] == "https://world.openbeautyfacts.org/product/3337875598996"
    assert body["license_url"] == obf.LICENSE_URL
    assert body["last_modified_at"].startswith("2026-")
    assert body["retrieved_at"]


def test_barcode_route_without_ingredients(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(obf, "fetch_record", lambda code: {"product_name": "Sữa rửa mặt"})
    body = client.get("/barcode/3337875598996").json()
    assert body["ingredients_text"] is None
    assert body["brand"] is None


def test_barcode_route_errors(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def unreachable(code: str) -> dict:
        raise obf.OpenBeautyFactsError("cannot reach Open Beauty Facts")

    monkeypatch.setattr(obf, "fetch_record", lambda code: None)
    assert client.get("/barcode/3337875598996").status_code == 404
    monkeypatch.setattr(obf, "fetch_record", unreachable)
    assert client.get("/barcode/3337875598996").status_code == 502
    # An invalid code is refused before anything is fetched.
    assert client.get("/barcode/3337875598997").status_code == 422
    assert client.get("/barcode/abc").status_code == 422


def fake_urlopen(monkeypatch: pytest.MonkeyPatch, answer) -> list[urllib.request.Request]:
    requests = []

    def urlopen(request: urllib.request.Request, timeout: float):
        requests.append(request)
        return answer(request)

    monkeypatch.setattr(obf.urllib.request, "urlopen", urlopen)
    return requests


def test_fetch_record_identifies_the_app(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {"status": 1, "product": CERAVE}
    requests = fake_urlopen(monkeypatch, lambda r: io.BytesIO(json.dumps(payload).encode()))
    assert obf.fetch_record("3337875598996") == CERAVE
    url = requests[0].full_url
    assert url.startswith("https://world.openbeautyfacts.org/api/v2/product/3337875598996.json?")
    assert "ingredients_text_languages" in url
    assert "SkinWise" in requests[0].get_header("User-agent")


def test_fetch_record_not_found_and_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    def http_error(code: int):
        def answer(request: urllib.request.Request):
            raise urllib.error.HTTPError(request.full_url, code, "", {}, None)  # type: ignore[arg-type]

        return answer

    fake_urlopen(monkeypatch, http_error(404))
    assert obf.fetch_record("3337875598996") is None
    not_found = {"status": 0, "status_verbose": "product not found"}
    fake_urlopen(monkeypatch, lambda r: io.BytesIO(json.dumps(not_found).encode()))
    assert obf.fetch_record("3337875598996") is None
    fake_urlopen(monkeypatch, http_error(500))
    with pytest.raises(obf.OpenBeautyFactsError):
        obf.fetch_record("3337875598996")
    fake_urlopen(monkeypatch, lambda r: io.BytesIO(b"<html>maintenance</html>"))
    with pytest.raises(obf.OpenBeautyFactsError):
        obf.fetch_record("3337875598996")
