"""Check every seeded product's ingredient list against its source page:
uv run python -m scripts.verify_products [slug ...]

Exit code 1 if any product fails, so it can gate a PR.
"""

import sys
import urllib.error

from app.inci import parse_inci
from app.seed import load_toml
from app.sources import fetch_text, first_out_of_order, missing_on_page


def main(slugs: list[str]) -> int:
    products = load_toml("products.toml").get("product", [])
    if slugs:
        products = [p for p in products if p["slug"] in slugs]

    failed = 0
    for p in products:
        try:
            page = fetch_text(p["source_url"])
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"FAIL  {p['slug']}: cannot fetch {p['source_url']} ({e})")
            failed += 1
            continue
        names = [e.raw for e in parse_inci(p["ingredients"])]
        missing = missing_on_page(page, names)
        out_of_order = first_out_of_order(page, names)
        if missing:
            print(f"FAIL  {p['slug']}: {len(missing)} not on page: {', '.join(missing[:5])}")
            failed += 1
        elif out_of_order:
            print(f"FAIL  {p['slug']}: order differs from the page from '{out_of_order}' on")
            failed += 1
        else:
            print(f"OK    {p['slug']}")

    print(f"\n{len(products) - failed}/{len(products)} products verified.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
