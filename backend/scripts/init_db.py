"""Create or update the database schema: uv run python -m scripts.init_db"""

from app.console import use_utf8_output
from app.db import get_engine, init_schema

if __name__ == "__main__":
    use_utf8_output()
    init_schema(get_engine())
    print("Schema applied.")
