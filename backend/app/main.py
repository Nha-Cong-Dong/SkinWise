import asyncio
import contextlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import DataError
from sqlalchemy.orm import Session

from app.accounts import SWEEP_INTERVAL, sweep_rate_limits
from app.accounts_api import router as accounts_router
from app.api import router
from app.blog_api import router as blog_router
from app.db import get_session
from app.label_api import router as label_router
from app.product_photos_api import router as product_photos_router
from app.review_api import router as review_router


async def _sweep_forever() -> None:
    """Forget expired rate-limit keys (IPs, hashed emails) even when no request comes in."""
    while True:
        await asyncio.sleep(SWEEP_INTERVAL)
        sweep_rate_limits()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    task = asyncio.create_task(_sweep_forever())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


def create_app() -> FastAPI:
    app = FastAPI(title="SkinWise API", lifespan=lifespan)

    @app.exception_handler(DataError)
    async def nul_in_text(request: Request, exc: DataError) -> JSONResponse:
        """PostgreSQL refuses a NUL character in text. Whatever field it came in through (query,
        path or body), that is a bad request, not a server error. Other data errors stay 500."""
        if "NUL (0x00)" not in str(exc.orig):
            raise exc
        return JSONResponse(
            {"detail": "text must not contain NUL characters"},
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )

    @app.get("/health")
    def health(session: Annotated[Session, Depends(get_session)]) -> dict[str, str]:
        session.execute(text("SELECT 1"))
        return {"status": "ok", "db": "ok"}

    app.include_router(router)
    app.include_router(review_router)
    app.include_router(accounts_router)
    app.include_router(label_router)
    app.include_router(blog_router)
    app.include_router(product_photos_router)
    return app


app = create_app()
