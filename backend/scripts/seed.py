"""Load backend/data/*.toml into the database: uv run python -m scripts.seed"""

from app.console import use_utf8_output
from app.db import get_engine, init_schema
from app.seed import seed

if __name__ == "__main__":
    use_utf8_output()
    engine = get_engine()
    init_schema(engine)
    counts = seed(engine)
    print(
        f"Seeded {counts['groups']} groups, {counts['ingredients']} ingredients, "
        f"{counts['eu_names']} EU ingredient names, {counts['products']} products, "
        f"{counts['rules']} rules "
        f"({counts['published_rules']} published), {counts['goals']} goals, "
        f"{counts['goal_items']} goal items ({counts['published_goal_items']} published), "
        f"{counts['goal_articles']} goal articles "
        f"({counts['published_goal_articles']} published)."
    )
