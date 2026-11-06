import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import Engine, create_engine, text
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


# --- Community reviews (blog): signed-in users without going through email ---


@pytest.fixture
def upload_dir(tmp_path, monkeypatch):
    from app.config import get_settings

    path = tmp_path / "uploads"
    monkeypatch.setattr(get_settings(), "upload_dir", str(path))
    return path


@pytest.fixture
def make_user(engine: Engine, upload_dir) -> Iterator:
    """make_user(handle=None) -> a TestClient signed in as a new verified user, with a profile
    when a handle is given. Users are deleted afterwards."""
    import uuid

    from app.accounts import create_session
    from app.blog import put_profile, reset_image_limit

    reset_image_limit()
    clients: list[TestClient] = []
    emails: list[str] = []

    def session_override() -> Iterator[Session]:
        with sessionmaker(bind=engine)() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = session_override

    def make(handle: str | None = None, skin_type: str | None = None) -> TestClient:
        email = f"blog-{uuid.uuid4().hex[:10]}@example.com"
        with engine.begin() as conn:
            user_id = conn.execute(
                text(
                    "INSERT INTO users (email, email_verified_at) VALUES (:e, now()) "
                    "RETURNING id::text"
                ),
                {"e": email},
            ).scalar_one()
            session_id = create_session(conn, user_id)
            if handle:
                put_profile(conn, user_id, handle, skin_type)
        client = TestClient(app)
        client.cookies.set("skinwise_session", session_id)
        client.email = email  # type: ignore[attr-defined]
        client.user_id = user_id  # type: ignore[attr-defined]
        clients.append(client)
        emails.append(email)
        return client

    yield make
    for c in clients:
        c.close()
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM users WHERE email = ANY(:e)"), {"e": emails})
        conn.execute(
            text(
                "DELETE FROM blog_reports r WHERE (r.target_kind = 'post' AND NOT EXISTS "
                "(SELECT 1 FROM blog_posts p WHERE p.id = r.target_id)) OR "
                "(r.target_kind = 'comment' AND NOT EXISTS "
                "(SELECT 1 FROM blog_comments c WHERE c.id = r.target_id))"
            )
        )
    reset_image_limit()
