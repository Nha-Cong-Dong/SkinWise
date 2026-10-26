"""Resolve parsed INCI entries to canonical ingredients and functional groups."""

from dataclasses import dataclass, replace

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
    # When the label used an everyday name ("Rau má"): every EU name it may stand for, the
    # first being the one resolved above, and what is ambiguous about it.
    common_name_of: tuple[str, ...] = ()
    common_name_note: str | None = None
    # Named in the EU fragrance allergen list (Annex III, Regulation 1223/2009). Shown only.
    fragrance_allergen: bool = False

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

_ALLERGEN_LOOKUP = text(
    "SELECT normalized_name FROM fragrance_allergens WHERE normalized_name IN :names"
).bindparams(bindparam("names", expanding=True))

_COMMON_LOOKUP = text(
    "SELECT normalized_name, inci_names, note FROM common_names WHERE normalized_name IN :names"
).bindparams(bindparam("names", expanding=True))

# "Chiết xuất rau má" is looked up as "rau má".
_COMMON_PREFIXES = ("chiet xuat ", "tinh chat ", "dich chiet ")


def resolve(db: Session | Connection, entries: list[InciEntry]) -> list[ResolvedEntry]:
    """Look up each entry's candidate names in order; the first known name wins.

    The actives dictionary decides groups; the EU lists only say the name is a real
    ingredient name and what it is usually for. A name neither knows is tried as an everyday
    name (data/common_names.toml), which stands for an EU name and is then resolved as one.
    """
    names = sorted({name for entry in entries for name in entry.candidates})
    if not names:
        return [ResolvedEntry(entry, None, None, ()) for entry in entries]
    known, eu = _lookup(db, names)

    unresolved = [e for e in entries if not any(n in known or n in eu for n in e.candidates)]
    common_keys = {e.position: _common_keys(e.candidates) for e in unresolved}
    all_keys = sorted({k for keys in common_keys.values() for k in keys})
    common = (
        {row.normalized_name: row for row in db.execute(_COMMON_LOOKUP, {"names": all_keys})}
        if all_keys
        else {}
    )
    targets = sorted({normalize_name(n) for row in common.values() for n in row.inci_names})
    if targets:
        more_known, more_eu = _lookup(db, targets)
        known, eu = {**known, **more_known}, {**eu, **more_eu}

    resolved = []
    for entry in entries:
        keys = common_keys.get(entry.position, ())
        hit = next((common[k] for k in keys if k in common), None)
        if hit is None:
            resolved.append(_resolve_one(entry, entry.candidates, known, eu))
        else:
            candidates = tuple(normalize_name(n) for n in hit.inci_names)
            one = _resolve_one(entry, candidates, known, eu)
            resolved.append(_with_common(one, tuple(hit.inci_names), hit.note))
    return _mark_allergens(db, resolved)


def _lookup(db: Session | Connection, names: list[str]) -> tuple[dict, dict]:
    known = {row.normalized_name: row for row in db.execute(_LOOKUP, {"names": names})}
    # A dictionary hit on a synonym ("vitamin c") is looked up in the EU lists by its INCI name.
    eu_names = names + sorted({normalize_name(row.inci_name) for row in known.values()})
    eu = {row.normalized_name: row for row in db.execute(_EU_LOOKUP, {"names": eu_names})}
    return known, eu


def _resolve_one(
    entry: InciEntry, candidates: tuple[str, ...], known: dict, eu: dict
) -> ResolvedEntry:
    row = _pick(candidates, known)
    eu_candidates = (*candidates, normalize_name(row.inci_name)) if row else candidates
    eu_row = next((eu[name] for name in eu_candidates if name in eu), None)
    return ResolvedEntry(
        entry,
        row.id if row else None,
        row.inci_name if row else None,
        tuple(row.groups) if row else (),
        eu_row.name if eu_row else None,
        tuple(eu_row.functions) if eu_row else (),
    )


def _pick(candidates: tuple[str, ...], known: dict):
    """The dictionary row for an entry: its whole text if known; otherwise, among the parts of
    "A (B)" / "A/B", an active's own INCI name before a synonym, so "Vitamin C (3-O-Ethyl
    Ascorbic Acid)" is the derivative, not ascorbic acid (Vietnamese labels say "Vitamin C" for
    derivatives too)."""
    if candidates and candidates[0] in known:
        return known[candidates[0]]
    parts = [name for name in candidates[1:] if name in known]
    own_name = [name for name in parts if normalize_name(known[name].inci_name) == name]
    return known[(own_name or parts)[0]] if parts else None


def _with_common(r: ResolvedEntry, names: tuple[str, ...], note: str | None) -> ResolvedEntry:
    return ResolvedEntry(
        r.entry, r.ingredient_id, r.inci_name, r.groups, r.eu_name, r.functions, names, note
    )


def _names_of(r: ResolvedEntry) -> set[str]:
    return {*r.entry.candidates, *(normalize_name(n) for n in (r.eu_name, r.inci_name) if n)}


def _mark_allergens(db: Session | Connection, resolved: list[ResolvedEntry]) -> list[ResolvedEntry]:
    """Flag entries the EU fragrance allergen list names, by the label name or the EU name."""
    names = sorted({n for r in resolved for n in _names_of(r)})
    if not names:
        return resolved
    allergens = set(db.execute(_ALLERGEN_LOOKUP, {"names": names}).scalars())
    return [replace(r, fragrance_allergen=bool(_names_of(r) & allergens)) for r in resolved]


def _common_keys(candidates: tuple[str, ...]) -> tuple[str, ...]:
    keys: list[str] = []
    for name in candidates:
        keys.append(name)
        keys += [name[len(p) :] for p in _COMMON_PREFIXES if name.startswith(p)]
    return tuple(keys)


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


# A label name nothing recognised may be a typo of an active ("Salicilic Acid"). Losing an
# active loses its warnings, so close names are offered back to the user, who decides.
# Never applied automatically: the engine still only sees names that matched exactly.
SUGGESTION_THRESHOLD = 0.45  # pg_trgm similarity; "azeliac acid" ~ "azelaic acid" is 0.50
MAX_SUGGESTIONS = 3


@dataclass(frozen=True)
class Suggestion:
    name: str  # dictionary INCI name for an active, else the EU list name
    groups: tuple[str, ...]


_SUGGEST = text(
    """
    WITH candidates AS (
      SELECT s.normalized_name, i.inci_name AS name, i.id AS ingredient_id
      FROM ingredient_synonyms s JOIN ingredients i ON i.id = s.ingredient_id
      WHERE s.normalized_name % :q
      UNION ALL
      SELECT n.normalized_name, n.name, NULL FROM inci_names n WHERE n.normalized_name % :q
    )
    SELECT c.name, similarity(c.normalized_name, :q) AS score,
           coalesce(array_agg(g.group_code ORDER BY g.group_code)
                    FILTER (WHERE g.group_code IS NOT NULL), '{}') AS groups
    FROM candidates c
    LEFT JOIN ingredient_groups g ON g.ingredient_id = c.ingredient_id
    GROUP BY c.name, c.normalized_name
    ORDER BY score DESC, c.name
    LIMIT 20
    """
)


def suggest(db: Session | Connection, name: str) -> list[Suggestion]:
    """Known names close to `name` (already normalized), actives first among equals."""
    rows = [r for r in db.execute(_SUGGEST, {"q": name}) if r.score >= SUGGESTION_THRESHOLD]
    best: dict[str, Suggestion] = {}
    for r in sorted(rows, key=lambda r: (-r.score, not r.groups)):
        key = normalize_name(r.name)
        if key not in best:
            best[key] = Suggestion(r.name, tuple(r.groups))
        elif r.groups and not best[key].groups:
            best[key] = Suggestion(r.name, tuple(r.groups))  # prefer the dictionary entry
    return list(best.values())[:MAX_SUGGESTIONS]
