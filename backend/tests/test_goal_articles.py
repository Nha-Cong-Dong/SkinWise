from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app import seed as seed_module
from app.api import GOAL_ARTICLE_NOT_FOUND_VI, GOALS_NOTICE_VI
from app.db import get_session
from app.goal_articles import article_problems, load_article
from app.main import create_app
from app.seed import load_toml, seed, seed_goal_articles, seed_goals
from scripts.verify_quotes import quotes_to_check

URL_A = "https://example.org/article-a"
URL_B = "https://example.org/article-b"
GOAL_URL = "https://example.org/goal-source"
GOAL_CODES = {"acne", "aging", "all"}
REVIEWED = {"published": True, "reviewed_by": "Người duyệt", "reviewed_at": "2026-11-08"}


def src(url: str = URL_A, quote: str = "q") -> dict[str, str]:
    return {"url": url, "quote": quote}


def para(text_vi: str = "đoạn", *sources: dict[str, str]) -> dict[str, Any]:
    return {"text_vi": text_vi, "sources": list(sources) or [src()]}


def section(heading_vi: str = "phần", *paragraphs: dict[str, Any]) -> dict[str, Any]:
    return {"heading_vi": heading_vi, "paragraph": list(paragraphs) or [para()]}


def article(goal: str = "acne", *sections: dict[str, Any], **extra: Any) -> dict[str, Any]:
    return {"goal": goal, "title_vi": "tiêu đề", "section": list(sections) or [section()], **extra}


SOURCES = [
    {"url": URL_A, "title": "Nguồn A", "publisher": "AAD", "accessed_at": "2026-11-07"},
    {"url": URL_B, "title": "Nguồn B", "publisher": "DermNet", "accessed_at": "2026-11-07"},
]


def data(*articles: dict[str, Any]) -> dict[str, Any]:
    return {"article": list(articles), "source": SOURCES}


# --- article_problems ----------------------------------------------------------------------


def problems(*articles: dict[str, Any], urls: set[str] | None = None) -> list[str]:
    return article_problems(data(*articles), GOAL_CODES, {URL_A, URL_B} if urls is None else urls)


def test_valid_articles_have_no_problems() -> None:
    assert problems(article(), article("aging", **REVIEWED)) == []
    assert article_problems({}, GOAL_CODES, set()) == []  # no article yet is fine


def test_unknown_or_shared_goal() -> None:
    assert problems(article("nope")) == ["article nope: unknown goal 'nope'"]
    assert problems(article("all")) == ["article all: the shared goal 'all' has no article"]


def test_one_article_per_goal() -> None:
    assert problems(article(), article()) == ["article acne: more than one article for this goal"]


def test_title_and_sections_are_required() -> None:
    assert problems(article(title_vi=" ")) == ["article acne: no title_vi"]
    no_section = {"goal": "acne", "title_vi": "t"}
    assert problems(no_section) == ["article acne: no section"]
    assert problems(article(section=[])) == ["article acne: no section"]


def test_sections_need_heading_and_paragraphs() -> None:
    assert problems(article("acne", section(" "))) == ["article acne: section 1: no heading_vi"]
    empty = {"heading_vi": "h", "paragraph": []}
    assert problems(article("acne", section(), empty)) == ["article acne: section 2: no paragraph"]
    assert problems(article("acne", {"heading_vi": "h"})) == [
        "article acne: section 1: no paragraph"
    ]


def test_paragraphs_need_text_and_a_source() -> None:
    assert problems(article("acne", section("h", para(" ")))) == [
        "article acne: section 1 paragraph 1: empty text_vi"
    ]
    no_source = {"text_vi": "t", "sources": []}
    assert problems(article("acne", section("h", para(), no_source))) == [
        "article acne: section 1 paragraph 2: no source"
    ]
    # Even an unpublished draft: every paragraph must carry a quote.
    assert problems(article("acne", section("h", {"text_vi": "t"}))) == [
        "article acne: section 1 paragraph 1: no source"
    ]


def test_sources_need_a_quote_and_a_source_block() -> None:
    assert problems(article("acne", section("h", para("t", src(quote=" "))))) == [
        f"article acne: section 1 paragraph 1: source {URL_A} has no quote"
    ]
    assert problems(article(), urls=set()) == [
        f"article acne: section 1 paragraph 1: source {URL_A} has no [[source]] block"
    ]


def test_published_needs_review() -> None:
    assert problems(article(published=True)) == [
        "article acne: published without reviewed_by and reviewed_at"
    ]
    assert problems(article(published=True, reviewed_by="x")) == [
        "article acne: published without reviewed_by and reviewed_at"
    ]


def test_goal_articles_toml_is_valid() -> None:
    urls = {
        s["url"]
        for name in ("rules.toml", "goals.toml", "goal_articles.toml")
        for s in load_toml(name).get("source", [])
    }
    codes = {g["code"] for g in load_toml("goals.toml")["goal"]}
    assert article_problems(load_toml("goal_articles.toml"), codes, urls) == []


# --- seeding and the routes ----------------------------------------------------------------


GOALS_DATA = {
    "goal": [
        {"code": c, "name_vi": f"tên {c}", "description_vi": "mô tả", "position": i}
        for i, c in enumerate(["acne", "aging", "all"], start=1)
    ],
    "item": [],
    "source": [{"url": GOAL_URL, "title": "Nguồn mục tiêu", "publisher": "FDA"}],
}


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


def seed_articles(conn: Connection, *articles: dict[str, Any]) -> None:
    source_ids = seed_goals(conn, GOALS_DATA, {})
    seed_goal_articles(conn, data(*articles), source_ids)


FULL = article(
    "acne",
    section(
        "Mụn hình thành thế nào",
        para("đoạn 1", src(URL_B, "b1"), src(URL_A, "a1")),
        para("đoạn 2", src(URL_A, "a2"), src(URL_A, "a1")),
    ),
    section("Chăm sóc", para("đoạn 3", src(GOAL_URL, "g1"), src(URL_B, "b1"))),
    **REVIEWED,
)


def test_published_article_is_served_in_order(conn: Connection, conn_client: TestClient) -> None:
    seed_articles(conn, FULL)
    response = conn_client.get("/goals/acne/article")
    assert response.status_code == 200
    assert response.json() == {
        "goal": "acne",
        "goal_name_vi": "tên acne",
        "title_vi": "tiêu đề",
        "reviewed_by": "Người duyệt",
        "reviewed_at": "2026-11-08",
        "sections": [
            {
                "anchor": "phan-1",
                "heading_vi": "Mụn hình thành thế nào",
                "paragraphs": [
                    {"text_vi": "đoạn 1", "refs": [1, 2]},
                    {"text_vi": "đoạn 2", "refs": [2]},
                ],
            },
            {
                "anchor": "phan-2",
                "heading_vi": "Chăm sóc",
                "paragraphs": [{"text_vi": "đoạn 3", "refs": [1, 3]}],
            },
        ],
        # Numbered by first appearance; one number per url; quotes in order without repeats.
        "sources": [
            {"n": 1, "title": "Nguồn B", "publisher": "DermNet", "url": URL_B, "quotes": ["b1"]},
            {"n": 2, "title": "Nguồn A", "publisher": "AAD", "url": URL_A, "quotes": ["a1", "a2"]},
            {
                "n": 3,
                "title": "Nguồn mục tiêu",
                "publisher": "FDA",
                "url": GOAL_URL,
                "quotes": ["g1"],
            },  # fmt: skip
        ],
        "notice_vi": GOALS_NOTICE_VI,
    }


def test_refs_point_at_their_sources(conn: Connection) -> None:
    seed_articles(conn, FULL)
    loaded = load_article(conn, "acne")
    assert loaded is not None
    for s in loaded.sections:
        for p in s.paragraphs:
            assert p.refs == sorted(set(p.refs))
            assert all(loaded.sources[n - 1].n == n for n in p.refs)


def test_has_article_only_for_published(conn: Connection, conn_client: TestClient) -> None:
    seed_articles(conn, FULL, article("aging"))
    goals = conn_client.get("/goals").json()["goals"]
    assert {g["code"]: g["has_article"] for g in goals} == {"acne": True, "aging": False}


def test_unpublished_unknown_and_shared_are_404(conn: Connection, conn_client: TestClient) -> None:
    seed_articles(conn, article("aging"))
    for code in ("aging", "acne", "nope", "all"):
        response = conn_client.get(f"/goals/{code}/article")
        assert response.status_code == 404, code
        assert response.json() == {"detail": GOAL_ARTICLE_NOT_FOUND_VI}


def test_published_without_review_is_hidden(conn: Connection, conn_client: TestClient) -> None:
    # article_problems refuses this; seeded directly to check the route does not trust the DB.
    seed_articles(conn, article(published=True))
    assert conn_client.get("/goals/acne/article").status_code == 404
    assert conn_client.get("/goals").json()["goals"][0]["has_article"] is False


def test_no_articles_at_all(conn: Connection, conn_client: TestClient) -> None:
    seed_articles(conn)
    assert all(not g["has_article"] for g in conn_client.get("/goals").json()["goals"])
    assert conn_client.get("/goals/acne/article").status_code == 404


def test_seed_replaces_articles(conn: Connection) -> None:
    seed_articles(conn, FULL, article("aging"))
    seed_articles(conn, article("aging", section("mới", para("x")), **REVIEWED))
    rows = conn.execute(text("SELECT goal_code, title_vi FROM goal_articles")).all()
    assert [tuple(r) for r in rows] == [("aging", "tiêu đề")]
    assert conn.execute(text("SELECT count(*) FROM goal_article_paragraphs")).scalar_one() == 1
    count = conn.execute(text("SELECT count(*) FROM goal_article_paragraph_sources")).scalar_one()
    assert count == 1


def test_removed_goal_takes_its_article(conn: Connection) -> None:
    seed_articles(conn, FULL)
    fewer = {**GOALS_DATA, "goal": [g for g in GOALS_DATA["goal"] if g["code"] != "acne"]}
    seed_goals(conn, fewer, {})
    assert conn.execute(text("SELECT count(*) FROM goal_articles")).scalar_one() == 0


def test_seed_rejects_invalid_goal_articles_toml(
    engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    real = seed_module.load_toml

    def fake(name: str) -> dict[str, Any]:
        if name == "goal_articles.toml":
            return data(article("all"))
        return real(name)

    monkeypatch.setattr(seed_module, "load_toml", fake)
    with pytest.raises(ValueError, match="article all: the shared goal 'all' has no article"):
        seed(engine)


def test_real_articles(client: TestClient) -> None:
    """The seeded file: a goal has has_article exactly when its article is published."""
    articles = load_toml("goal_articles.toml").get("article", [])
    published = {a["goal"] for a in articles if a.get("published")}
    goals = client.get("/goals").json()["goals"]
    assert {g["code"] for g in goals if g["has_article"]} == published
    for g in goals:
        expected = 200 if g["code"] in published else 404
        assert client.get(f"/goals/{g['code']}/article").status_code == expected


# --- verify_quotes -------------------------------------------------------------------------


def test_verify_quotes_covers_articles(monkeypatch: pytest.MonkeyPatch) -> None:
    import scripts.verify_quotes as vq

    real = vq.load_toml
    two = article("acne", section("h", para("t", src(URL_A, "a")), para("u", src(URL_B, "b"))))

    def fake(name: str) -> dict[str, Any]:
        return data(two, article("aging")) if name == "goal_articles.toml" else real(name)

    monkeypatch.setattr(vq, "load_toml", fake)
    everything = quotes_to_check([])
    assert ("article:acne §1.1", URL_A, "a") in everything
    assert ("article:aging §1.1", URL_A, "q") in everything
    assert quotes_to_check(["article:acne"]) == [
        ("article:acne §1.1", URL_A, "a"),
        ("article:acne §1.2", URL_B, "b"),
    ]
    assert quotes_to_check(["article:nope"]) == []
