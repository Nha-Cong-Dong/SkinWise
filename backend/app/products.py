"""Product queries for the API: search, detail, existence checks."""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import bindparam, text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.inci import normalize_name, parse_inci
from app.ingredients import ResolvedEntry, resolve

# word_similarity compares the query with the best-matching part of "brand name", so a
# query naming only the product still scores high. 0.3 tolerates a typo per word or so.
SIMILARITY_THRESHOLD = 0.3


@dataclass(frozen=True)
class ProductRow:
    id: int
    slug: str | None
    brand: str
    name: str
    market: str | None
    verification_status: str


@dataclass(frozen=True)
class ProductDetailRow(ProductRow):
    ingredients_source: str
    source_url: str | None
    source_retrieved_at: datetime | None
    ingredients: tuple[ResolvedEntry, ...]


_COLUMNS = "p.id, p.slug, p.brand, p.name, p.market, p.verification_status"

_ALL = text(f"SELECT {_COLUMNS} FROM products p ORDER BY p.brand, p.name LIMIT :limit")

_SEARCH = text(
    f"""
    SELECT {_COLUMNS}
    FROM products p
    WHERE word_similarity(:q, p.search_name) >= :threshold
       OR p.search_name LIKE '%' || :pattern || '%' ESCAPE '\\'
    ORDER BY word_similarity(:q, p.search_name) DESC, p.brand, p.name
    LIMIT :limit
    """
)


def search_products(db: Session | Connection, query: str, limit: int) -> list[ProductRow]:
    """Typo- and diacritic-tolerant search; an empty query lists every product."""
    q = normalize_name(query)
    if not q:
        return [ProductRow(*row) for row in db.execute(_ALL, {"limit": limit})]
    pattern = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    params = {"q": q, "pattern": pattern, "threshold": SIMILARITY_THRESHOLD, "limit": limit}
    return [ProductRow(*row) for row in db.execute(_SEARCH, params)]


_DETAIL = text(
    f"""
    SELECT {_COLUMNS}, p.ingredients_source, p.source_url, p.source_retrieved_at,
           p.ingredients_raw
    FROM products p WHERE p.id = :id
    """
)


def get_product(db: Session | Connection, product_id: int) -> ProductDetailRow | None:
    """The product with its ingredient list resolved the same way as a pasted list."""
    row = db.execute(_DETAIL, {"id": product_id}).first()
    if row is None:
        return None
    *columns, raw = row
    return ProductDetailRow(*columns, ingredients=tuple(resolve(db, parse_inci(raw or ""))))


_EXISTING = text("SELECT id FROM products WHERE id IN :ids").bindparams(
    bindparam("ids", expanding=True)
)


def existing_product_ids(db: Session | Connection, product_ids: list[int]) -> set[int]:
    if not product_ids:
        return set()
    return set(db.execute(_EXISTING, {"ids": product_ids}).scalars())
