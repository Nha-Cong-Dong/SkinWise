"""Routes of the review page, under /review. Every route except /review/login needs a
reviewer's bearer token. Nothing here publishes a rule: rules are published in data/rules.toml.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.api import DbSession
from app.drafts import (
    DraftingError,
    DraftInput,
    DraftRow,
    GroupInfo,
    build_prompt,
    call_model,
    check_quotes,
    draft_toml,
    fetch_sources,
    get_draft,
    known_source_urls,
    list_drafts,
    save_draft,
    set_draft_status,
)
from app.ingredients import list_groups
from app.questions import (
    STATUSES,
    QuestionRow,
    count_by_status,
    draft_ids_by_question,
    get_question,
    list_questions,
    product_labels,
    update_question,
)
from app.reviewers import session_reviewer, sign_in, sign_out
from app.rules import list_all_rules, load_published_rules
from app.schemas import (
    DraftCreate,
    DraftOut,
    DraftStatusUpdate,
    LoginRequest,
    QuestionStatus,
    QuestionUpdate,
    RelatedProductOut,
    ReviewerOut,
    ReviewQuestionOut,
    ReviewQuestionsOut,
    ReviewRuleOut,
    SignInOut,
)

_bearer = HTTPBearer(auto_error=False)
Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]


def current_reviewer(db: DbSession, credentials: Credentials) -> str:
    name = session_reviewer(db, credentials.credentials) if credentials else None
    if name is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "sign in as a reviewer",
                            headers={"WWW-Authenticate": "Bearer"})  # fmt: skip
    return name


Reviewer = Annotated[str, Depends(current_reviewer)]

router = APIRouter(prefix="/review", tags=["review"])


@router.post("/login")
def login(db: DbSession, body: LoginRequest) -> SignInOut:
    signed_in = sign_in(db, body.name, body.password)
    if signed_in is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "wrong name or password")
    db.commit()
    return SignInOut.model_validate(signed_in)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(db: DbSession, reviewer: Reviewer, credentials: Credentials) -> Response:
    assert credentials is not None  # Reviewer has checked the token
    sign_out(db, credentials.credentials)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me")
def me(reviewer: Reviewer) -> ReviewerOut:
    return ReviewerOut(name=reviewer)


@router.get("/rules")
def rules(db: DbSession, reviewer: Reviewer) -> list[ReviewRuleOut]:
    return [ReviewRuleOut.model_validate(r) for r in list_all_rules(db)]


def question_out(
    db: Session, rows: list[QuestionRow], rules_by_key: dict[str, ReviewRuleOut]
) -> list[ReviewQuestionOut]:
    labels = product_labels(db, sorted({pid for q in rows for pid in q.product_ids}))
    drafts = draft_ids_by_question(db)
    # Same test as GET /questions/answered: published and still has its sources.
    shown = {r.key for r in load_published_rules(db)}
    return [
        ReviewQuestionOut.model_validate(
            {
                **q.__dict__,
                "products": [
                    RelatedProductOut(id=pid, label=labels.get(pid, f"#{pid} (đã xoá)"))
                    for pid in q.product_ids
                ],
                "rule": rules_by_key.get(q.rule_key) if q.rule_key else None,
                "public": q.status == "answered"
                and bool(q.public_question)
                and q.rule_key in shown,
                "draft_ids": drafts.get(q.id, []),
            }
        )
        for q in rows
    ]


def rules_by_key(db: Session) -> dict[str, ReviewRuleOut]:
    return {r.key: ReviewRuleOut.model_validate(r) for r in list_all_rules(db)}


@router.get("/questions")
def questions(
    db: DbSession,
    reviewer: Reviewer,
    status_: Annotated[list[QuestionStatus], Query(alias="status")] = [],  # noqa: B006
) -> ReviewQuestionsOut:
    """Questions with the given statuses (all when none is given), oldest first."""
    rows = list_questions(db, list(status_) or list(STATUSES))
    return ReviewQuestionsOut(
        questions=question_out(db, rows, rules_by_key(db)), counts=count_by_status(db)
    )


@router.put("/questions/{question_id}")
def review_question(
    db: DbSession, reviewer: Reviewer, question_id: int, body: QuestionUpdate
) -> ReviewQuestionOut:
    if get_question(db, question_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "question not found")
    known = rules_by_key(db)
    if body.rule_key is not None and body.rule_key not in known:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f"unknown rule key: {body.rule_key}")  # fmt: skip
    update_question(
        db,
        question_id,
        reviewer,
        status=body.status,
        rule_key=body.rule_key,
        public_question=body.public_question or None,
        reviewer_note=body.reviewer_note or None,
    )
    db.commit()
    row = get_question(db, question_id)
    assert row is not None
    return question_out(db, [row], known)[0]


def draft_out(d: DraftRow, known_urls: set[str]) -> DraftOut:
    return DraftOut.model_validate({**d.__dict__, "toml": draft_toml(d, known_urls)})


@router.post("/drafts", status_code=status.HTTP_201_CREATED)
def create_draft(db: DbSession, reviewer: Reviewer, body: DraftCreate) -> DraftOut:
    """Ask the AI for a myth card draft from the given pages. Takes a minute or two: the
    pages are fetched, the model writes, then every quote is looked for on its page."""
    groups = {g.code: g for g in list_groups(db)}
    if unknown := {body.group_a, body.group_b} - groups.keys():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f"unknown group codes: {sorted(unknown)}")  # fmt: skip
    question = None
    if body.question_id is not None:
        question = get_question(db, body.question_id)
        if question is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "question not found")

    def info(code: str) -> GroupInfo:
        return GroupInfo(code, groups[code].name_vi, groups[code].description_vi)

    urls = list(dict.fromkeys(body.source_urls))
    db.commit()  # end the read transaction: fetching and writing take a minute or two
    draft = DraftInput(
        group_a=info(body.group_a),
        group_b=info(body.group_b),
        source_urls=urls,
        question=question.question if question else None,
        instructions=body.instructions,
        examples=[
            (r.title_vi, r.explanation_vi) for r in load_published_rules(db) if r.kind == "myth"
        ],
    )
    try:
        pages = fetch_sources(urls)
        result, model = call_model(build_prompt(draft, pages))
    except DraftingError as e:
        raise HTTPException(e.status, str(e)) from e
    checks = check_quotes(result.quotes, pages)
    draft_id = save_draft(db, draft, result, model, checks, body.question_id, reviewer)
    db.commit()
    row = get_draft(db, draft_id)
    assert row is not None
    return draft_out(row, known_source_urls(db))


@router.get("/drafts")
def drafts(
    db: DbSession,
    reviewer: Reviewer,
    status_: Annotated[Literal["draft", "discarded"], Query(alias="status")] = "draft",
) -> list[DraftOut]:
    known = known_source_urls(db)
    return [draft_out(d, known) for d in list_drafts(db, status_)]


@router.patch("/drafts/{draft_id}")
def update_draft(
    db: DbSession, reviewer: Reviewer, draft_id: int, body: DraftStatusUpdate
) -> DraftOut:
    if get_draft(db, draft_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "draft not found")
    set_draft_status(db, draft_id, body.status)
    db.commit()
    row = get_draft(db, draft_id)
    assert row is not None
    return draft_out(row, known_source_urls(db))
