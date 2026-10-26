"""Look a product up by barcode on Open Beauty Facts (direction D).

Open Beauty Facts is a community database under the ODbL. Nothing from it is stored on the
server: the route passes the record through with attribution, the browser keeps it like a
pasted list, and the user compares it with the package before adding it. Its ingredient list
goes through `read_label_text()` like pasted text, because community entries can be partial,
translated or split wrongly ("caprylic, capric triglyceride").
"""

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from app.sources import USER_AGENT

API_URL = "https://world.openbeautyfacts.org/api/v2/product/{code}.json"
# `ingredients_text_languages` gives the list in every language the record has.
FIELDS = "product_name,brands,lang,last_modified_t,ingredients_text,ingredients_text_languages"
PRODUCT_URL = "https://world.openbeautyfacts.org/product/{code}"
# ODbL asks for a notice and a link to the licence wherever the data is shown.
LICENSE_URL = "https://opendatacommons.org/licenses/odbl/1-0/"

_TEXT_FIELD = re.compile(r"ingredients_text_([a-z]{2,3})")
_GTIN_LENGTHS = {8, 12, 13, 14}  # EAN-8, UPC-A, EAN-13, GTIN-14


class OpenBeautyFactsError(Exception):
    """Open Beauty Facts could not be reached or answered with an error."""


@dataclass(frozen=True)
class IngredientsText:
    text: str
    language: str | None  # language code of the record field, when known


@dataclass(frozen=True)
class FoundProduct:
    barcode: str
    name: str | None
    brand: str | None
    ingredients: IngredientsText | None  # None: the record has no ingredient list yet
    last_modified_at: datetime | None


def normalize_barcode(raw: str) -> str | None:
    """The digits of a GTIN barcode with a valid check digit, or None.

    Spaces and dashes are ignored. A wrong check digit is almost always a typo, and looking it
    up would show some other product.
    """
    code = re.sub(r"[\s-]", "", raw)
    if not (code.isascii() and code.isdigit()) or len(code) not in _GTIN_LENGTHS:
        return None
    if len(code) == 12:
        code = "0" + code  # Open Beauty Facts files a UPC-A under its EAN-13 form
    body, check = code[:-1], int(code[-1])
    # From the right, digits are weighted 3, 1, 3, 1...
    total = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return code if (10 - total % 10) % 10 == check else None


def fetch_record(code: str, timeout: float = 15) -> dict | None:
    """The product record, or None when Open Beauty Facts has no product with this code.
    Tests replace this function."""
    url = API_URL.format(code=code) + "?" + urllib.parse.urlencode({"fields": FIELDS})
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise OpenBeautyFactsError(f"Open Beauty Facts answered {e.code}") from e
    except (urllib.error.URLError, ConnectionError, TimeoutError, ValueError) as e:
        raise OpenBeautyFactsError("cannot reach Open Beauty Facts") from e
    if data.get("status") != 1 or not isinstance(data.get("product"), dict):
        return None
    return data["product"]


def ingredient_texts(record: dict) -> list[IngredientsText]:
    """Every non-empty ingredient list of the record, each text once, the main one first."""
    main = record.get("lang") if isinstance(record.get("lang"), str) else None
    candidates = [(main, record.get("ingredients_text"))]
    if isinstance(languages := record.get("ingredients_text_languages"), dict):
        candidates += languages.items()
    candidates += [(m.group(1), v) for k, v in record.items() if (m := _TEXT_FIELD.fullmatch(k))]
    texts: dict[str, IngredientsText] = {}
    for language, value in candidates:
        if isinstance(value, str) and (text := value.strip()) and text not in texts:
            texts[text] = IngredientsText(text, language)
    return list(texts.values())


def choose_text(texts: list[IngredientsText], known: Callable[[str], int]) -> IngredientsText:
    """The list SkinWise recognises best. A record often holds the INCI list next to a
    translation ("Eau, glycérine…"); `known` counts the recognised entries of a text. Ties go
    to English, then to the record's main language."""
    return max(texts, key=lambda t: (known(t.text), t.language == "en"))


def read_record(code: str, record: dict, known: Callable[[str], int]) -> FoundProduct:
    def label(key: str) -> str | None:
        value = record.get(key)
        return (value.strip() or None) if isinstance(value, str) else None

    texts = ingredient_texts(record)
    modified = record.get("last_modified_t")
    return FoundProduct(
        barcode=code,
        name=label("product_name"),
        brand=label("brands"),
        ingredients=choose_text(texts, known) if texts else None,
        last_modified_at=(
            datetime.fromtimestamp(modified, UTC) if isinstance(modified, int) else None
        ),
    )
