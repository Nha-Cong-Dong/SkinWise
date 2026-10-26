"""Check every quote against its live source page:
uv run python -m scripts.verify_quotes [rule-key ...]

Covers rule quotes in data/rules.toml; when no rule keys are given, also the legal basis in
data/concentration_limits.toml and data/legal_basis.toml and the label evidence of everyday
names in data/common_names.toml. A quote must appear verbatim on
the page (case, whitespace, dash and quote variants ignored). Exit code 1 if any quote fails,
so it can gate a PR.
"""

import sys
import urllib.error

from app.seed import load_toml
from app.sources import BlockedError, fetch_text, missing_on_page


def quotes_to_check(keys: list[str]) -> list[tuple[str, str | None, str | None]]:
    """(label, url, quote); url None means the rule has no source yet."""
    rules = load_toml("rules.toml").get("rule", [])
    if keys:
        rules = [r for r in rules if r["key"] in keys]
    items: list[tuple[str, str | None, str | None]] = []
    for rule in rules:
        items += [(rule["key"], s["url"], s["quote"]) for s in rule.get("sources", [])]
        if not rule.get("sources"):
            items.append((rule["key"], None, None))
    if not keys:
        limits = load_toml("concentration_limits.toml")
        order = limits["ordering_rule"]
        items += [("ordering-rule", order["url"], order["quote"])]
        items += [("ordering-rule colorants", order["url"], order["colorant_quote"])]
        items += [(f"limit {x['inci']}", x["url"], x["quote"]) for x in limits["limit"]]
        for name, basis in load_toml("legal_basis.toml").items():
            items += [(f"legal basis {name}", basis["url"], q) for q in basis["quotes"]]
        for entry in load_toml("common_names.toml")["name"]:
            label = f"common name {entry['name']}"
            items += [(label, s["url"], s["quote"]) for s in entry.get("sources", [])]
    return items


def main(keys: list[str]) -> int:
    pages: dict[str, str] = {}
    checked = failed = 0
    for label, url, quote in quotes_to_check(keys):
        if url is None or quote is None:
            print(f"--    {label}: no source yet")
            continue
        checked += 1
        try:
            if url not in pages:
                pages[url] = fetch_text(url)
        except (urllib.error.URLError, TimeoutError, BlockedError) as e:
            print(f"FAIL  {label}: cannot fetch {url} ({e})")
            failed += 1
            continue
        if missing_on_page(pages[url], [quote]):
            print(f"FAIL  {label}: quote not found on {url}")
            failed += 1
        else:
            print(f"OK    {label}: {url}")

    print(f"\n{checked - failed}/{checked} quotes verified.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
