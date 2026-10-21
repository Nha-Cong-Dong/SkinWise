"""Create or update the database schema: uv run python -m scripts.init_db"""

from app.db import get_engine, init_schema

if __name__ == "__main__":
    init_schema(get_engine())
    print("Schema applied.")
