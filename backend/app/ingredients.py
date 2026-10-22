"""Resolve parsed INCI entries to canonical ingredients and functional groups."""

from dataclasses import dataclass

from sqlalchemy import bindparam, text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.inci import InciEntry


@dataclass(frozen=True)
class ResolvedEntry:
    entry: InciEntry
    ingredient_id: int | None  # None: not in the dictionary, label text is kept as-is
    inci_name: str | None
    groups: tuple[str, ...]


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


def resolve(db: Session | Connection, entries: list[InciEntry]) -> list[ResolvedEntry]:
    """Look up each entry's candidate names in order; the first known name wins."""
    names = sorted({name for entry in entries for name in entry.candidates})
    known = (
        {row.normalized_name: row for row in db.execute(_LOOKUP, {"names": names})} if names else {}
    )

    resolved = []
    for entry in entries:
        row = next((known[name] for name in entry.candidates if name in known), None)
        if row is None:
            resolved.append(ResolvedEntry(entry, None, None, ()))
        else:
            resolved.append(ResolvedEntry(entry, row.id, row.inci_name, tuple(row.groups)))
    return resolved


def product_groups(resolved: list[ResolvedEntry]) -> set[str]:
    return {group for entry in resolved for group in entry.groups}
