from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/skinwise"
    # AI myth card drafts on the review page. Without a key the SDK falls back to
    # ANTHROPIC_API_KEY in the environment; with neither, drafting answers 503.
    anthropic_api_key: str | None = None
    # A gateway that speaks the Anthropic Messages API (e.g. the hackathon's). None: the SDK's
    # default, or ANTHROPIC_BASE_URL in the environment.
    anthropic_base_url: str | None = None
    draft_model: str = "claude-opus-5-5"
    # Reading ingredient lists off label photos (direction G); same key. Without one, 503.
    label_model: str = "claude-opus-5-5"
    # User sign-in (plan/h-accounts.md). Links point to the app at this address; the session
    # cookie is Secure when it is https.
    app_url: str = "http://localhost:5173"
    # "dev": no email is sent; the link is logged and returned to the page. "smtp": sent through
    # the SMTP server below (for trying with one's own mailbox until an email service based in
    # Vietnam is chosen, direction A). Anything else refuses to send.
    login_email_mode: str = "dev"
    # SMTP (login_email_mode = "smtp"). Without a host or a sender, email counts as not set up.
    # The password is never logged.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None  # e.g. "SkinWise <noreply@example.com>"
    smtp_security: Literal["starttls", "ssl", "none"] = "starttls"


@lru_cache
def get_settings() -> Settings:
    return Settings()
