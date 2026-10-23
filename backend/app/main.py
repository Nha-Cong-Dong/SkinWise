from typing import Annotated

from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api import router
from app.db import get_session


def create_app() -> FastAPI:
    app = FastAPI(title="SkinWise API")

    @app.get("/health")
    def health(session: Annotated[Session, Depends(get_session)]) -> dict[str, str]:
        session.execute(text("SELECT 1"))
        return {"status": "ok", "db": "ok"}

    app.include_router(router)
    return app


app = create_app()
