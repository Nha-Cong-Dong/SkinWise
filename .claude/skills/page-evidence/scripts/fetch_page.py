"""Save a source page as plain text, fetched the way verify_quotes and verify_products fetch it.
From the repository root:

uv run --project backend python .claude/skills/page-evidence/scripts/fetch_page.py URL OUT
    [--readable]

Without --readable, text inside <script> is kept, as the verify scripts keep it (shops often embed
the ingredient list in JSON). --readable drops it, which is easier to read but may miss such lists.
Runs of spaces and blank lines are collapsed; matching ignores whitespace anyway.
Exit code: 0 saved, 1 fetch failed, 2 bot-challenge page.
"""

import argparse
import re
import sys
import urllib.error
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[4] / "backend"
sys.path.insert(0, str(BACKEND))

from app.sources import BlockedError, fetch_text, has_challenge_marker  # noqa: E402


def tidy(text: str) -> str:
    # fetch_text decodes JSON \uXXXX escapes one by one, so an emoji arrives as two surrogates;
    # join the pairs and replace any lone one, or the file cannot be written as UTF-8.
    text = text.encode("utf-16", "surrogatepass").decode("utf-16", "replace")
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    return re.sub(r"\n(?: ?\n)+", "\n\n", text).strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("out", type=Path)
    parser.add_argument("--readable", action="store_true", help="drop script contents")
    args = parser.parse_args()

    try:
        text = tidy(fetch_text(args.url, keep_scripts=not args.readable))
    except BlockedError as e:
        print(f"BLOCKED  {e}")
        return 2
    except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
        print(f"FAIL  cannot fetch {args.url} ({e})")
        return 1

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(text, encoding="utf-8")
    print(f"OK  {args.url} -> {args.out} ({len(text)} chars, {len(text.split())} words)")
    if has_challenge_marker(text):
        print(
            "NOTE  page carries a bot-challenge marker: "
            "a missing quote may mean the real page was not served"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
