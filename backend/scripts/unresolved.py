"""List ingredient names in seeded products that the dictionary does not resolve:
uv run python -m scripts.unresolved

Use it to spot actives the dictionary misses (a missed active means a missed warning).
Most unresolved names are expected: the dictionary only covers actives.
"""

from collections import Counter

from app.db import get_engine
from app.inci import parse_inci
from app.ingredients import resolve
from app.seed import load_toml

if __name__ == "__main__":
    products = load_toml("products.toml").get("product", [])
    counts: Counter[str] = Counter()
    with get_engine().connect() as conn:
        for p in products:
            for r in resolve(conn, parse_inci(p["ingredients"])):
                if r.ingredient_id is None:
                    counts[r.entry.candidates[0]] += 1

    for name, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"{n:3}  {name}")
    print(f"\n{len(counts)} distinct unresolved names in {len(products)} products.")
