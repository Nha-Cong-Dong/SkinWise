"""Route for reading an ingredient list off a label photo (direction G). Each photo is a billed
AI call, so only signed-in users may send one."""

from fastapi import APIRouter, HTTPException, status

from app import label_reader
from app.accounts_api import CurrentUser
from app.schemas import LabelImage, LabelReadingOut

router = APIRouter()


@router.post("/label/read")
def read_label(user: CurrentUser, body: LabelImage) -> LabelReadingOut:
    """Copy the ingredient list off a label photo with an AI model. The text is for the user
    to check and correct; nothing is analysed here and the photo is not kept. At most 10
    photos per user and hour, and 100 per day for the whole server (429)."""
    if not label_reader.allow_label_read(user.id):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too many photos; wait")
    try:
        reading = label_reader.read_label(body.media_type, body.data)
    except label_reader.LabelReadingError as e:
        raise HTTPException(e.status, str(e)) from e
    return LabelReadingOut(
        found=reading.found, text=reading.text, unreadable_count=reading.unreadable_count
    )
