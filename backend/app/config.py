from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/skinwise"
    # AI myth card drafts on the review page. Without a key the SDK falls back to
    # ANTHROPIC_API_KEY in the environment; with neither, drafting answers 503.
    anthropic_api_key: str | None = None
    draft_model: str = "claude-opus-5-5"
    # Reading ingredient lists off label photos (direction G); same key. Without one, 503.
    label_model: str = "claude-opus-5-5"


@lru_cache
def get_settings() -> Settings:
    return Settings()
