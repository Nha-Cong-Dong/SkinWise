"""Skin goals (data/goals.toml): actives commonly used for a goal and info cards, each with
sourced quotes. Display only: nothing here reaches the warning engine."""

from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

SHARED_GOAL = "all"


def goal_problems(data: dict[str, Any], group_codes: set[str], known_urls: set[str]) -> list[str]:
    """Why goals.toml must not be seeded as written (empty = fine). `known_urls` are the
    [[source]] urls of goals.toml and rules.toml together."""
    goals = data.get("goal", [])
    goal_codes = {g["code"] for g in goals}
    problems = [f"goal {code}: duplicate code" for code, n in
                Counter(g["code"] for g in goals).items() if n > 1]  # fmt: skip
    items = data.get("item", [])
    problems += [f"{key}: duplicate key" for key, n in
                 Counter(i["key"] for i in items).items() if n > 1]  # fmt: skip
    for item in items:
        problems += [
            f"{item['key']}: {p}" for p in item_problems(item, goal_codes, group_codes, known_urls)
        ]
    return problems


def item_problems(
    item: dict[str, Any],
    goal_codes: set[str],
    group_codes: set[str],
    known_urls: set[str],
) -> list[str]:
    problems = []
    if item.get("goal") not in goal_codes:
        problems.append(f"unknown goal {item.get('goal')!r}")
    kind = item.get("kind")
    if kind == "active":
        if not item.get("group"):
            problems.append("active items need group")
        elif item["group"] not in group_codes:
            problems.append(f"unknown group {item['group']!r}")
        if item.get("goal") == SHARED_GOAL:
            problems.append("items of the shared goal must be info")
    elif kind == "info":
        if item.get("group"):
            problems.append("info items have no group")
    else:
        problems.append(f"kind must be active or info, not {kind!r}")
    for s in item.get("sources", []):
        if s["url"] not in known_urls:
            problems.append(f"source {s['url']} has no [[source]] block")
        if not s.get("quote", "").strip():
            problems.append(f"source {s['url']} has no quote")
    if item.get("published"):
        if not item.get("sources"):
            problems.append("published without a source")
        if not item.get("reviewed_by") or not item.get("reviewed_at"):
            problems.append("published without reviewed_by and reviewed_at")
    return problems


@dataclass(frozen=True)
class GoalSource:
    title: str
    publisher: str
    url: str
    quote: str


@dataclass
class GoalItem:
    key: str
    kind: str
    group: str | None
    title_vi: str
    body_vi: str
    sources: list[GoalSource] = field(default_factory=list)


@dataclass
class Goal:
    code: str
    name_vi: str
    description_vi: str
    shared: bool
    actives: list[GoalItem] = field(default_factory=list)
    infos: list[GoalItem] = field(default_factory=list)


_GOALS = text("SELECT code, name_vi, description_vi, shared FROM goals ORDER BY position, code")

_PUBLISHED_ITEMS = text(
    """
    SELECT i.id, i.key, i.goal_code, i.kind, i.group_code, i.title_vi, i.body_vi,
           s.title, s.publisher, s.url, gs.quote
    FROM goal_items i
    JOIN goal_item_sources gs ON gs.item_id = i.id
    JOIN sources s ON s.id = gs.source_id
    WHERE i.published
    ORDER BY i.position, i.id, gs.position
    """
)


def load_goals(db: Session | Connection) -> list[Goal]:
    """Every goal in order, with its published items. The inner join drops an item without
    sources: no source, nothing shown."""
    goals = {
        r.code: Goal(r.code, r.name_vi, r.description_vi, r.shared) for r in db.execute(_GOALS)
    }
    items: dict[int, GoalItem] = {}
    for row in db.execute(_PUBLISHED_ITEMS):
        if row.id not in items:
            items[row.id] = GoalItem(row.key, row.kind, row.group_code, row.title_vi, row.body_vi)
            goal = goals[row.goal_code]
            (goal.actives if row.kind == "active" else goal.infos).append(items[row.id])
        items[row.id].sources.append(GoalSource(row.title, row.publisher, row.url, row.quote))
    return list(goals.values())
