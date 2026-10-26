"""Routes for user accounts: /auth (sign-in by emailed link) and /me (the signed-in user).

The session is an HttpOnly, SameSite=Lax cookie: every state change is a POST/PUT/DELETE,
which SameSite=Lax keeps from being sent by other sites. Design: plan/h-accounts.md.
"""

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse

from app.accounts import (
    POLICY_VERSION,
    SESSION_TTL,
    User,
    allow_link_request,
    consents,
    create_login_token,
    create_session,
    delete_user,
    end_all_sessions,
    end_session,
    export_user,
    get_routine,
    normalize_email,
    put_routine,
    redeem_login_token,
    session_user,
)
from app.api import DbSession
from app.config import get_settings
from app.mailer import MailNotConfigured, dev_mode, send_login_link
from app.schemas import (
    ConsentOut,
    DeleteAccount,
    EmailLinkRequest,
    EmailLinkSent,
    MeOut,
    RoutineOut,
    RoutinePut,
    SessionRequest,
    StoredRoutineData,
)

COOKIE = "skinwise_session"

LINK_SENT_VI = (
    "Đã gửi link đăng nhập tới email của bạn. Link chỉ dùng được một lần, trong 15 phút. "
    "Không thấy email thì xem thư mục spam, hoặc gửi lại."
)
LINK_SENT_DEV_VI = (
    "Chế độ thử: SkinWise chưa gửi email thật. Bấm link bên dưới để đăng nhập; "
    "link chỉ dùng được một lần, trong 15 phút."
)

router = APIRouter(tags=["accounts"])


def current_user(db: DbSession, skinwise_session: Annotated[str | None, Cookie()] = None) -> User:
    user = session_user(db, skinwise_session) if skinwise_session else None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "sign in first")
    db.commit()  # the session was extended
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def _set_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        COOKIE,
        session_id,
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,
        samesite="lax",
        secure=get_settings().app_url.startswith("https://"),
        path="/",
    )


def _me(db: DbSession, user: User) -> MeOut:
    return MeOut(
        email=user.email,
        created_at=user.created_at,
        consents=[ConsentOut.model_validate(c) for c in consents(db, user.id)],
        routine_updated_at=get_routine(db, user.id).updated_at,
        dev_mode=dev_mode(),
    )


@router.post("/auth/email-link", status_code=status.HTTP_202_ACCEPTED)
def email_link(db: DbSession, body: EmailLinkRequest, request: Request) -> EmailLinkSent:
    """Send a sign-in link. The answer is the same whether or not the address has an account."""
    if not body.consent:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "consent is required")
    if body.policy_version != POLICY_VERSION:
        raise HTTPException(status.HTTP_409_CONFLICT, "the privacy policy changed; reload the page")
    email = normalize_email(body.email)
    if email is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "not an email address")
    if not allow_link_request(email, request.client.host if request.client else None):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too many sign-in links; wait")
    token = create_login_token(db, email)
    link = f"{get_settings().app_url.rstrip('/')}/#sign-in?token={token}"
    try:
        dev_link = send_login_link(email, link)
    except MailNotConfigured as e:
        db.rollback()
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "email is not set up") from e
    db.commit()
    message = LINK_SENT_DEV_VI if dev_link else LINK_SENT_VI
    return EmailLinkSent(message_vi=message, dev_link=dev_link)


@router.post("/auth/session")
def start_session(db: DbSession, body: SessionRequest, response: Response) -> MeOut:
    user = redeem_login_token(db, body.token)
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "the sign-in link expired or was used")
    _set_cookie(response, create_session(db, user.id))
    db.commit()
    return _me(db, user)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    db: DbSession, response: Response, skinwise_session: Annotated[str | None, Cookie()] = None
) -> None:
    if skinwise_session:
        end_session(db, skinwise_session)
        db.commit()
    response.delete_cookie(COOKIE, path="/")


@router.post("/auth/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all(db: DbSession, user: CurrentUser, response: Response) -> None:
    end_all_sessions(db, user.id)
    db.commit()
    response.delete_cookie(COOKIE, path="/")


@router.get("/me")
def me(db: DbSession, user: CurrentUser) -> MeOut:
    return _me(db, user)


def _routine_out(data: dict | None, version: int, updated_at) -> RoutineOut:
    parsed = StoredRoutineData.model_validate(data) if data is not None else None
    return RoutineOut(data=parsed, version=version, updated_at=updated_at)


@router.get("/me/routine")
def my_routine(db: DbSession, user: CurrentUser) -> RoutineOut:
    stored = get_routine(db, user.id)
    return _routine_out(stored.data, stored.version, stored.updated_at)


@router.put("/me/routine", responses={409: {"model": RoutineOut}})
def save_routine(db: DbSession, user: CurrentUser, body: RoutinePut) -> RoutineOut:
    """Store the routine. 409 with what is stored when another device wrote since
    `base_version`: the user chooses which to keep, nothing is overwritten silently."""
    data = body.data.model_dump(by_alias=True)
    saved = put_routine(db, user.id, data, body.base_version)
    if saved is None:
        db.rollback()
        stored = get_routine(db, user.id)
        current = _routine_out(stored.data, stored.version, stored.updated_at)
        content = current.model_dump(mode="json", by_alias=True)
        return JSONResponse(content, status_code=status.HTTP_409_CONFLICT)  # type: ignore[return-value]
    db.commit()
    return _routine_out(saved.data, saved.version, saved.updated_at)


@router.get("/me/export")
def export(db: DbSession, user: CurrentUser) -> JSONResponse:
    """Everything SkinWise keeps about the user (Law 91/2025/QH15 Art. 4)."""
    return JSONResponse(
        export_user(db, user),
        headers={"Content-Disposition": 'attachment; filename="skinwise-tai-khoan.json"'},
    )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(db: DbSession, user: CurrentUser, body: DeleteAccount, response: Response) -> None:
    if normalize_email(body.confirm_email) != user.email:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "type your email to confirm")
    delete_user(db, user)
    db.commit()
    response.delete_cookie(COOKIE, path="/")
