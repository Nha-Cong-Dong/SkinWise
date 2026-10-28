"""Route for reading an ingredient list off a label photo (direction G). Each photo is a billed
AI call, so only signed-in users may send one, a limited number of times."""

import threading

from fastapi import APIRouter, HTTPException, Request, status

from app import label_reader
from app.accounts import RateLimit
from app.accounts_api import CurrentUser
from app.schemas import LabelImage, LabelReadingOut

router = APIRouter()

# Photos per account and per IP in 10 minutes (in memory, per process, like the sign-in limits).
_photos = RateLimit({"email": (10, 600.0), "ip": (30, 600.0)})
# AI calls running at once in this process; one more is refused rather than queued.
MAX_CONCURRENT_READS = 4
_reading = threading.BoundedSemaphore(MAX_CONCURRENT_READS)
TOO_MANY_PHOTOS = "too many photos; wait a few minutes"
# Held only while checking the limits and counting a photo, never during a read.
_admitting = threading.Lock()


def reset_photo_limits() -> None:
    _photos.clear()


@router.post("/label/read")
def read_label(user: CurrentUser, body: LabelImage, request: Request) -> LabelReadingOut:
    """Copy the ingredient list off a label photo with an AI model. The text is for the user
    to check and correct; nothing is analysed here and the photo is not kept."""
    ip = request.client.host if request.client else None
    # Sync routes run in a thread pool: checking the limit and counting the photo must be one
    # step, or photos sent at the same time all pass the check before any is counted.
    with _admitting:
        if _photos.blocked(user.email, ip):
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, TOO_MANY_PHOTOS)
        if not _reading.acquire(blocking=False):
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, label_reader.AI_BUSY)
        _photos.record(user.email, ip)
    try:
        reading = label_reader.read_label(body.media_type, body.data)
    except label_reader.LabelReadingError as e:
        raise HTTPException(e.status, str(e)) from e
    finally:
        _reading.release()
    return LabelReadingOut(
        found=reading.found, text=reading.text, unreadable_count=reading.unreadable_count
    )
