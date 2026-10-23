"""Product queries for the API: search, detail, existence checks."""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import bindparam, text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.inci import normalize_name

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
class ProductIngredientRow:
    position: int
    raw_name: str
    inci_name: str | None
    groups: tuple[str, ...]


@dataclass(frozen=True)
class ProductDetailRow(ProductRow):
    ingredients_source: str
    source_url: str | None
    source_retrieved_at: datetime | None
    ingredients: tuple[ProductIngredientRow, ...]


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
    SELECT {_COLUMNS}, p.ingredients_source, p.source_url, p.source_retrieved_at
    FROM products p WHERE p.id = :id
    """
)

_INGREDIENTS = text(
    """
    SELECT pi.position, pi.raw_name, i.inci_name,
           coalesce(array_agg(g.group_code ORDER BY g.group_code)
                    FILTER (WHERE g.group_code IS NOT NULL), '{}') AS groups
    FROM product_ingredients pi
    LEFT JOIN ingredients i ON i.id = pi.ingredient_id
    LEFT JOIN ingredient_groups g ON g.ingredient_id = pi.ingredient_id
    WHERE pi.product_id = :id
    GROUP BY pi.position, pi.raw_name, i.inci_name
    ORDER BY pi.position
    """
)


def get_product(db: Session | Connection, product_id: int) -> ProductDetailRow | None:
    row = db.execute(_DETAIL, {"id": product_id}).first()
    if row is None:
        return None
    ingredients = tuple(
        ProductIngredientRow(r.position, r.raw_name, r.inci_name, tuple(r.groups))
        for r in db.execute(_INGREDIENTS, {"id": product_id})
    )
    return ProductDetailRow(*row, ingredients=ingredients)


_EXISTING = text("SELECT id FROM products WHERE id IN :ids").bindparams(
    bindparam("ids", expanding=True)
)


def existing_product_ids(db: Session | Connection, product_ids: list[int]) -> set[int]:
    if not product_ids:
        return set()
    return set(db.execute(_EXISTING, {"ids": product_ids}).scalars())
