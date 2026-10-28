from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app import seed as seed_module
from app.api import GOALS_NOTICE_VI
from app.db import get_session
from app.goals import goal_problems, load_goals
from app.main import create_app
from app.seed import load_toml, seed, seed_goals
from scripts.verify_quotes import quotes_to_check

URL = "https://example.org/goal-source"
RULE_URL = "https://example.org/rule-source"
GROUPS = {"BHA", "EXFOLIANT_ACID", "RETINOID"}
REVIEWED = {"published": True, "reviewed_by": "x", "reviewed_at": "2026-10-28"}


def goal(code: str, position: int) -> dict[str, Any]:
    return {"code": code, "name_vi": f"tên {code}", "description_vi": "mô tả", "position": position}


def item(key: str, goal_code: str = "acne", kind: str = "info", **extra: Any) -> dict[str, Any]:
    base = {
        "key": key,
        "goal": goal_code,
        "kind": kind,
        "title_vi": "tiêu đề",
        "body_vi": "nội dung",
    }
    base.update({"sources": [{"url": URL, "quote": "q"}], **extra})
    return base


GOALS = [goal("acne", 1), goal("aging", 2), goal("all", 3)]


def data(*items: dict[str, Any]) -> dict[str, Any]:
    return {
        "goal": GOALS,
        "item": list(items),
        "source": [{"url": URL, "title": "T", "publisher": "P", "accessed_at": "2026-10-28"}],
    }


# --- goal_problems -------------------------------------------------------------------------


def problems(*items: dict[str, Any], urls: set[str] | None = None) -> list[str]:
    return goal_problems(data(*items), GROUPS, {URL} if urls is None else urls)


def test_valid_items_have_no_problems() -> None:
    assert problems(item("a"), item("b", kind="active", group="BHA", **REVIEWED)) == []
    assert problems(item("c", sources=[])) == []  # an unpublished draft may lack sources


def test_published_items_need_sources_and_review() -> None:
    assert problems(item("a", published=True)) == [
        "a: published without reviewed_by and reviewed_at"
    ]
    assert problems(item("a", sources=[], **REVIEWED)) == ["a: published without a source"]
    assert problems(item("a", sources=[{"url": URL, "quote": " "}])) == [
        f"a: source {URL} has no quote"
    ]


def test_active_items_need_a_known_group() -> None:
    assert problems(item("a", kind="active")) == ["a: active items need group"]
    assert problems(item("a", kind="active", group="NOPE")) == ["a: unknown group 'NOPE'"]
    assert problems(item("a", group="BHA")) == ["a: info items have no group"]
    assert problems(item("a", kind="other")) == ["a: kind must be active or info, not 'other'"]
    assert problems(item("a", goal_code="all", kind="active", group="BHA")) == [
        "a: items of the shared goal must be info"
    ]


def test_unknown_goal_duplicate_key_and_unknown_url() -> None:
    assert problems(item("a", goal_code="nope")) == ["a: unknown goal 'nope'"]
    assert problems(item("a"), item("a")) == ["a: duplicate key"]
    assert problems(item("a"), urls=set()) == [f"a: source {URL} has no [[source]] block"]
    # A url declared only in rules.toml counts (seed passes both sets).
    rule_sourced = item("a", sources=[{"url": RULE_URL, "quote": "q"}])
    assert problems(rule_sourced, urls={RULE_URL}) == []


def test_goals_toml_is_valid() -> None:
    goals_data = load_toml("goals.toml")
    rules_data = load_toml("rules.toml")
    urls = {s["url"] for s in [*rules_data.get("source", []), *goals_data.get("source", [])]}
    groups = {g["code"] for g in load_toml("functional_groups.toml")["group"]}
    assert goal_problems(goals_data, groups, urls) == []
    codes = [g["code"] for g in goals_data["goal"]]
    assert codes == ["acne", "aging", "dark-spots", "dry-sensitive", "oily-pores", "redness", "all"]


# --- seeding and GET /goals ----------------------------------------------------------------


@pytest.fixture
def conn(engine: Engine) -> Iterator[Connection]:
    """A connection whose changes are rolled back after the test."""
    with engine.connect() as conn, conn.begin() as tx:
        yield conn
        tx.rollback()


@pytest.fixture
def conn_client(conn: Connection) -> Iterator[TestClient]:
    """A client that sees the uncommitted changes made on `conn`."""

    def session_override() -> Iterator[Session]:
        with Session(bind=conn, join_transaction_mode="create_savepoint") as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = session_override
    with TestClient(app) as client:
        yield client


SEEDED = data(
    item("acne-bha", kind="active", group="BHA", **REVIEWED),
    item("acne-draft"),
    item("acne-info", **REVIEWED),
    item("acne-no-source", sources=[], **REVIEWED),  # cannot pass goal_problems; seeded directly
    item("all-info", goal_code="all", **REVIEWED),
)


def test_only_published_sourced_items_are_returned(
    conn: Connection, conn_client: TestClient
) -> None:
    seed_goals(conn, SEEDED, {})
    body = conn_client.get("/goals").json()
    assert [g["code"] for g in body["goals"]] == ["acne", "aging"]
    acne = body["goals"][0]
    assert [i["key"] for i in acne["actives"]] == ["acne-bha"]
    assert [i["key"] for i in acne["infos"]] == ["acne-info"]
    assert acne["actives"][0] == {
        "key": "acne-bha",
        "kind": "active",
        "group": "BHA",
        "title_vi": "tiêu đề",
        "body_vi": "nội dung",
        "sources": [{"title": "T", "publisher": "P", "url": URL, "quote": "q"}],
    }
    assert acne["infos"][0]["group"] is None
    assert body["goals"][1]["actives"] == body["goals"][1]["infos"] == []
    assert [i["key"] for i in body["shared_infos"]] == ["all-info"]
    assert body["notice_vi"] == GOALS_NOTICE_VI


def test_seed_goals_is_rerunnable_and_drops_removed_items(conn: Connection) -> None:
    seed_goals(conn, SEEDED, {})
    first_id = conn.execute(text("SELECT id FROM goal_items WHERE key = 'acne-bha'")).scalar_one()
    changed = data(item("acne-bha", kind="active", group="RETINOID", title_vi="mới", **REVIEWED))
    changed["goal"] = [goal("acne", 1), goal("all", 2)]
    seed_goals(conn, changed, {})
    rows = conn.execute(text("SELECT id, key, group_code, title_vi FROM goal_items")).all()
    assert [tuple(r) for r in rows] == [(first_id, "acne-bha", "RETINOID", "mới")]
    assert [g.code for g in load_goals(conn)] == ["acne", "all"]
    sources = conn.execute(text("SELECT count(*) FROM goal_item_sources")).scalar_one()
    assert sources == 1


def test_renaming_a_goal_moves_its_items(conn: Connection) -> None:
    seed_goals(conn, SEEDED, {})
    renamed = data(item("acne-bha", goal_code="spots", kind="active", group="BHA", **REVIEWED))
    renamed["goal"] = [goal("spots", 1), goal("all", 2)]
    seed_goals(conn, renamed, {})
    rows = conn.execute(text("SELECT key, goal_code FROM goal_items")).all()
    assert [tuple(r) for r in rows] == [("acne-bha", "spots")]
    assert [g.code for g in load_goals(conn)] == ["spots", "all"]


def test_goals_keep_file_order(conn: Connection, conn_client: TestClient) -> None:
    second = "https://example.org/second"
    two_sources = [{"url": URL, "quote": "q1"}, {"url": second, "quote": "q2"}]
    ordered = data(item("acne-z", sources=two_sources, **REVIEWED), item("acne-a", **REVIEWED))
    ordered["source"].append({"url": second, "title": "T2", "publisher": "P2"})
    seed_goals(conn, ordered, {})
    infos = conn_client.get("/goals").json()["goals"][0]["infos"]
    assert [i["key"] for i in infos] == ["acne-z", "acne-a"]
    assert [s["quote"] for s in infos[0]["sources"]] == ["q1", "q2"]


def test_unpublished_item_is_hidden(conn: Connection, conn_client: TestClient) -> None:
    seed_goals(conn, data(item("acne-draft", kind="active", group="BHA")), {})
    body = conn_client.get("/goals").json()
    assert body["goals"][0]["actives"] == []


def test_seed_rejects_invalid_goals_toml(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    real = seed_module.load_toml

    def fake(name: str) -> dict[str, Any]:
        if name == "goals.toml":
            return data(item("bad", kind="active", **REVIEWED))
        return real(name)

    monkeypatch.setattr(seed_module, "load_toml", fake)
    with pytest.raises(ValueError, match="bad: active items need group"):
        seed(engine)


def test_real_goals(client: TestClient) -> None:
    body = client.get("/goals").json()
    goals = load_toml("goals.toml")["goal"]
    assert [g["code"] for g in body["goals"]] == [g["code"] for g in goals if g["code"] != "all"]
    assert [g["name_vi"] for g in body["goals"]] == [
        g["name_vi"] for g in goals if g["code"] != "all"
    ]
    # The seeded file: every published item is served, under its goal or as a shared one.
    items = load_toml("goals.toml").get("item", [])
    published = {i["key"] for i in items if i.get("published")}
    served = {i["key"] for g in body["goals"] for i in g["actives"] + g["infos"]}
    served |= {i["key"] for i in body["shared_infos"]}
    assert served == published
    assert body["notice_vi"] == GOALS_NOTICE_VI


# --- verify_quotes -------------------------------------------------------------------------


def test_verify_quotes_covers_goal_items(monkeypatch: pytest.MonkeyPatch) -> None:
    import scripts.verify_quotes as vq

    real = vq.load_toml

    def fake(name: str) -> dict[str, Any]:
        return (
            data(item("goal-x"), item("goal-y", sources=[])) if name == "goals.toml" else real(name)
        )

    monkeypatch.setattr(vq, "load_toml", fake)
    assert ("goal-x", URL, "q") in quotes_to_check([])
    assert ("goal-y", None, None) in quotes_to_check([])
    assert quotes_to_check(["goal-x"]) == [("goal-x", URL, "q")]
