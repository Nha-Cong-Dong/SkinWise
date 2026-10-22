"""Check every rule quote in data/rules.toml against its live source page:
uv run python -m scripts.verify_quotes [rule-key ...]

A quote must appear verbatim on the page (case, whitespace, dash and quote variants ignored).
Exit code 1 if any quote fails, so it can gate a PR.
"""

import sys
import urllib.error

from app.seed import load_toml
from app.sources import BlockedError, fetch_text, missing_on_page


def main(keys: list[str]) -> int:
    rules = load_toml("rules.toml").get("rule", [])
    if keys:
        rules = [r for r in rules if r["key"] in keys]

    pages: dict[str, str] = {}
    checked = failed = 0
    for rule in rules:
        for source in rule.get("sources", []):
            url = source["url"]
            checked += 1
            try:
                if url not in pages:
                    pages[url] = fetch_text(url)
            except (urllib.error.URLError, TimeoutError, BlockedError) as e:
                print(f"FAIL  {rule['key']}: cannot fetch {url} ({e})")
                failed += 1
                continue
            if missing_on_page(pages[url], [source["quote"]]):
                print(f"FAIL  {rule['key']}: quote not found on {url}")
                failed += 1
            else:
                print(f"OK    {rule['key']}: {url}")
        if not rule.get("sources"):
            print(f"--    {rule['key']}: no source yet")

    print(f"\n{checked - failed}/{checked} quotes verified.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
