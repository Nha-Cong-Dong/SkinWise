"""Product queries for the API: search, detail, existence checks."""

import re
from dataclasses import dataclass, replace
from datetime import datetime

from sqlalchemy import bindparam, text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.inci import normalize_name, parse_inci
from app.ingredients import GroupIngredient, ResolvedEntry, resolve

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
    application: str | None  # rinse_off | leave_on


@dataclass(frozen=True)
class ProductDetailRow(ProductRow):
    ingredients_source: str
    source_url: str | None
    source_retrieved_at: datetime | None
    ingredients: tuple[ResolvedEntry, ...]


_COLUMNS = "p.id, p.slug, p.brand, p.name, p.market, p.verification_status, p.application"

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

# Ingredient search needs at least this many characters, so "c" does not match everything.
MIN_INGREDIENT_QUERY = 3
# At most this many matching ingredient names are returned per product.
MAX_MATCHED_INGREDIENTS = 5

# Ingredient names match at the start of a word: at the start of the name or right after
# one of these characters. "pha" must not match "alpha-arbutin"; "ascorbic" still matches
# "3-o-ethyl ascorbic acid" and "niacinamid" still matches "niacinamide".
WORD_BOUNDARIES = " -(/,"


def word_start_regex(q: str) -> str:
    """Regex for q at the start of a word; valid in Python re and PostgreSQL (ARE)."""
    # re.escape only backslashes non-alphanumerics, which both engines read as literals.
    return f"(^|[{re.escape(WORD_BOUNDARIES)}]){re.escape(q)}"


# One label line matches when its printed name, the name or a synonym of the active it
# resolved to, or one of that active's groups has a word starting with the query. Every
# name compared here was normalized by app.inci.normalize_name in Python (search_name and
# normalized_name at seed time; group names in _matching_groups), as was the query.
_LINE_MATCHES = """
    (pi.search_name ~ :word_regex
     OR pi.ingredient_id IN (
       SELECT i.id FROM ingredients i WHERE i.normalized_name ~ :word_regex
       UNION
       SELECT s.ingredient_id FROM ingredient_synonyms s WHERE s.normalized_name ~ :word_regex
       UNION
       SELECT ig.ingredient_id FROM ingredient_groups ig
       WHERE ig.group_code = ANY(:group_codes)))
"""

_SEARCH_BY_INGREDIENT = text(
    f"""
    SELECT {_COLUMNS}
    FROM products p
    JOIN (SELECT pi.product_id, min(pi.position) AS first_position
          FROM product_ingredients pi
          WHERE {_LINE_MATCHES}
          GROUP BY pi.product_id) m ON m.product_id = p.id
    WHERE NOT (p.id = ANY(:exclude))
    ORDER BY m.first_position, p.brand, p.name
    LIMIT :limit
    """
)

_MATCHED_LINES = text(
    f"""
    SELECT pi.product_id, pi.raw_name
    FROM product_ingredients pi
    WHERE pi.product_id = ANY(:ids) AND {_LINE_MATCHES}
    ORDER BY pi.product_id, pi.position
    """
)

_GROUPS = text("SELECT code, name_vi FROM functional_groups")


@dataclass(frozen=True)
class ProductHit(ProductRow):
    # Label names (as printed) of the lines that matched the query, in label order.
    matched_ingredients: tuple[str, ...] = ()


def _matching_groups(db: Session | Connection, q: str) -> list[str]:
    """Group codes whose code ("VITAMIN_C" -> "vitamin c") or Vietnamese name has a word
    starting with q."""
    regex = re.compile(word_start_regex(q))
    return [
        code
        for code, name_vi in db.execute(_GROUPS)
        if regex.search(normalize_name(code.replace("_", " ")))
        or regex.search(normalize_name(name_vi))
    ]


def search_products(db: Session | Connection, query: str, limit: int) -> list[ProductHit]:
    """Typo- and diacritic-tolerant search; an empty query lists every product.

    Products whose name matches come first, in the usual order. With a query of at least
    MIN_INGREDIENT_QUERY characters, products that only contain a matching ingredient follow,
    ordered by how high the first matching line is on the label. Display only: nothing here
    feeds the warning engine.
    """
    q = normalize_name(query)
    if not q:
        return [ProductHit(*row) for row in db.execute(_ALL, {"limit": limit})]
    pattern = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    params = {"q": q, "pattern": pattern, "threshold": SIMILARITY_THRESHOLD, "limit": limit}
    rows = [ProductHit(*row) for row in db.execute(_SEARCH, params)]
    if len(q) < MIN_INGREDIENT_QUERY:
        return rows

    line_params = {"word_regex": word_start_regex(q), "group_codes": _matching_groups(db, q)}
    if len(rows) < limit:
        extra = db.execute(
            _SEARCH_BY_INGREDIENT,
            {**line_params, "exclude": [r.id for r in rows], "limit": limit - len(rows)},
        )
        rows += [ProductHit(*row) for row in extra]

    matched: dict[int, dict[str, str]] = {r.id: {} for r in rows}
    for product_id, raw_name in db.execute(
        _MATCHED_LINES, {**line_params, "ids": [r.id for r in rows]}
    ):
        names = matched[product_id]
        if len(names) < MAX_MATCHED_INGREDIENTS:
            names.setdefault(normalize_name(raw_name), raw_name)
    return [replace(r, matched_ingredients=tuple(matched[r.id].values())) for r in rows]


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


_APPLICATIONS = text("SELECT id, application FROM products WHERE id IN :ids").bindparams(
    bindparam("ids", expanding=True)
)


def product_applications(db: Session | Connection, product_ids: list[int]) -> dict[int, str | None]:
    """Rinse-off / leave-on of each existing product; ids not in the database are left out."""
    if not product_ids:
        return {}
    return {row.id: row.application for row in db.execute(_APPLICATIONS, {"ids": product_ids})}


_ORDERED = text("SELECT id, ingredients_ordered FROM products WHERE id IN :ids").bindparams(
    bindparam("ids", expanding=True)
)


def products_ordered(db: Session | Connection, product_ids: list[int]) -> dict[int, bool]:
    """Whether each product's stored list is in order of weight (`ingredients_ordered` in
    products.toml; false for a Drug Facts label joined active first). Shown only."""
    if not product_ids:
        return {}
    return {row.id: row.ingredients_ordered for row in db.execute(_ORDERED, {"ids": product_ids})}


# Same rows and join as load_product_groups(), so the groups listed here are the product's.
_GROUP_INGREDIENTS = text(
    """
    SELECT pi.product_id, pi.position, pi.raw_name, ig.group_code
    FROM product_ingredients pi
    LEFT JOIN ingredient_groups ig ON ig.ingredient_id = pi.ingredient_id
    WHERE pi.product_id IN :ids
    ORDER BY pi.product_id, pi.position, ig.group_code
    """
).bindparams(bindparam("ids", expanding=True))


def product_group_ingredients(
    db: Session | Connection, product_ids: list[int]
) -> dict[int, tuple[list[GroupIngredient], int]]:
    """For each seeded product: the entries that put it in each group, and how many entries
    its list has. Positions are those the seed stored from parse_inci(), the same the product
    detail shows. Shown only."""
    found: dict[int, tuple[list[GroupIngredient], set[int]]] = {
        pid: ([], set()) for pid in product_ids
    }
    if product_ids:
        for row in db.execute(_GROUP_INGREDIENTS, {"ids": product_ids}):
            items, positions = found[row.product_id]
            positions.add(row.position)
            if row.group_code is not None:
                items.append(GroupIngredient(row.group_code, row.raw_name, row.position))
    return {pid: (items, len(positions)) for pid, (items, positions) in found.items()}
