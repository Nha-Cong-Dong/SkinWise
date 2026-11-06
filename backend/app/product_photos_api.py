"""Routes for users' own product photos, under /me/product-photos (app/product_photos.py).

Every route needs the user's session; a photo is served to its owner only (404 for anyone
else, so ids reveal nothing).
"""

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse

from app import images, product_photos
from app.accounts_api import CurrentUser
from app.api import DbSession
from app.blog_api import read_limited
from app.schemas import ProductPhotoOut

router = APIRouter(tags=["product photos"])

_UPLOAD_DOC = {
    "requestBody": {
        "required": True,
        "content": {
            "multipart/form-data": {
                "schema": {
                    "type": "object",
                    "required": ["file"],
                    "properties": {
                        "file": {"type": "string", "format": "binary"},
                        "replaces": {
                            "type": "integer",
                            "description": "id of the user's photo this one replaces; "
                            "deleted with its file once the new one is stored",
                        },
                    },
                }
            }
        },
    }
}


@router.post("/me/product-photos", status_code=status.HTTP_201_CREATED, openapi_extra=_UPLOAD_DOC)
async def upload(request: Request, db: DbSession, user: CurrentUser) -> ProductPhotoOut:
    """A JPEG, PNG or WebP photo of at most 5 MB of a product the user typed or pasted in,
    stored as WebP without any metadata. 30 uploads per hour, 60 photos per account (409)."""
    if not product_photos.allow_upload(user.id):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too many uploads; wait")
    raw = await read_limited(request, images.MAX_BYTES + images.MULTIPART_OVERHEAD)
    content_type = request.headers.get("content-type", "")
    return await run_in_threadpool(_store, db, user.id, content_type, raw)


def _replaced(fields: dict[str, bytes]) -> int | None:
    value = fields.get("replaces", b"").decode("latin-1").strip()
    if not value:
        return None
    if not value.isdigit():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "replaces must be a photo id")
    return int(value)


def _store(db: DbSession, user_id: str, content_type: str, raw: bytes) -> ProductPhotoOut:
    try:
        fields = images.parse_multipart(content_type, raw)
    except images.BadForm as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from e
    if "file" not in fields:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "no file")
    replaces = _replaced(fields)
    # Until the commit below (or the rollback when this request fails), so concurrent uploads
    # of the same user are counted one after the other.
    product_photos.lock_owner(db, user_id)
    if replaces is not None and product_photos.file_of(db, replaces, user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "photo to replace not found")
    kept = product_photos.count_of(db, user_id) - (1 if replaces is not None else 0)
    if kept >= product_photos.MAX_PER_ACCOUNT:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"at most {product_photos.MAX_PER_ACCOUNT} product photos per account",
        )
    try:
        processed = images.process(fields["file"])
    except images.TooLarge as e:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "image larger than 5 MB") from e
    except images.TooManyPixels as e:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "image too large in pixels"
        ) from e
    except images.NotAnImage as e:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "not a JPEG, PNG or WebP image"
        ) from e
    file_name = images.save(processed)
    try:
        photo_id = product_photos.add_photo(
            db, user_id, file_name, processed.width, processed.height
        )
        old = product_photos.delete_photo(db, replaces, user_id) if replaces else None
        db.commit()
    except Exception:
        db.rollback()
        images.delete_files([file_name])
        raise
    if old:
        images.delete_files([old])
    return ProductPhotoOut(id=photo_id, url=product_photos.photo_url(photo_id))


@router.get(
    "/me/product-photos/{photo_id}",
    response_class=FileResponse,
    responses={200: {"content": {"image/webp": {}}}},
)
def photo(db: DbSession, user: CurrentUser, photo_id: int) -> FileResponse:
    file_name = product_photos.file_of(db, photo_id, user.id)
    path = images.path_of(file_name) if file_name else None
    if path is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
    return FileResponse(
        path, media_type="image/webp", headers={"Cache-Control": "private, max-age=3600"}
    )


@router.delete("/me/product-photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(db: DbSession, user: CurrentUser, photo_id: int) -> Response:
    file_name = product_photos.delete_photo(db, photo_id, user.id)
    if file_name is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
    db.commit()
    images.delete_files([file_name])
    return Response(status_code=status.HTTP_204_NO_CONTENT)
