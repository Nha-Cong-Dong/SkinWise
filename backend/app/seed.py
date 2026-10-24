"""Load backend/data/* into the database. Upserts on natural keys, so it is safe to rerun
and product ids stay stable (routines saved in the browser refer to them)."""

import tomllib
from pathlib import Path
from typing import Any

from sqlalchemy import Engine, text
from sqlalchemy.engine import Connection

from app.inci import normalize_name, parse_inci
from app.ingredients import resolve
from app.rules import rule_problems

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def load_toml(name: str) -> dict[str, Any]:
    with (DATA_DIR / name).open("rb") as f:
        return tomllib.load(f)


def data_lines(name: str) -> list[str]:
    """Non-comment lines of a generated data file (eu_*.txt / eu_*.tsv)."""
    with (DATA_DIR / name).open(encoding="utf-8") as f:
        return [line.rstrip("\n") for line in f if line.strip() and not line.startswith("#")]


def load_eu_names() -> dict[str, tuple[str, bool, list[str]]]:
    """normalized name -> (name as printed, in current glossary, usual functions)."""
    names: dict[str, tuple[str, bool, list[str]]] = {}
    for name in data_lines("eu_glossary.txt"):
        names.setdefault(normalize_name(name), (name, True, []))
    for line in data_lines("eu_inventory_2006.tsv"):
        name, codes = line.split("\t")
        printed, in_glossary, functions = names.get(normalize_name(name), (name, False, []))
        merged = functions + [c for c in codes.split("|") if c and c not in functions]
        names[normalize_name(name)] = (printed, in_glossary, merged)
    return names


def load_functions() -> list[dict[str, Any]]:
    definitions = dict(line.split("\t") for line in data_lines("eu_functions_2006.tsv"))
    functions = load_toml("functions_vi.toml")["function"]
    return [{**f, "definition_en": definitions.get(f["code"])} for f in functions]


def seed(engine: Engine) -> dict[str, int]:
    groups = load_toml("functional_groups.toml")["group"]
    ingredients = load_toml("ingredients.toml")["ingredient"]
    products = load_toml("products.toml").get("product", [])
    rules_data = load_toml("rules.toml")
    sources, rules = rules_data.get("source", []), rules_data.get("rule", [])

    known_urls = {s["url"] for s in sources}
    problems = [f"{r['key']}: {p}" for r in rules for p in rule_problems(r, known_urls)]
    if problems:
        raise ValueError("rules.toml:\n  " + "\n  ".join(problems))

    eu_names, functions = load_eu_names(), load_functions()
    used = {code for _, _, codes in eu_names.values() for code in codes}
    if untranslated := used - {f["code"] for f in functions}:
        raise ValueError(f"functions_vi.toml is missing: {sorted(untranslated)}")

    common_names = load_toml("common_names.toml")["name"]
    if unknown := [n["name"] for n in common_names
                   if any(normalize_name(i) not in eu_names for i in n["inci"])]:  # fmt: skip
        raise ValueError(f"common_names.toml points to names not in the EU lists: {unknown}")

    with engine.begin() as conn:
        _seed_functions(conn, functions)
        _seed_eu_names(conn, eu_names)
        _seed_common_names(conn, common_names)
        _seed_groups(conn, groups)
        _seed_ingredients(conn, ingredients)
        for product in products:
            _seed_product(conn, product)
        source_ids = {s["url"]: _seed_source(conn, s) for s in sources}
        for rule in rules:
            _seed_rule(conn, rule, source_ids)
    return {
        "groups": len(groups),
        "ingredients": len(ingredients),
        "eu_names": len(eu_names),
        "products": len(products),
        "rules": len(rules),
        "published_rules": sum(1 for r in rules if r.get("published")),
    }


def _seed_functions(conn: Connection, functions: list[dict[str, Any]]) -> None:
    for f in functions:
        conn.execute(
            text(
                """
                INSERT INTO cosmetic_functions (code, definition_en, name_vi, description_vi)
                VALUES (:code, :definition_en, :name_vi, :description_vi)
                ON CONFLICT (code) DO UPDATE SET definition_en = excluded.definition_en,
                  name_vi = excluded.name_vi, description_vi = excluded.description_vi
                """
            ),
            {k: f[k] for k in ("code", "definition_en", "name_vi", "description_vi")},
        )


def _seed_eu_names(conn: Connection, names: dict[str, tuple[str, bool, list[str]]]) -> None:
    """Replaced wholesale with COPY: ~30,000 rows and nothing refers to them by id."""
    conn.execute(text("DELETE FROM inci_names"))
    cursor = conn.connection.driver_connection.cursor()
    with cursor.copy(
        "COPY inci_names (normalized_name, name, in_glossary, functions) FROM STDIN"
    ) as copy:
        for normalized, (name, in_glossary, functions) in names.items():
            copy.write_row((normalized, name, in_glossary, functions))


def _seed_common_names(conn: Connection, names: list[dict[str, Any]]) -> None:
    conn.execute(text("DELETE FROM common_names"))
    for n in names:
        conn.execute(
            text(
                """
                INSERT INTO common_names (normalized_name, name, lang, inci_names, note)
                VALUES (:normalized, :name, :lang, :inci, :note)
                """
            ),
            {
                "normalized": normalize_name(n["name"]),
                "name": n["name"],
                "lang": n["lang"],
                "inci": n["inci"],
                "note": n.get("note"),
            },
        )


def _seed_groups(conn: Connection, groups: list[dict[str, Any]]) -> None:
    for g in groups:
        conn.execute(
            text(
                """
                INSERT INTO functional_groups (code, name_vi, description_vi)
                VALUES (:code, :name_vi, :description_vi)
                ON CONFLICT (code) DO UPDATE
                  SET name_vi = excluded.name_vi, description_vi = excluded.description_vi
                """
            ),
            {"code": g["code"], "name_vi": g["name_vi"], "description_vi": g.get("description_vi")},
        )
    # Second pass: a parent may be listed after its children.
    for g in groups:
        conn.execute(
            text("UPDATE functional_groups SET parent_code = :parent WHERE code = :code"),
            {"code": g["code"], "parent": g.get("parent")},
        )


def _seed_ingredients(conn: Connection, ingredients: list[dict[str, Any]]) -> None:
    for ing in ingredients:
        ingredient_id = conn.execute(
            text(
                """
                INSERT INTO ingredients (inci_name, normalized_name, cosing_ref)
                VALUES (:inci, :normalized, :cosing_ref)
                ON CONFLICT (inci_name) DO UPDATE
                  SET normalized_name = excluded.normalized_name, cosing_ref = excluded.cosing_ref
                RETURNING id
                """
            ),
            {
                "inci": ing["inci"],
                "normalized": normalize_name(ing["inci"]),
                "cosing_ref": ing.get("cosing_ref"),
            },
        ).scalar_one()

        # Synonyms and groups are replaced wholesale so removals in the TOML take effect.
        conn.execute(
            text("DELETE FROM ingredient_synonyms WHERE ingredient_id = :id"), {"id": ingredient_id}
        )
        names = {normalize_name(n) for n in [ing["inci"], *ing.get("synonyms", [])]}
        for name in sorted(names):
            conn.execute(
                text(
                    """
                    INSERT INTO ingredient_synonyms (normalized_name, ingredient_id)
                    VALUES (:name, :id)
                    ON CONFLICT (normalized_name)
                      DO UPDATE SET ingredient_id = excluded.ingredient_id
                    """
                ),
                {"name": name, "id": ingredient_id},
            )

        conn.execute(
            text("DELETE FROM ingredient_groups WHERE ingredient_id = :id"), {"id": ingredient_id}
        )
        for code in ing.get("groups", []):
            conn.execute(
                text(
                    "INSERT INTO ingredient_groups (ingredient_id, group_code) VALUES (:id, :code)"
                ),
                {"id": ingredient_id, "code": code},
            )


def _seed_product(conn: Connection, p: dict[str, Any]) -> None:
    product_id = conn.execute(
        text(
            """
            INSERT INTO products (slug, brand, name, market, search_name, ingredients_source,
                                  source_url, source_retrieved_at, verification_status,
                                  ingredients_raw)
            VALUES (:slug, :brand, :name, :market, :search_name, 'seed',
                    :source_url, :retrieved_at, :verification_status, :ingredients_raw)
            ON CONFLICT (slug) DO UPDATE SET
              brand = excluded.brand, name = excluded.name, market = excluded.market,
              search_name = excluded.search_name, source_url = excluded.source_url,
              source_retrieved_at = excluded.source_retrieved_at,
              verification_status = excluded.verification_status,
              ingredients_raw = excluded.ingredients_raw
            RETURNING id
            """
        ),
        {
            "slug": p["slug"],
            "brand": p["brand"],
            "name": p["name"],
            "market": p.get("market"),
            "search_name": normalize_name(f"{p['brand']} {p['name']}"),
            "source_url": p["source_url"],
            "retrieved_at": p["retrieved_at"],
            "verification_status": p.get("verification_status", "unverified"),
            "ingredients_raw": p["ingredients"],
        },
    ).scalar_one()

    conn.execute(text("DELETE FROM product_ingredients WHERE product_id = :id"), {"id": product_id})
    for r in resolve(conn, parse_inci(p["ingredients"])):
        conn.execute(
            text(
                """
                INSERT INTO product_ingredients (product_id, position, ingredient_id, raw_name)
                VALUES (:product_id, :position, :ingredient_id, :raw_name)
                """
            ),
            {
                "product_id": product_id,
                "position": r.entry.position,
                "ingredient_id": r.ingredient_id,
                "raw_name": r.entry.raw,
            },
        )


def _seed_source(conn: Connection, s: dict[str, Any]) -> int:
    return conn.execute(
        text(
            """
            INSERT INTO sources (title, publisher, url, accessed_at)
            VALUES (:title, :publisher, :url, :accessed_at)
            ON CONFLICT (url) DO UPDATE SET title = excluded.title,
              publisher = excluded.publisher, accessed_at = excluded.accessed_at
            RETURNING id
            """
        ),
        {k: s.get(k) for k in ("title", "publisher", "url", "accessed_at")},
    ).scalar_one()


def _seed_rule(conn: Connection, r: dict[str, Any], source_ids: dict[str, int]) -> None:
    rule_id = conn.execute(
        text(
            """
            INSERT INTO rules (key, kind, severity, scope, evidence_level, group_a, group_b,
                               title_vi, explanation_vi, published, reviewed_by, reviewed_at)
            VALUES (:key, :kind, :severity, :scope, :evidence_level, :group_a, :group_b,
                    :title_vi, :explanation_vi, :published, :reviewed_by, :reviewed_at)
            ON CONFLICT (key) DO UPDATE SET
              kind = excluded.kind, severity = excluded.severity, scope = excluded.scope,
              evidence_level = excluded.evidence_level, group_a = excluded.group_a,
              group_b = excluded.group_b, title_vi = excluded.title_vi,
              explanation_vi = excluded.explanation_vi, published = excluded.published,
              reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at
            RETURNING id
            """
        ),
        {
            **{k: r[k] for k in ("key", "kind", "severity", "scope", "evidence_level")},
            **{k: r[k] for k in ("group_a", "title_vi", "explanation_vi")},
            "group_b": r.get("group_b"),
            "published": bool(r.get("published")),
            "reviewed_by": r.get("reviewed_by"),
            "reviewed_at": r.get("reviewed_at"),
        },
    ).scalar_one()

    conn.execute(text("DELETE FROM rule_sources WHERE rule_id = :id"), {"id": rule_id})
    for position, s in enumerate(r.get("sources", []), start=1):
        conn.execute(
            text(
                """
                INSERT INTO rule_sources (rule_id, position, source_id, quote)
                VALUES (:r, :pos, :s, :q)
                """
            ),
            {"r": rule_id, "pos": position, "s": source_ids[s["url"]], "q": s["quote"]},
        )
