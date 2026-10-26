from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/skinwise"
    # AI myth card drafts on the review page. Without a key the SDK falls back to
    # ANTHROPIC_API_KEY in the environment; with neither, drafting answers 503.
    anthropic_api_key: str | None = None
    draft_model: str = "claude-opus-5-5"
    # User sign-in (plan/h-accounts.md). Links point to the app at this address; the session
    # cookie is Secure when it is https.
    app_url: str = "http://localhost:5173"
    # "dev": no email is sent; the link is logged and returned to the page. The only mode until
    # an email service based in Vietnam is chosen (direction A); anything else refuses to send.
    login_email_mode: str = "dev"


@lru_cache
def get_settings() -> Settings:
    return Settings()
