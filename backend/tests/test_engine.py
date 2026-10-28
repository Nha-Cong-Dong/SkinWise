from app.engine import Occurrence, RoutineItem, Rule, check_routine

EVERY_DAY = frozenset(range(7))
MON = frozenset({0})

RETINOL, GLYCOLIC, SALICYLIC, VIT_C, NIACINAMIDE, MOISTURIZER, LACTIC = 1, 2, 3, 4, 5, 6, 7
GROUPS = {
    LACTIC: {"AHA", "EXFOLIANT_ACID"},
    RETINOL: {"RETINOID"},
    GLYCOLIC: {"AHA", "EXFOLIANT_ACID"},
    SALICYLIC: {"BHA", "EXFOLIANT_ACID"},
    VIT_C: {"VITAMIN_C"},
    NIACINAMIDE: {"NIACINAMIDE"},
    MOISTURIZER: set(),
}


def rule(id: int, kind: str, scope: str, a: str, b: str | None = None, severity="caution") -> Rule:
    return Rule(
        id=id, key=f"rule-{id}", kind=kind, severity=severity, scope=scope,  # type: ignore[arg-type]
        evidence_level="moderate", group_a=a, group_b=b,
        title_vi="t", explanation_vi="e", sources=(),
    )  # fmt: skip


RETINOID_ACID_SESSION = rule(1, "conflict", "same_session", "RETINOID", "EXFOLIANT_ACID")
ACID_DUPLICATE_SESSION = rule(2, "duplicate", "same_session", "EXFOLIANT_ACID")
VIT_C_NIACINAMIDE_MYTH = rule(3, "myth", "same_session", "VITAMIN_C", "NIACINAMIDE", "safe")
RETINOID_ACID_DAY = rule(4, "conflict", "same_day", "RETINOID", "EXFOLIANT_ACID", "info")
RETINOID_ACID_STEP = rule(5, "conflict", "same_step", "RETINOID", "EXFOLIANT_ACID", "avoid")


def item(product_id: int, session: str = "PM", days=EVERY_DAY, step: int = 1) -> RoutineItem:
    return RoutineItem(product_id, session, days, step)  # type: ignore[arg-type]


def keys(warnings) -> list[tuple[str, tuple[int, int]]]:
    return [(w.rule.key, w.product_ids) for w in warnings]


def test_conflict_in_same_session_fires_once_per_pair_with_all_days() -> None:
    routine = [item(RETINOL, step=2), item(GLYCOLIC, step=1)]
    (warning,) = check_routine(routine, GROUPS, [RETINOID_ACID_SESSION])
    assert warning.product_ids == (RETINOL, GLYCOLIC)
    assert warning.occurrences == [Occurrence(d, "PM") for d in range(7)]


def test_conflict_matches_in_either_order() -> None:
    reversed_rule = rule(9, "conflict", "same_session", "EXFOLIANT_ACID", "RETINOID")
    assert check_routine([item(RETINOL), item(GLYCOLIC)], GROUPS, [reversed_rule])


def test_different_sessions_do_not_trigger_a_session_rule() -> None:
    routine = [item(RETINOL, "PM"), item(GLYCOLIC, "AM")]
    assert check_routine(routine, GROUPS, [RETINOID_ACID_SESSION]) == []


def test_alternating_days_do_not_trigger() -> None:
    routine = [item(RETINOL, days=frozenset({0, 2, 4})), item(GLYCOLIC, days=frozenset({1, 3}))]
    assert check_routine(routine, GROUPS, [RETINOID_ACID_SESSION, RETINOID_ACID_DAY]) == []


def test_only_overlapping_days_are_reported() -> None:
    routine = [item(RETINOL, days=frozenset({0, 2, 4})), item(GLYCOLIC, days=frozenset({2, 3}))]
    (warning,) = check_routine(routine, GROUPS, [RETINOID_ACID_SESSION])
    assert warning.occurrences == [Occurrence(2, "PM")]


def test_same_day_rule_spans_sessions() -> None:
    routine = [item(RETINOL, "PM", MON), item(GLYCOLIC, "AM", MON)]
    (warning,) = check_routine(routine, GROUPS, [RETINOID_ACID_DAY])
    assert warning.occurrences == [Occurrence(0, None)]


def test_same_step_rule_needs_the_same_step() -> None:
    same = [item(RETINOL, step=2), item(GLYCOLIC, step=2)]
    different = [item(RETINOL, step=2), item(GLYCOLIC, step=3)]
    assert keys(check_routine(same, GROUPS, [RETINOID_ACID_STEP])) == [("rule-5", (1, 2))]
    assert check_routine(different, GROUPS, [RETINOID_ACID_STEP]) == []


def test_duplicate_needs_two_different_products() -> None:
    routine = [item(GLYCOLIC), item(SALICYLIC), item(RETINOL)]
    assert keys(check_routine(routine, GROUPS, [ACID_DUPLICATE_SESSION])) == [
        ("rule-2", (GLYCOLIC, SALICYLIC))
    ]
    same_product_twice = [item(GLYCOLIC, step=1), item(GLYCOLIC, step=3)]
    assert check_routine(same_product_twice, GROUPS, [ACID_DUPLICATE_SESSION]) == []


def test_a_product_is_never_checked_against_itself() -> None:
    groups = {7: {"RETINOID", "EXFOLIANT_ACID"}}
    assert check_routine([item(7)], groups, [RETINOID_ACID_SESSION]) == []


def test_myth_rules_are_reported_with_their_severity() -> None:
    (warning,) = check_routine([item(VIT_C, "AM"), item(NIACINAMIDE, "AM")], GROUPS,
                               [VIT_C_NIACINAMIDE_MYTH])  # fmt: skip
    assert warning.rule.severity == "safe"


def test_profile_rules_are_ignored() -> None:
    profile = rule(8, "profile", "same_session", "RETINOID", "EXFOLIANT_ACID")
    assert check_routine([item(RETINOL), item(GLYCOLIC)], GROUPS, [profile]) == []


def test_unknown_products_and_products_without_actives_are_ignored() -> None:
    routine = [item(MOISTURIZER), item(999), item(RETINOL)]
    assert check_routine(routine, GROUPS, [RETINOID_ACID_SESSION, ACID_DUPLICATE_SESSION]) == []


def test_sorted_by_severity_then_rule() -> None:
    routine = [item(RETINOL, step=1), item(GLYCOLIC, step=1), item(SALICYLIC, step=2)]
    rules = [RETINOID_ACID_DAY, ACID_DUPLICATE_SESSION, RETINOID_ACID_STEP, RETINOID_ACID_SESSION]
    assert [w.rule.severity for w in check_routine(routine, GROUPS, rules)] == [
        "avoid",
        "caution",
        "caution",
        "caution",
        "info",
        "info",
    ]


AHA_SUN = rule(10, "usage", "routine", "AHA")


def test_usage_rule_lists_every_product_with_the_group_and_when_it_is_used() -> None:
    routine = [item(GLYCOLIC, "AM", MON), item(LACTIC, "PM", frozenset({2})), item(RETINOL)]
    (warning,) = check_routine(routine, GROUPS, [AHA_SUN])
    assert warning.product_ids == (GLYCOLIC, LACTIC)
    assert warning.occurrences == [Occurrence(0, "AM"), Occurrence(2, "PM")]


def test_usage_rule_needs_one_product_with_the_group_not_a_pair() -> None:
    assert keys(check_routine([item(GLYCOLIC)], GROUPS, [AHA_SUN])) == [("rule-10", (GLYCOLIC,))]
    assert check_routine([item(RETINOL), item(SALICYLIC)], GROUPS, [AHA_SUN]) == []


def test_usage_rules_sort_by_severity_after_pair_rules_of_the_same_severity() -> None:
    sun_caution = rule(0, "usage", "routine", "RETINOID")  # key "rule-0" sorts first by key
    routine = [item(RETINOL), item(GLYCOLIC)]
    rules = [sun_caution, RETINOID_ACID_SESSION, RETINOID_ACID_DAY]
    assert keys(check_routine(routine, GROUPS, rules)) == [
        ("rule-1", (RETINOL, GLYCOLIC)),  # caution, pair
        ("rule-0", (RETINOL,)),  # caution, usage
        ("rule-4", (RETINOL, GLYCOLIC)),  # info
    ]
