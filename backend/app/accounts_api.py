"""Routes for user accounts: /auth (register, verify the email, sign in with a password,
reset a forgotten password, sign out) and /me (the signed-in user).

The session is an HttpOnly, SameSite=Lax cookie: every state change is a POST/PUT/DELETE,
which SameSite=Lax keeps from being sent by other sites. Design: plan/h-accounts.md.
"""

from typing import Annotated

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Cookie,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from fastapi.responses import JSONResponse

from app import mailer
from app.accounts import (
    POLICY_VERSION,
    SESSION_TTL,
    User,
    VerifyOutcome,
    allow_email_request,
    consents,
    create_reset_token,
    create_session,
    delete_user,
    end_all_sessions,
    end_session,
    export_user,
    get_routine,
    login,
    normalize_email,
    put_routine,
    register,
    resend_verification,
    reset_password,
    reset_target,
    session_user,
    verify_email,
)
from app.api import DbSession
from app.config import get_settings
from app.mailer import MailNotConfigured
from app.passwords import MAX_LENGTH, MIN_LENGTH, password_problem
from app.schemas import (
    ConsentOut,
    DeleteAccount,
    EmailRequest,
    EmailSent,
    LoginRequest,
    MeOut,
    RegisterRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    RoutineOut,
    RoutinePut,
    StoredRoutineData,
    VerifyEmailRequest,
)

COOKIE = "skinwise_session"

VERIFY_SENT_VI = (
    "Nếu email này chưa có tài khoản, SkinWise đã gửi link xác thực tới email. "
    "Link dùng được một lần, trong 24 giờ. Không thấy email thì xem thư mục spam."
)
RESEND_SENT_VI = (
    "Nếu email và mật khẩu khớp với một tài khoản chưa xác thực, SkinWise đã gửi link xác thực "
    "mới. Link dùng được một lần, trong 24 giờ. Không thấy email thì xem thư mục spam."
)
RESET_SENT_VI = (
    "Nếu email này có tài khoản đã xác thực, SkinWise đã gửi link đặt lại mật khẩu. "
    "Link dùng được một lần, trong 30 phút. Không thấy email thì xem thư mục spam. "
    "Nếu bạn chưa xác thực email, hãy tạo tài khoản lại."
)
DEV_LINK_VI = (
    "Chế độ thử: SkinWise chưa gửi email thật. Bấm link bên dưới để tiếp tục; "
    "link chỉ dùng được một lần."
)
DEV_ACCOUNT_EXISTS_VI = (
    "Chế độ thử: email này đã có tài khoản. Nếu quên mật khẩu, hãy dùng Quên mật khẩu."
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
        dev_mode=mailer.dev_mode(),
    )


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _email_or_422(raw: str) -> str:
    email = normalize_email(raw)
    if email is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "not an email address")
    return email


def _check_new_password(password: str, email: str) -> None:
    problem = password_problem(password, email)
    if problem:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, problem)


def _mail_unavailable() -> HTTPException:
    return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "email is not set up")


def _before_sending(email: str, request: Request) -> None:
    """503 when email cannot be sent, 429 when asked too often. Both come before looking the
    address up, so a known and an unknown address are answered alike."""
    try:
        mailer.ensure_configured()
    except MailNotConfigured as e:
        raise _mail_unavailable() from e
    if not allow_email_request(email, _ip(request)):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too many emails; wait")


def _link(route: str, token: str) -> str:
    return f"{get_settings().app_url.rstrip('/')}/#{route}?token={token}"


def _sent(real_message: str, dev_link: str | None, account_exists: bool = False) -> EmailSent:
    """The answer to a request that may send an email. Outside dev mode it never depends on
    whether the address has an account."""
    if mailer.dev_mode():
        if dev_link:
            return EmailSent(message_vi=DEV_LINK_VI, dev_link=dev_link)
        if account_exists:
            return EmailSent(message_vi=DEV_ACCOUNT_EXISTS_VI, dev_link=None)
    return EmailSent(message_vi=real_message, dev_link=None)


def _send_verification(
    db: DbSession,
    tasks: BackgroundTasks,
    email: str,
    token: str | None,
    exists: bool,
    real_message: str,
) -> EmailSent:
    """Send the verify link, or the note that the address already has an account; commit."""
    dev_link = None
    try:
        if token:
            dev_link = mailer.send_link("verify", email, _link("verify-email", token), tasks)
        elif exists:
            mailer.send_account_exists(email, tasks)
    except MailNotConfigured as e:
        db.rollback()
        raise _mail_unavailable() from e
    db.commit()
    return _sent(real_message, dev_link, account_exists=exists)


def _start_session(db: DbSession, response: Response, user: User) -> MeOut:
    _set_cookie(response, create_session(db, user.id))
    db.commit()
    return _me(db, user)


@router.post("/auth/register", status_code=status.HTTP_202_ACCEPTED)
def register_route(
    db: DbSession, body: RegisterRequest, request: Request, tasks: BackgroundTasks
) -> EmailSent:
    """Create an account and send the link that verifies the address. Outside dev mode the
    answer is the same whether or not the address already has an account."""
    if not body.consent:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "consent is required")
    if body.policy_version != POLICY_VERSION:
        raise HTTPException(status.HTTP_409_CONFLICT, "the privacy policy changed; reload the page")
    email = _email_or_422(body.email)
    _check_new_password(body.password, email)
    _before_sending(email, request)
    token = register(db, email, body.password, body.policy_version)
    return _send_verification(db, tasks, email, token, token is None, VERIFY_SENT_VI)


@router.post("/auth/verify-email")
def verify_email_route(
    db: DbSession, body: VerifyEmailRequest, request: Request, response: Response
) -> MeOut:
    """Verify the address with the emailed link and the password set when registering, then
    sign in on this device. A wrong password keeps the link and counts as a failed sign-in."""
    outcome, user = verify_email(db, body.token, body.password, _ip(request))
    if outcome is VerifyOutcome.LIMITED:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too many wrong passwords; wait")
    if outcome is VerifyOutcome.WRONG_PASSWORD:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "wrong password")
    if user is None:
        db.commit()  # a link for an account verified since is used up
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "the link expired or was used")
    return _start_session(db, response, user)


@router.post("/auth/resend-verification", status_code=status.HTTP_202_ACCEPTED)
def resend_verification_route(
    db: DbSession, body: ResendVerificationRequest, request: Request, tasks: BackgroundTasks
) -> EmailSent:
    """Send a new verify link, only for an unverified account and its password. The answer is
    the same whether or not anything was sent."""
    email = _email_or_422(body.email)
    _before_sending(email, request)
    token = resend_verification(db, email, body.password)
    return _send_verification(db, tasks, email, token, False, RESEND_SENT_VI)


@router.post("/auth/login")
def login_route(db: DbSession, body: LoginRequest, request: Request, response: Response) -> MeOut:
    """401 for a wrong email or a wrong password alike; 403 only once the password is right."""
    result = login(db, normalize_email(body.email), body.password, _ip(request))
    if result.limited:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too many wrong passwords; wait")
    if result.unverified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "email not verified")
    if result.user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "wrong email or password")
    return _start_session(db, response, result.user)


@router.post("/auth/forgot-password", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(
    db: DbSession, body: EmailRequest, request: Request, tasks: BackgroundTasks
) -> EmailSent:
    """Send a password reset link if the address has a verified account; the answer is the same
    if not (nothing is sent to an unverified one, which still counts toward the rate limit)."""
    email = _email_or_422(body.email)
    _before_sending(email, request)
    token = create_reset_token(db, email)
    dev_link = None
    if token:
        try:
            dev_link = mailer.send_link("reset", email, _link("reset-password", token), tasks)
        except MailNotConfigured as e:
            db.rollback()
            raise _mail_unavailable() from e
    db.commit()
    return _sent(RESET_SENT_VI, dev_link)


@router.post("/auth/reset-password")
def reset_password_route(db: DbSession, body: ResetPasswordRequest, response: Response) -> MeOut:
    """Set a new password; every other session of the account ends and this one starts."""
    if not MIN_LENGTH <= len(body.password) <= MAX_LENGTH:
        _check_new_password(body.password, "")
    email = reset_target(db, body.token)
    if email is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "the link expired or was used")
    _check_new_password(body.password, email)  # the link is not used up by a refused password
    user = reset_password(db, body.token, body.password)
    if user is None:
        db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "the link expired or was used")
    return _start_session(db, response, user)


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
