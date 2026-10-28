"""Rules in the database: validation before seeding, and loading what the engine may use."""

from typing import Any

from sqlalchemy import bindparam, text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.engine import Rule, RuleSource


def rule_problems(rule: dict[str, Any], known_urls: set[str]) -> list[str]:
    """Why this rule from rules.toml must not be seeded as written (empty = fine)."""
    problems = []
    if rule["kind"] == "duplicate" and rule.get("group_b"):
        problems.append("duplicate rules use group_a only")
    if rule["kind"] in {"conflict", "myth"} and not rule.get("group_b"):
        problems.append(f"{rule['kind']} rules need group_b")
    if rule["kind"] == "usage" and rule.get("group_b"):
        problems.append("usage rules use group_a only")
    if (rule["kind"] == "usage") != (rule.get("scope") == "routine"):
        problems.append('usage rules, and only they, have scope = "routine"')
    for s in rule.get("sources", []):
        if s["url"] not in known_urls:
            problems.append(f"source {s['url']} has no [[source]] block")
        if not s.get("quote", "").strip():
            problems.append(f"source {s['url']} has no quote")
    if rule.get("published"):
        if not rule.get("sources"):
            problems.append("published without a source")
        if not rule.get("reviewed_by") or not rule.get("reviewed_at"):
            problems.append("published without reviewed_by and reviewed_at")
    return problems


_PUBLISHED_RULES = text(
    """
    SELECT r.id, r.key, r.kind, r.severity, r.scope, r.evidence_level, r.group_a, r.group_b,
           r.title_vi, r.explanation_vi, r.reviewed_at::date AS reviewed_at,
           s.title, s.publisher, s.url, rs.quote
    FROM rules r
    JOIN rule_sources rs ON rs.rule_id = r.id
    JOIN sources s ON s.id = rs.source_id
    WHERE r.published
    ORDER BY r.id, rs.position
    """
)


def load_published_rules(db: Session | Connection) -> list[Rule]:
    """Published rules with their sources. The inner join drops a rule that somehow lost
    its sources: no source, no warning."""
    rows = db.execute(_PUBLISHED_RULES).all()
    rules: dict[int, Rule] = {}
    for row in rows:
        source = RuleSource(row.title, row.publisher, row.url, row.quote)
        if row.id in rules:
            prev = rules[row.id]
            rules[row.id] = Rule(**{**prev.__dict__, "sources": (*prev.sources, source)})
        else:
            rules[row.id] = Rule(
                row.id, row.key, row.kind, row.severity, row.scope, row.evidence_level,
                row.group_a, row.group_b, row.title_vi, row.explanation_vi, (source,),
                row.reviewed_at,
            )  # fmt: skip
    return list(rules.values())


_PRODUCT_GROUPS = text(
    """
    SELECT pi.product_id, ig.group_code
    FROM product_ingredients pi
    JOIN ingredient_groups ig ON ig.ingredient_id = pi.ingredient_id
    WHERE pi.product_id IN :ids
    """
).bindparams(bindparam("ids", expanding=True))


def load_product_groups(db: Session | Connection, product_ids: list[int]) -> dict[int, set[str]]:
    groups: dict[int, set[str]] = {pid: set() for pid in product_ids}
    if product_ids:
        for row in db.execute(_PRODUCT_GROUPS, {"ids": product_ids}):
            groups[row.product_id].add(row.group_code)
    return groups
