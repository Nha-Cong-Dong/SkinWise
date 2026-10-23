"""Questions users send in. A reviewer picks which become sourced myth cards; nothing here
answers them automatically."""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import bindparam, text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session


@dataclass(frozen=True)
class QuestionRow:
    id: int
    question: str
    product_ids: list[int]
    group_codes: list[str]
    status: str
    created_at: datetime


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


_LIST = text(
    """
    SELECT id, question, product_ids, group_codes, status, created_at
    FROM user_questions WHERE status IN :statuses ORDER BY created_at, id
    """
).bindparams(bindparam("statuses", expanding=True))


def list_questions(db: Session | Connection, statuses: list[str]) -> list[QuestionRow]:
    return [QuestionRow(*row) for row in db.execute(_LIST, {"statuses": statuses})]
