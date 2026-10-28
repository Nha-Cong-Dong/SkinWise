"""Sending account emails: the link that verifies an address, the password reset link, and the
note that an address already has an account.

Two modes (settings.login_email_mode):
- "dev" (default): no email leaves the machine; the link goes to the server log and back to
  the page.
- "smtp": plain-text Vietnamese emails through an SMTP server, sent after the response (FastAPI
  BackgroundTasks) so the answer time does not tell which addresses have an account. Meant for
  trying with one's own mailbox until an email service based in Vietnam is chosen
  (plan/h-accounts.md, direction A).
Any other mode, or "smtp" without a host or a sender, refuses rather than pretending to send.
The log never names the address, and in smtp mode never holds the link.
"""

import logging
import smtplib
import ssl
from email.message import EmailMessage
from typing import Literal

from fastapi import BackgroundTasks

from app.config import get_settings

log = logging.getLogger("skinwise.mail")

LinkKind = Literal["verify", "reset"]
SMTP_TIMEOUT = 15  # seconds

SUBJECTS = {
    "verify": "SkinWise: xác thực email của bạn",
    "reset": "SkinWise: đặt lại mật khẩu",
    "account_exists": "SkinWise: email này đã có tài khoản",
}


class MailNotConfigured(Exception):
    """No way to send email is configured for this mode."""


def dev_mode() -> bool:
    return get_settings().login_email_mode == "dev"


def ensure_configured() -> None:
    """Raise MailNotConfigured unless email can be sent. Called before deciding whether to send,
    so an unknown address and a known one fail the same way."""
    settings = get_settings()
    if settings.login_email_mode == "dev":
        return
    if settings.login_email_mode == "smtp" and settings.smtp_host and settings.smtp_from:
        return
    raise MailNotConfigured(settings.login_email_mode)


def _body(kind: str, link: str) -> str:
    if kind == "verify":
        return (
            "Chào bạn,\n\n"
            "Để xác thực email cho tài khoản SkinWise, hãy mở link dưới đây rồi nhập mật khẩu "
            "bạn vừa đặt khi tạo tài khoản:\n\n"
            f"{link}\n\n"
            "Link dùng được một lần, trong 24 giờ.\n\n"
            "Nếu bạn không tạo tài khoản SkinWise, hãy bỏ qua email này.\n\n"
            "SkinWise\n"
        )
    if kind == "reset":
        return (
            "Chào bạn,\n\n"
            "Để đặt mật khẩu mới cho tài khoản SkinWise, hãy mở link dưới đây:\n\n"
            f"{link}\n\n"
            "Link dùng được một lần, trong 30 phút.\n\n"
            "Nếu bạn không yêu cầu, hãy bỏ qua email này; mật khẩu của bạn không đổi.\n\n"
            "SkinWise\n"
        )
    return (
        "Chào bạn,\n\n"
        "Ai đó (có thể là bạn) vừa tạo tài khoản bằng email này. Nếu quên mật khẩu, hãy dùng "
        f"Quên mật khẩu trên trang đăng nhập: {link}\n\n"
        "Nếu không phải bạn, hãy bỏ qua email này; tài khoản của bạn không đổi.\n\n"
        "SkinWise\n"
    )


def build_message(kind: str, email: str, link: str) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = SUBJECTS[kind]
    message["From"] = get_settings().smtp_from
    message["To"] = email
    message.set_content(_body(kind, link))
    return message


def _connect() -> smtplib.SMTP:
    settings = get_settings()
    host, port = settings.smtp_host or "", settings.smtp_port
    if settings.smtp_security == "ssl":
        context = ssl.create_default_context()
        return smtplib.SMTP_SSL(host, port, timeout=SMTP_TIMEOUT, context=context)
    smtp = smtplib.SMTP(host, port, timeout=SMTP_TIMEOUT)
    if settings.smtp_security == "starttls":
        smtp.starttls(context=ssl.create_default_context())
    return smtp


def deliver(kind: str, email: str, message: EmailMessage) -> None:
    """Send one email. Runs after the response; a failure is only logged, with the kind of
    email and the error type, never the address, the link or the SMTP password."""
    settings = get_settings()
    try:
        with _connect() as smtp:
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password or "")
            # The envelope names the one address, whatever the To header parses into.
            smtp.send_message(message, to_addrs=[email])
    except Exception as e:  # noqa: BLE001 - any failure: log and drop, the route answered 202
        code = getattr(e, "smtp_code", None)
        log.error(
            "Could not send the %s email: %s%s", kind, type(e).__name__, f" {code}" if code else ""
        )


def _send(kind: str, email: str, link: str, tasks: BackgroundTasks) -> None:
    tasks.add_task(deliver, kind, email, build_message(kind, email, link))


def send_link(kind: LinkKind, email: str, link: str, tasks: BackgroundTasks) -> str | None:
    """Send a verify / reset link. In dev mode, log it and return it so the page can show it;
    in smtp mode, queue the email to go after the response and return None."""
    ensure_configured()
    if dev_mode():
        log.warning("Dev mode, no email sent. %s link: %s", kind, link)
        return link
    _send(kind, email, link, tasks)
    return None


def send_account_exists(email: str, tasks: BackgroundTasks) -> None:
    """Tell the owner that someone tried to register their address again (no token)."""
    ensure_configured()
    if dev_mode():
        log.warning("Dev mode, no email sent: a registration for an existing account.")
        return
    _send("account_exists", email, get_settings().app_url.rstrip("/") + "/", tasks)
