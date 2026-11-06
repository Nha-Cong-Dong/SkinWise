import hashlib
from collections.abc import Iterator
from datetime import date

import pytest
from sqlalchemy import Engine, text
from sqlalchemy.engine import Connection

from app.engine import RoutineItem, check_routine
from app.rules import (
    explanation_hash,
    load_product_groups,
    load_published_rules,
    rule_problems,
)
from app.seed import load_toml

URL = "https://example.org/source"
DRAFT = {
    "key": "k",
    "kind": "conflict",
    "group_a": "RETINOID",
    "group_b": "EXFOLIANT_ACID",
    "sources": [],
}


def test_rule_problems() -> None:
    assert rule_problems(DRAFT, set()) == []
    assert rule_problems({**DRAFT, "published": True}, set()) == [
        "published without a source",
        "published without reviewed_by and reviewed_at",
    ]
    sourced = {**DRAFT, "sources": [{"url": URL, "quote": "q"}]}
    assert rule_problems({**sourced, "published": True}, {URL}) == [
        "published without reviewed_by and reviewed_at"
    ]
    reviewed = {**sourced, "published": True, "reviewed_by": "x", "reviewed_at": "2026-10-23"}
    assert rule_problems(reviewed, {URL}) == []
    assert rule_problems(sourced, set()) == [f"source {URL} has no [[source]] block"]
    assert rule_problems({**DRAFT, "kind": "duplicate"}, set()) == [
        "duplicate rules use group_a only"
    ]
    assert rule_problems({**DRAFT, "group_b": None}, set()) == ["conflict rules need group_b"]


def test_usage_rule_problems() -> None:
    usage = {**DRAFT, "kind": "usage", "group_b": None, "scope": "routine"}
    only_usage = 'usage rules, and only they, have scope = "routine"'
    assert rule_problems(usage, set()) == []
    assert rule_problems({**usage, "group_b": "AHA"}, set()) == ["usage rules use group_a only"]
    assert rule_problems({**usage, "scope": "same_session"}, set()) == [only_usage]
    assert rule_problems({**DRAFT, "scope": "routine"}, set()) == [only_usage]


def test_rules_toml_is_valid() -> None:
    data = load_toml("rules.toml")
    urls = {s["url"] for s in data.get("source", [])}
    for rule in data.get("rule", []):
        assert rule_problems(rule, urls) == [], rule["key"]


@pytest.fixture
def conn(engine: Engine) -> Iterator[Connection]:
    """A connection whose changes are rolled back after the test."""
    with engine.connect() as conn, conn.begin() as tx:
        yield conn
        tx.rollback()


def add_rule(
    conn: Connection,
    key: str,
    published: bool,
    with_source: bool = True,
    kind: str = "conflict",
    scope: str = "same_session",
    groups: tuple[str, str | None] = ("RETINOID", "EXFOLIANT_ACID"),
) -> None:
    rule_id = conn.execute(
        text(
            """
            INSERT INTO rules (key, kind, severity, scope, evidence_level, group_a, group_b,
                               title_vi, explanation_vi, published)
            VALUES (:key, :kind, 'caution', :scope, 'moderate', :group_a, :group_b,
                    'tiêu đề', 'giải thích', :published)
            RETURNING id
            """
        ),
        {
            "key": key,
            "published": published,
            "kind": kind,
            "scope": scope,
            "group_a": groups[0],
            "group_b": groups[1],
        },
    ).scalar_one()
    if with_source:
        source_id = conn.execute(
            text(
                """
                INSERT INTO sources (title, publisher, url) VALUES ('T', 'P', :url)
                ON CONFLICT (url) DO UPDATE SET title = excluded.title RETURNING id
                """
            ),
            {"url": URL},
        ).scalar_one()
        conn.execute(
            text(
                "INSERT INTO rule_sources (rule_id, position, source_id, quote) "
                "VALUES (:r, 1, :s, 'q')"
            ),
            {"r": rule_id, "s": source_id},
        )


def test_only_published_rules_with_a_source_are_loaded(conn: Connection) -> None:
    add_rule(conn, "test-published", published=True)
    add_rule(conn, "test-draft", published=False)
    add_rule(conn, "test-no-source", published=True, with_source=False)

    keys = {r.key for r in load_published_rules(conn)}
    assert "test-published" in keys
    assert not keys & {"test-draft", "test-no-source"}
    (rule,) = [r for r in load_published_rules(conn) if r.key == "test-published"]
    assert [(s.url, s.quote) for s in rule.sources] == [(URL, "q")]


def product_id(conn: Connection, slug: str) -> int:
    return conn.execute(text("SELECT id FROM products WHERE slug = :s"), {"s": slug}).scalar_one()


def test_seeded_products_trigger_a_published_rule(conn: Connection) -> None:
    add_rule(conn, "test-published", published=True)
    retinol = product_id(conn, "the-ordinary-retinol-05-in-squalane")
    bha = product_id(conn, "paulas-choice-skin-perfecting-2-bha-liquid-exfoliant")
    lotion = product_id(conn, "cerave-daily-moisturizing-lotion")

    every_day = frozenset(range(7))
    routine = [
        RoutineItem(bha, "PM", every_day, 1),
        RoutineItem(retinol, "PM", every_day, 2),
        RoutineItem(lotion, "PM", every_day, 3),
    ]
    groups = load_product_groups(conn, [bha, retinol, lotion])
    assert groups[lotion] == set()

    warnings = [w for w in check_routine(routine, groups, load_published_rules(conn))
                if w.rule.key == "test-published"]  # fmt: skip
    assert [w.product_ids for w in warnings] == [tuple(sorted((bha, retinol)))]


def test_usage_rule_fires_for_seeded_products(conn: Connection) -> None:
    add_rule(conn, "test-usage", True, kind="usage", scope="routine", groups=("AHA", None))
    lactic = product_id(conn, "the-ordinary-lactic-acid-10-ha")
    bha = product_id(conn, "paulas-choice-skin-perfecting-2-bha-liquid-exfoliant")
    routine = [
        RoutineItem(lactic, "PM", frozenset({0}), 1),
        RoutineItem(bha, "AM", frozenset({1}), 1),
    ]
    groups = load_product_groups(conn, [lactic, bha])

    warnings = [w for w in check_routine(routine, groups, load_published_rules(conn))
                if w.rule.key == "test-usage"]  # fmt: skip
    assert [w.product_ids for w in warnings] == [(lactic,)]


def test_plain_vi_problems() -> None:
    explanation = "Dùng chung có thể làm da khô."
    rule = {**DRAFT, "explanation_vi": explanation}
    plain = {
        **rule,
        "plain_vi": "Dùng chung có thể làm khô da.",
        "plain_for": explanation_hash(explanation),
        "plain_reviewed_by": "x",
        "plain_reviewed_at": date(2026, 11, 6),
    }
    assert rule_problems(rule, set()) == []  # no plain_* fields: as before
    assert rule_problems(plain, set()) == []
    # plain_vi without its hash or reviewer
    no_review = {k: v for k, v in plain.items() if not k.startswith("plain_reviewed")}
    assert rule_problems(no_review, set()) == [
        "plain_vi without plain_reviewed_by",
        "plain_vi without plain_reviewed_at",
    ]
    assert rule_problems({**plain, "plain_for": ""}, set()) == ["plain_vi without plain_for"]
    # explanation_vi edited after the plain version was reviewed
    edited = {**plain, "explanation_vi": explanation + " Thêm ý."}
    assert rule_problems(edited, set()) == ["explanation_vi changed since plain_vi was reviewed"]
    # reviewer fields left behind after plain_vi was removed
    orphan = {k: v for k, v in plain.items() if k != "plain_vi"}
    assert rule_problems(orphan, set()) == [
        "plain_for, plain_reviewed_by, plain_reviewed_at without plain_vi"
    ]
    assert rule_problems({**plain, "plain_vi": "  "}, set()) == [
        "plain_vi is empty",
        "plain_for, plain_reviewed_by, plain_reviewed_at without plain_vi",
    ]


def test_plain_fields_of_the_wrong_type() -> None:
    rule = {**DRAFT, "explanation_vi": "e"}
    # A typo in rules.toml gives a clear problem, not a crash in the seed.
    assert rule_problems({**rule, "plain_vi": 1}, set()) == ["plain_vi must be a string"]
    assert rule_problems({**rule, "plain_vi": ["a"]}, set()) == ["plain_vi must be a string"]
    quoted_date = {
        **rule,
        "plain_vi": "p",
        "plain_for": explanation_hash("e"),
        "plain_reviewed_by": "x",
        "plain_reviewed_at": "2026-11-06",
    }
    assert rule_problems(quoted_date, set()) == [
        "plain_reviewed_at must be a date, written without quotes: 2026-11-06"
    ]


def test_explanation_hash() -> None:
    # sha256 of the UTF-8 bytes, first 12 hex digits
    assert explanation_hash("có thể") == hashlib.sha256("có thể".encode()).hexdigest()[:12]
    assert len(explanation_hash("x")) == 12
    assert explanation_hash("a") != explanation_hash("a ")
