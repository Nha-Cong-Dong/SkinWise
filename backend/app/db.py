from collections.abc import Iterator
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from fastapi import Depends
from sqlalchemy import Connection, Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.blog import backfill_search_text
from app.config import get_settings
from app.inci import normalize_name

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


@lru_cache
def get_engine() -> Engine:
    return create_engine(get_settings().database_url, pool_pre_ping=True)


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one session per request."""
    with sessionmaker(bind=get_engine())() as session:
        yield session


DbSession = Annotated[Session, Depends(get_session)]


def init_schema(engine: Engine) -> None:
    """Apply schema.sql. The SQL is idempotent, so this is safe to run repeatedly."""
    with engine.begin() as conn:
        conn.exec_driver_sql(SCHEMA_PATH.read_text(encoding="utf-8"))
        _backfill_ingredient_search_names(conn)
        backfill_search_text(conn)


def _backfill_ingredient_search_names(conn: Connection) -> None:
    """Fill product_ingredients.search_name on databases seeded before the column existed.

    Done in Python so the value is exactly normalize_name(raw_name); SQL unaccent() differs
    (e.g. on dashes and quotes).
    """
    rows = conn.execute(
        text(
            "SELECT product_id, position, raw_name FROM product_ingredients"
            " WHERE search_name IS NULL"
        )
    ).all()
    for product_id, position, raw_name in rows:
        conn.execute(
            text(
                "UPDATE product_ingredients SET search_name = :name"
                " WHERE product_id = :product_id AND position = :position"
            ),
            {"name": normalize_name(raw_name), "product_id": product_id, "position": position},
        )
