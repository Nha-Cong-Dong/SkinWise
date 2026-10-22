"""Load backend/data/*.toml into the database: uv run python -m scripts.seed"""

from app.db import get_engine, init_schema
from app.seed import seed

if __name__ == "__main__":
    engine = get_engine()
    init_schema(engine)
    counts = seed(engine)
    print(
        f"Seeded {counts['groups']} groups, {counts['ingredients']} ingredients, "
        f"{counts['products']} products."
    )
