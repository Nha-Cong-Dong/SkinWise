"""Check every seeded product against its source pages:
uv run python -m scripts.verify_products [slug ...]

The ingredient list must be on the product's page, complete and in order, and each barcode on
the page given as its source. Exit code 1 if any product fails, so it can gate a PR.
"""

import sys
import urllib.error
from collections.abc import Callable
from typing import Any

from app.inci import parse_inci
from app.seed import load_toml
from app.sources import BlockedError, fetch_text, first_out_of_order, missing_on_page

FETCH_ERRORS = (urllib.error.URLError, TimeoutError, BlockedError)
Page = Callable[[str], str]  # page text by URL, fetched once


def main(slugs: list[str]) -> int:
    products = load_toml("products.toml").get("product", [])
    if slugs:
        products = [p for p in products if p["slug"] in slugs]

    pages: dict[str, str] = {}  # a barcode's source is often the product's own page

    def page(url: str) -> str:
        if url not in pages:
            pages[url] = fetch_text(url)
        return pages[url]

    failed = 0
    for p in products:
        if problems := ingredient_problems(p, page) + barcode_problems(p, page):
            print(f"FAIL  {p['slug']}: {'; '.join(problems)}")
            failed += 1
        else:
            print(f"OK    {p['slug']}")

    print(f"\n{len(products) - failed}/{len(products)} products verified.")
    return 1 if failed else 0


def ingredient_problems(p: dict[str, Any], page: Page) -> list[str]:
    try:
        text = page(p["source_url"])
    except FETCH_ERRORS as e:
        return [f"cannot fetch {p['source_url']} ({e})"]
    names = [e.raw for e in parse_inci(p["ingredients"])]
    if missing := missing_on_page(text, names):
        return [f"{len(missing)} not on page: {', '.join(missing[:5])}"]
    if out_of_order := first_out_of_order(text, names):
        return [f"order differs from the page from '{out_of_order}' on"]
    return []


def barcode_problems(p: dict[str, Any], page: Page) -> list[str]:
    problems: list[str] = []
    for b in p.get("barcodes", []):
        try:
            text = page(b["source_url"])
        except FETCH_ERRORS as e:
            problems.append(f"cannot fetch {b['source_url']} ({e})")
            continue
        if b["code"] not in text:
            problems.append(f"barcode {b['code']} not on {b['source_url']}")
    return problems


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
