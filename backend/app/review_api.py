"""Routes of the review page, under /review. Every route except /review/login needs a
reviewer's bearer token. Nothing here publishes a rule: rules are published in data/rules.toml.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

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
from app.reviewers import session_reviewer, sign_in, sign_out
from app.rules import load_published_rules
from app.schemas import (
    DraftCreate,
    DraftOut,
    DraftStatusUpdate,
    ReviewerLoginRequest,
    ReviewerOut,
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
def login(db: DbSession, body: ReviewerLoginRequest) -> SignInOut:
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

    def info(code: str) -> GroupInfo:
        return GroupInfo(code, groups[code].name_vi, groups[code].description_vi)

    urls = list(dict.fromkeys(body.source_urls))
    db.commit()  # end the read transaction: fetching and writing take a minute or two
    draft = DraftInput(
        group_a=info(body.group_a),
        group_b=info(body.group_b),
        source_urls=urls,
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
    draft_id = save_draft(db, draft, result, model, checks, reviewer)
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
