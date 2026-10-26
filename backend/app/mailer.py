"""Sending the sign-in link.

Only "dev" mode exists until an email service based in Vietnam is chosen (plan/h-accounts.md,
direction A): no email leaves the machine; the link goes to the server log and back to the page.
Any other mode refuses rather than pretending to send.
"""

import logging

from app.config import get_settings

log = logging.getLogger("skinwise.mail")


class MailNotConfigured(Exception):
    """No way to send email is configured for this mode."""


def dev_mode() -> bool:
    return get_settings().login_email_mode == "dev"


def send_login_link(email: str, link: str) -> str | None:
    """Send the link. In dev mode, log it and return it so the page can show it; otherwise
    return None once a real sender exists."""
    if dev_mode():
        log.warning("Dev mode, no email sent. Sign-in link for %s: %s", email, link)
        return link
    raise MailNotConfigured(get_settings().login_email_mode)
