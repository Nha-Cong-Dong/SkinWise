"""Copy a passage out of a saved page (see fetch_page.py) without retyping it. From the repository
root:

uv run --project backend python .claude/skills/page-evidence/scripts/slice_text.py PAGE
    --start "Ingredients:" (--end "How to use" | --list)

Prints the text after the start marker up to (not including) the end marker, whitespace collapsed.
Markers match case-insensitively. When the start marker occurs more than once, --list shows each
occurrence with context and --occurrence N picks one (1-based). --out FILE also saves the passage.
"""

import argparse
import re
import sys
from pathlib import Path


def occurrences(text: str, marker: str) -> list[int]:
    return [m.start() for m in re.finditer(re.escape(marker), text, re.IGNORECASE)]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("page", type=Path)
    parser.add_argument("--start", required=True)
    parser.add_argument("--end")
    parser.add_argument("--occurrence", type=int)
    parser.add_argument("--include-start", action="store_true")
    parser.add_argument("--list", action="store_true", help="show each occurrence of --start")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    text = args.page.read_text(encoding="utf-8")
    starts = occurrences(text, args.start)
    if not starts:
        print(f"NOT FOUND  start marker {args.start!r}")
        return 1
    if args.list or (len(starts) > 1 and args.occurrence is None):
        for n, i in enumerate(starts, 1):
            context = " ".join(text[i : i + 160].split())
            print(f"[{n}] at {i}: {context}")
        if not args.list:
            print(f"start marker occurs {len(starts)} times: pick one with --occurrence N")
        return 0 if args.list else 1
    if not args.end:
        print("--end is required unless --list is given")
        return 1

    n = args.occurrence or 1
    if not 1 <= n <= len(starts):
        print(f"--occurrence must be between 1 and {len(starts)}")
        return 1
    begin = starts[n - 1] + (0 if args.include_start else len(args.start))
    end = re.search(re.escape(args.end), text[begin:], re.IGNORECASE)
    if end is None:
        print(f"NOT FOUND  end marker {args.end!r} after occurrence {n} of the start marker")
        return 1
    passage = " ".join(text[begin : begin + end.start()].split())
    print(passage)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(passage + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
