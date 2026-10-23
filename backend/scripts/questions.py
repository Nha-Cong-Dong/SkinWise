"""List questions users sent in, for a reviewer to pick which become sourced myth cards.

uv run python -m scripts.questions            # new questions
uv run python -m scripts.questions --all      # every status
"""

import sys

from app.db import get_engine
from app.questions import list_questions

STATUSES = ["new", "accepted", "rejected", "answered"]

if __name__ == "__main__":
    statuses = STATUSES if "--all" in sys.argv[1:] else ["new"]
    # Questions are Vietnamese; Windows consoles default to cp1252.
    sys.stdout.reconfigure(encoding="utf-8")
    with get_engine().connect() as conn:
        rows = list_questions(conn, statuses)
    for q in rows:
        extras = []
        if q.product_ids:
            extras.append(f"products {q.product_ids}")
        if q.group_codes:
            extras.append(f"groups {q.group_codes}")
        suffix = f"  ({'; '.join(extras)})" if extras else ""
        print(f"#{q.id} [{q.status}] {q.created_at:%Y-%m-%d %H:%M}{suffix}\n  {q.question}")
    print(f"{len(rows)} question(s).")
