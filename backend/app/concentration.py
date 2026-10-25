"""Which entries of a full ingredient list are at most 1%, from the EU labelling rule.

Regulation (EC) No 1223/2009, Article 19: ingredients are listed in descending order of weight,
and those under 1% may follow in any order. An ingredient the law caps at 1% (phenoxyethanol,
Annex V) therefore marks a line: nothing after it can be above 1%, except colorants, which
may be listed last whatever their amount. Sources and quotes: data/concentration_limits.toml.

Display only. Being at most 1% does not make an active harmless or inactive (retinol works
below 1%), so this never removes a warning.
"""

from dataclasses import dataclass
from functools import lru_cache

from app.inci import normalize_name
from app.ingredients import ResolvedEntry
from app.seed import load_toml

COLORANT_FUNCTION = "COSMETIC COLORANT"
# Colorants often written by name instead of CI number (US labels). Not marking one is safe;
# marking a colorant "at most 1%" could be wrong (e.g. titanium dioxide in a foundation).
COLORANT_NAMES = {
    "iron oxides",
    "titanium dioxide",
    "mica",
    "ultramarines",
    "chromium oxide greens",
}


@dataclass(frozen=True)
class OnePercentLine:
    marker: str  # the capped ingredient as written on the label
    marker_position: int
    positions: frozenset[int]  # entries after the marker that are at most 1%


@lru_cache
def capped_names() -> frozenset[str]:
    """Normalized names of ingredients capped at 1% or less for every product type."""
    limits = load_toml("concentration_limits.toml")["limit"]
    return frozenset(normalize_name(x["inci"]) for x in limits if x["max_percent"] <= 1.0)


def one_percent_line(resolved: list[ResolvedEntry]) -> OnePercentLine | None:
    caps = capped_names()
    for r in resolved:
        if r.entry.may_contain:
            break
        names = set(r.entry.candidates)
        names |= {normalize_name(n) for n in (r.eu_name, r.inci_name) if n}
        if names & caps:
            after = frozenset(
                e.entry.position
                for e in resolved
                if e.entry.position > r.entry.position
                and not e.entry.may_contain
                and not _is_colorant(e)
            )
            return OnePercentLine(r.entry.raw, r.entry.position, after)
    return None


def _is_colorant(r: ResolvedEntry) -> bool:
    return (
        COLORANT_FUNCTION in r.functions
        or bool(COLORANT_NAMES & set(r.entry.candidates))
        or any(c.startswith("ci ") and c[3:].strip()[:1].isdigit() for c in r.entry.candidates)
    )
