import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.db import get_session, init_schema
from app.main import create_app
from app.seed import seed


class TestSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    test_database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/skinwise_test"


# What every test assumes, whatever the developer's .env says: dev email mode (no email ever
# leaves a test), links to the local frontend, no SMTP server, and the default AI models.
# Tests that need another value (tests/test_mailer.py turns smtp on) set it themselves.
TEST_DEFAULTS = {
    "login_email_mode": "dev",
    "app_url": "http://localhost:5173",
    "smtp_host": None,
    "smtp_port": 587,
    "smtp_username": None,
    "smtp_password": None,
    "smtp_from": None,
    "smtp_security": "starttls",
    "draft_model": "claude-opus-5-5",
    "label_model": "claude-opus-5-5",
}


@pytest.fixture(autouse=True)
def test_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    for name, value in TEST_DEFAULTS.items():
        monkeypatch.setattr(settings, name, value)


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    url = os.environ.get("TEST_DATABASE_URL") or TestSettings().test_database_url
    engine = create_engine(url)
    init_schema(engine)
    seed(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def client(engine: Engine) -> Iterator[TestClient]:
    def session_override() -> Iterator[Session]:
        with sessionmaker(bind=engine)() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = session_override
    with TestClient(app) as client:
        yield client
