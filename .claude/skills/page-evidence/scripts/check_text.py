"""Check text against a saved page (see fetch_page.py) with the same matching as the verify scripts
(case, whitespace, dash and quote variants ignored). From the repository root:

uv run --project backend python .claude/skills/page-evidence/scripts/check_text.py PAGE
    --quote "..." [--quote "..."]  |  --quotes-file FILE  |  --ingredients-file FILE

--quotes-file holds one quote per line. --ingredients-file holds an ingredient list as it would go
into products.toml; every entry must be on the page and in order, as verify_products requires.
For a missing quote, prints the longest leading part that is on the page, to show where it differs.
Exit code 1 if anything is missing or out of order.
"""

import argparse
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[4] / "backend"
sys.path.insert(0, str(BACKEND))

from app.inci import parse_inci  # noqa: E402
from app.sources import comparable, first_out_of_order, missing_on_page  # noqa: E402


def found_prefix(page: str, quote: str) -> str:
    """Longest run of leading words of the quote that is on the page."""
    words = quote.split()
    lo, hi = 0, len(words)
    while lo < hi:  # word prefixes found on the page are monotone, so binary search works
        mid = (lo + hi + 1) // 2
        if comparable(" ".join(words[:mid])) in page:
            lo = mid
        else:
            hi = mid - 1
    return " ".join(words[:lo])


def check_quotes(page_text: str, quotes: list[str]) -> int:
    page = comparable(page_text)
    missing = set(missing_on_page(page_text, quotes))
    for q in quotes:
        if q in missing:
            print(f"MISSING  {q}")
            print(f"         on page up to: {found_prefix(page, q) or '(not even the first word)'}")
        else:
            print(f"OK       {q}")
    return 1 if missing else 0


def check_ingredients(page_text: str, ingredients: str) -> int:
    names = [e.raw for e in parse_inci(ingredients)]
    missing = missing_on_page(page_text, names)
    out_of_order = first_out_of_order(page_text, names) if not missing else None
    for name in missing:
        print(f"MISSING  {name}")
    if out_of_order:
        print(f"ORDER    '{out_of_order}' is not after the entry before it")
    if missing or out_of_order:
        return 1
    print(f"OK       {len(names)} entries on the page, in order")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("page", type=Path)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--quote", action="append")
    group.add_argument("--quotes-file", type=Path)
    group.add_argument("--ingredients-file", type=Path)
    args = parser.parse_args()

    page_text = args.page.read_text(encoding="utf-8")
    if args.ingredients_file:
        return check_ingredients(page_text, args.ingredients_file.read_text(encoding="utf-8"))
    if args.quotes_file:
        lines = args.quotes_file.read_text(encoding="utf-8").splitlines()
        quotes = [q.strip() for q in lines if q.strip()]
    else:
        quotes = args.quote
    return check_quotes(page_text, quotes)


if __name__ == "__main__":
    sys.exit(main())
