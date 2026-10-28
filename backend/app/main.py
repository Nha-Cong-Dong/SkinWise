from typing import Annotated

from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.accounts_api import router as accounts_router
from app.api import router
from app.db import get_session
from app.label_api import router as label_router
from app.review_api import router as review_router


def create_app() -> FastAPI:
    app = FastAPI(title="SkinWise API")

    @app.get("/health")
    def health(session: Annotated[Session, Depends(get_session)]) -> dict[str, str]:
        session.execute(text("SELECT 1"))
        return {"status": "ok", "db": "ok"}

    app.include_router(router)
    app.include_router(review_router)
    app.include_router(accounts_router)
    app.include_router(label_router)
    return app


app = create_app()
