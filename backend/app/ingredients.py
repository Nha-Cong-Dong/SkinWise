"""Resolve parsed INCI entries to canonical ingredients and functional groups."""

from dataclasses import dataclass

from sqlalchemy import bindparam, text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.inci import InciEntry, normalize_name


@dataclass(frozen=True)
class ResolvedEntry:
    entry: InciEntry
    ingredient_id: int | None  # None: not in the actives dictionary
    inci_name: str | None
    groups: tuple[str, ...]
    eu_name: str | None = None  # the name as listed by the EU; None: unknown to the EU lists
    functions: tuple[str, ...] = ()  # usual functions from the 2006 EU inventory

    @property
    def known(self) -> bool:
        return self.ingredient_id is not None or self.eu_name is not None


_LOOKUP = text(
    """
    SELECT s.normalized_name, i.id, i.inci_name,
           coalesce(array_agg(g.group_code ORDER BY g.group_code)
                    FILTER (WHERE g.group_code IS NOT NULL), '{}') AS groups
    FROM ingredient_synonyms s
    JOIN ingredients i ON i.id = s.ingredient_id
    LEFT JOIN ingredient_groups g ON g.ingredient_id = i.id
    WHERE s.normalized_name IN :names
    GROUP BY s.normalized_name, i.id, i.inci_name
    """
).bindparams(bindparam("names", expanding=True))

_EU_LOOKUP = text(
    "SELECT normalized_name, name, functions FROM inci_names WHERE normalized_name IN :names"
).bindparams(bindparam("names", expanding=True))


def resolve(db: Session | Connection, entries: list[InciEntry]) -> list[ResolvedEntry]:
    """Look up each entry's candidate names in order; the first known name wins.

    The actives dictionary decides groups; the EU lists only say the name is a real
    ingredient name and what it is usually for.
    """
    names = sorted({name for entry in entries for name in entry.candidates})
    if not names:
        return [ResolvedEntry(entry, None, None, ()) for entry in entries]
    known = {row.normalized_name: row for row in db.execute(_LOOKUP, {"names": names})}
    # A dictionary hit on a synonym ("vitamin c") is looked up in the EU lists by its INCI name.
    eu_names = names + sorted({normalize_name(row.inci_name) for row in known.values()})
    eu = {row.normalized_name: row for row in db.execute(_EU_LOOKUP, {"names": eu_names})}

    resolved = []
    for entry in entries:
        row = next((known[name] for name in entry.candidates if name in known), None)
        eu_candidates = (
            (*entry.candidates, normalize_name(row.inci_name)) if row else entry.candidates
        )
        eu_row = next((eu[name] for name in eu_candidates if name in eu), None)
        resolved.append(
            ResolvedEntry(
                entry,
                row.id if row else None,
                row.inci_name if row else None,
                tuple(row.groups) if row else (),
                eu_row.name if eu_row else None,
                tuple(eu_row.functions) if eu_row else (),
            )
        )
    return resolved


def product_groups(resolved: list[ResolvedEntry]) -> set[str]:
    return {group for entry in resolved for group in entry.groups}


@dataclass(frozen=True)
class GroupRow:
    code: str
    name_vi: str
    description_vi: str | None
    parent_code: str | None


def list_groups(db: Session | Connection) -> list[GroupRow]:
    query = text(
        "SELECT code, name_vi, description_vi, parent_code FROM functional_groups ORDER BY code"
    )
    return [GroupRow(*row) for row in db.execute(query)]


def with_ancestors(code: str, groups: list[GroupRow]) -> set[str]:
    """The group and every umbrella group above it, e.g. BHA -> {BHA, EXFOLIANT_ACID}."""
    parents = {g.code: g.parent_code for g in groups}
    result: set[str] = set()
    current: str | None = code
    while current is not None and current not in result:
        result.add(current)
        current = parents.get(current)
    return result


@dataclass(frozen=True)
class FunctionRow:
    code: str
    name_vi: str
    description_vi: str
    definition_en: str | None


def list_functions(db: Session | Connection) -> list[FunctionRow]:
    query = text(
        "SELECT code, name_vi, description_vi, definition_en FROM cosmetic_functions ORDER BY code"
    )
    return [FunctionRow(*row) for row in db.execute(query)]
