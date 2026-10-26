"""Questions users send in. A reviewer picks which become sourced myth cards; nothing here
answers them automatically."""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import bindparam, text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

STATUSES = ("new", "accepted", "rejected", "answered")


@dataclass(frozen=True)
class QuestionRow:
    id: int
    question: str
    product_ids: list[int]
    group_codes: list[str]
    status: str
    created_at: datetime
    rule_key: str | None
    public_question: str | None
    reviewer_note: str | None
    updated_by: str | None
    updated_at: datetime | None


def add_question(
    db: Session | Connection, question: str, product_ids: list[int], group_codes: list[str]
) -> int:
    return db.execute(
        text(
            """
            INSERT INTO user_questions (question, product_ids, group_codes)
            VALUES (:question, :product_ids, :group_codes)
            RETURNING id
            """
        ),
        {"question": question, "product_ids": product_ids, "group_codes": group_codes},
    ).scalar_one()


_COLUMNS = """
    id, question, product_ids, group_codes, status, created_at, rule_key, public_question,
    reviewer_note, updated_by, updated_at
"""
_LIST = text(
    f"SELECT {_COLUMNS} FROM user_questions WHERE status IN :statuses ORDER BY created_at, id"
).bindparams(bindparam("statuses", expanding=True))


def list_questions(db: Session | Connection, statuses: list[str]) -> list[QuestionRow]:
    return [QuestionRow(*row) for row in db.execute(_LIST, {"statuses": statuses})]


def get_question(db: Session | Connection, question_id: int) -> QuestionRow | None:
    row = db.execute(
        text(f"SELECT {_COLUMNS} FROM user_questions WHERE id = :id"), {"id": question_id}
    ).first()
    return QuestionRow(*row) if row else None


def count_by_status(db: Session | Connection) -> dict[str, int]:
    counts = dict.fromkeys(STATUSES, 0)
    rows = db.execute(text("SELECT status, count(*) FROM user_questions GROUP BY status"))
    counts.update({status: n for status, n in rows})
    return counts


def update_question(
    db: Session | Connection,
    question_id: int,
    reviewer: str,
    *,
    status: str,
    rule_key: str | None,
    public_question: str | None,
    reviewer_note: str | None,
) -> None:
    db.execute(
        text(
            """
            UPDATE user_questions SET status = :status, rule_key = :rule_key,
              public_question = :public_question, reviewer_note = :reviewer_note,
              updated_by = :reviewer, updated_at = now()
            WHERE id = :id
            """
        ),
        {
            "id": question_id,
            "status": status,
            "rule_key": rule_key,
            "public_question": public_question,
            "reviewer_note": reviewer_note,
            "reviewer": reviewer,
        },
    )


@dataclass(frozen=True)
class AnsweredQuestion:
    id: int
    public_question: str
    rule_key: str


def list_answered(db: Session | Connection) -> list[AnsweredQuestion]:
    """Answered questions in the reviewer's public wording. The caller still has to drop
    those whose rule is not published (or lost its sources), as load_published_rules does."""
    rows = db.execute(
        text(
            """
            SELECT id, public_question, rule_key FROM user_questions
            WHERE status = 'answered' AND rule_key IS NOT NULL AND public_question IS NOT NULL
            ORDER BY updated_at DESC NULLS LAST, id DESC
            """
        )
    )
    return [AnsweredQuestion(*row) for row in rows]


def product_labels(db: Session | Connection, product_ids: list[int]) -> dict[int, str]:
    """Label ("brand name") of each product a question mentions; deleted ones are left out."""
    if not product_ids:
        return {}
    rows = db.execute(
        text("SELECT id, brand || ' ' || name FROM products WHERE id = ANY(:ids)"),
        {"ids": product_ids},
    )
    return {pid: label for pid, label in rows}


def draft_ids_by_question(db: Session | Connection) -> dict[int, list[int]]:
    rows = db.execute(
        text(
            "SELECT question_id, id FROM rule_drafts "
            "WHERE question_id IS NOT NULL AND status = 'draft' ORDER BY id"
        )
    )
    ids: dict[int, list[int]] = {}
    for question_id, draft_id in rows:
        ids.setdefault(question_id, []).append(draft_id)
    return ids
