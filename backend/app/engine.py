"""Deterministic routine checker. Pure functions, no database.

Warnings come only from rules; nothing here invents or rewords one. A rule fires for a pair
of *different* products that share a scope (same step / session / day). A single product is
never checked against itself: combining actives in one formula is the formulator's job.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from itertools import combinations
from typing import Literal

Session = Literal["AM", "PM"]
Scope = Literal["same_step", "same_session", "same_day"]

SEVERITY_ORDER = {"avoid": 0, "caution": 1, "info": 2, "safe": 3}
CHECKED_KINDS = {"conflict", "duplicate", "myth"}  # "profile" needs a skin profile (not in MVP)


@dataclass(frozen=True)
class RoutineItem:
    product_id: int
    session: Session
    days: frozenset[int]  # 0 = Monday … 6 = Sunday
    step: int  # order within the session, 1 = first


@dataclass(frozen=True)
class RuleSource:
    title: str
    publisher: str
    url: str
    quote: str


@dataclass(frozen=True)
class Rule:
    id: int
    key: str
    kind: str
    severity: str
    scope: Scope
    evidence_level: str
    group_a: str
    group_b: str | None
    title_vi: str
    explanation_vi: str
    sources: tuple[RuleSource, ...]


@dataclass(frozen=True)
class Occurrence:
    day: int
    session: Session | None  # None for same_day rules: the pair spans the whole day


@dataclass
class Warning:
    rule: Rule
    product_ids: tuple[int, int]  # sorted
    occurrences: list[Occurrence] = field(default_factory=list)


def check_routine(
    items: list[RoutineItem], product_groups: dict[int, set[str]], rules: list[Rule]
) -> list[Warning]:
    """One warning per (rule, product pair), listing every day/session where it applies.

    Sorted most severe first, then by rule key and products so output is stable.
    """
    warnings: dict[tuple[int, tuple[int, int]], Warning] = {}
    for scope_key, group in _scoped_groups(items):
        day, session, scope = scope_key
        for a, b in combinations(group, 2):
            if a.product_id == b.product_id:
                continue
            for rule in rules:
                if rule.scope != scope or rule.kind not in CHECKED_KINDS:
                    continue
                if not rule_matches(
                    rule,
                    product_groups.get(a.product_id, set()),
                    product_groups.get(b.product_id, set()),
                ):
                    continue
                pair = tuple(sorted((a.product_id, b.product_id)))
                warning = warnings.setdefault((rule.id, pair), Warning(rule, pair))
                occurrence = Occurrence(day, session)
                if occurrence not in warning.occurrences:
                    warning.occurrences.append(occurrence)

    result = list(warnings.values())
    for w in result:
        w.occurrences.sort(key=lambda o: (o.day, o.session or ""))
    result.sort(key=lambda w: (SEVERITY_ORDER[w.rule.severity], w.rule.key, w.product_ids))
    return result


def _scoped_groups(items: list[RoutineItem]):
    """Yield ((day, session, scope), items) for every bucket a rule scope looks at.

    session is None for same_day buckets, which span both sessions.
    """
    buckets: dict[tuple, list[RoutineItem]] = defaultdict(list)
    for item in items:
        for day in item.days:
            buckets[(day, item.session, "same_step", item.step)].append(item)
            buckets[(day, item.session, "same_session", None)].append(item)
            buckets[(day, None, "same_day", None)].append(item)
    for (day, session, scope, _step), group in buckets.items():
        yield (day, session, scope), group


def rule_matches(rule: Rule, groups_a: set[str], groups_b: set[str]) -> bool:
    """Whether the rule fires for two different products with these active groups."""
    if rule.kind == "duplicate":
        return rule.group_a in groups_a and rule.group_a in groups_b
    assert rule.group_b is not None, f"rule {rule.key} needs group_b"
    return (rule.group_a in groups_a and rule.group_b in groups_b) or (
        rule.group_a in groups_b and rule.group_b in groups_a
    )
