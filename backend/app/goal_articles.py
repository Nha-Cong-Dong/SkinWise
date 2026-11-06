"""Long articles for a skin goal (data/goal_articles.toml): sections of paragraphs, each paragraph
backed by verbatim quotes. Display only: nothing here reaches the warning engine, the rules or
resolve()."""

from collections import Counter
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.goals import SHARED_GOAL


def article_problems(data: dict[str, Any], goal_codes: set[str], known_urls: set[str]) -> list[str]:
    """Why goal_articles.toml must not be seeded as written (empty = fine). `goal_codes` are the
    codes in goals.toml; `known_urls` the [[source]] urls of rules.toml, goals.toml and
    goal_articles.toml together."""
    articles = data.get("article", [])
    problems = [f"article {goal}: more than one article for this goal" for goal, n in
                Counter(a.get("goal") for a in articles).items() if n > 1]  # fmt: skip
    for article in articles:
        label = f"article {article.get('goal')}"
        problems += [f"{label}: {p}" for p in _article_problems(article, goal_codes, known_urls)]
    return problems


def _article_problems(
    article: dict[str, Any], goal_codes: set[str], known_urls: set[str]
) -> list[str]:
    problems = []
    goal = article.get("goal")
    if goal == SHARED_GOAL:
        problems.append(f"the shared goal {SHARED_GOAL!r} has no article")
    elif goal not in goal_codes:
        problems.append(f"unknown goal {goal!r}")
    if not str(article.get("title_vi", "")).strip():
        problems.append("no title_vi")
    sections = article.get("section", [])
    if not sections:
        problems.append("no section")
    for i, section in enumerate(sections, start=1):
        if not str(section.get("heading_vi", "")).strip():
            problems.append(f"section {i}: no heading_vi")
        paragraphs = section.get("paragraph", [])
        if not paragraphs:
            problems.append(f"section {i}: no paragraph")
        for j, paragraph in enumerate(paragraphs, start=1):
            where = f"section {i} paragraph {j}"
            if not str(paragraph.get("text_vi", "")).strip():
                problems.append(f"{where}: empty text_vi")
            sources = paragraph.get("sources", [])
            if not sources:
                problems.append(f"{where}: no source")
            for s in sources:
                url = s.get("url")
                if url not in known_urls:
                    problems.append(f"{where}: source {url} has no [[source]] block")
                if not str(s.get("quote", "")).strip():
                    problems.append(f"{where}: source {url} has no quote")
    if article.get("published") and (
        not article.get("reviewed_by") or not article.get("reviewed_at")
    ):
        problems.append("published without reviewed_by and reviewed_at")
    return problems


@dataclass
class ArticleParagraph:
    text_vi: str
    refs: list[int] = field(default_factory=list)


@dataclass
class ArticleSection:
    anchor: str
    heading_vi: str
    paragraphs: list[ArticleParagraph] = field(default_factory=list)


@dataclass
class ArticleSource:
    n: int
    title: str
    publisher: str
    url: str
    quotes: list[str] = field(default_factory=list)


@dataclass
class GoalArticle:
    goal: str
    goal_name_vi: str
    title_vi: str
    reviewed_by: str
    reviewed_at: date
    sections: list[ArticleSection] = field(default_factory=list)
    sources: list[ArticleSource] = field(default_factory=list)


# Inner joins: a paragraph without a source is not shown, nor a section left without paragraphs.
# article_problems already refuses such data; this keeps "no source, nothing shown" for the DB too.
_PUBLISHED_ARTICLE = text(
    """
    SELECT a.goal_code, g.name_vi AS goal_name_vi, a.title_vi, a.reviewed_by,
           a.reviewed_at::date AS reviewed_at, p.id AS paragraph_id, p.section_position,
           p.heading_vi, p.text_vi, s.title, s.publisher, s.url, ps.quote
    FROM goal_articles a
    JOIN goals g ON g.code = a.goal_code AND NOT g.shared
    JOIN goal_article_paragraphs p ON p.goal_code = a.goal_code
    JOIN goal_article_paragraph_sources ps ON ps.paragraph_id = p.id
    JOIN sources s ON s.id = ps.source_id
    WHERE a.goal_code = :code AND a.published
      AND a.reviewed_by IS NOT NULL AND a.reviewed_at IS NOT NULL
    ORDER BY p.section_position, p.position, ps.position
    """
)


def load_article(db: Session | Connection, code: str) -> GoalArticle | None:
    """The published article of a goal, or None (unknown goal, the shared goal, no article or
    not published). Sources are numbered by first appearance; one number per url."""
    article: GoalArticle | None = None
    sections: dict[int, ArticleSection] = {}
    paragraphs: dict[int, ArticleParagraph] = {}
    sources: dict[str, ArticleSource] = {}
    for row in db.execute(_PUBLISHED_ARTICLE, {"code": code}):
        if article is None:
            article = GoalArticle(
                row.goal_code, row.goal_name_vi, row.title_vi, row.reviewed_by, row.reviewed_at
            )
        if row.section_position not in sections:
            section = ArticleSection(f"phan-{len(sections) + 1}", row.heading_vi)
            sections[row.section_position] = section
            article.sections.append(section)
        if row.paragraph_id not in paragraphs:
            paragraph = ArticleParagraph(row.text_vi)
            paragraphs[row.paragraph_id] = paragraph
            sections[row.section_position].paragraphs.append(paragraph)
        if row.url not in sources:
            sources[row.url] = ArticleSource(len(sources) + 1, row.title, row.publisher, row.url)
            article.sources.append(sources[row.url])
        source = sources[row.url]
        if row.quote not in source.quotes:
            source.quotes.append(row.quote)
        refs = paragraphs[row.paragraph_id].refs
        if source.n not in refs:
            refs.append(source.n)
    if article is not None:
        for paragraph in paragraphs.values():
            paragraph.refs.sort()
    return article


def published_article_goals(db: Session | Connection) -> set[str]:
    """Goals whose article load_article would return."""
    return set(db.execute(_PUBLISHED_GOALS).scalars())


_PUBLISHED_GOALS = text(
    """
    SELECT a.goal_code
    FROM goal_articles a
    JOIN goals g ON g.code = a.goal_code AND NOT g.shared
    WHERE a.published AND a.reviewed_by IS NOT NULL AND a.reviewed_at IS NOT NULL
      AND EXISTS (SELECT 1 FROM goal_article_paragraphs p
                  JOIN goal_article_paragraph_sources ps ON ps.paragraph_id = p.id
                  WHERE p.goal_code = a.goal_code)
    """
)
