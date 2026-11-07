"""Routes of the community reviews (blog), under /blog, and the user's profile (/me/profile).

Every route needs the user's session (the web app is behind sign-in, and nothing users write
is served to anyone signed out). Responses name authors by handle only, never by email.
A demo with made-up data, not open to the public (plan/decisions.md, 28/10). No route here
reads or writes the rules or calls the warning engine.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Body, HTTPException, Query, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from sqlalchemy.exc import IntegrityError

from app import blog, images
from app.accounts_api import CurrentUser
from app.api import DbSession
from app.inci import normalize_name
from app.schemas import (
    ActivityOut,
    ActivityReadIn,
    ActivityReadOut,
    AuthorOut,
    CommentIn,
    CommentOut,
    ImageOut,
    LikeOut,
    PostDetail,
    PostIn,
    PostList,
    ProfileIn,
    ProfileOut,
    ReportIn,
    SaveOut,
    SkinType,
    TrendingItem,
)

PROFILE_REQUIRED = "profile_required"
MAX_CAPTION = 200
SEARCH_MIN, SEARCH_MAX = 2, 100
GROUP_PATTERN = r"^[A-Z0-9_]+$"

router = APIRouter(tags=["blog"])


# --- Profile ---


@router.get("/me/profile")
def my_profile(db: DbSession, user: CurrentUser) -> ProfileOut:
    profile = blog.get_profile(db, user.id)
    if profile is None:
        return ProfileOut(handle=None, skin_type=None)
    return ProfileOut(handle=profile.handle, skin_type=profile.skin_type)


@router.put("/me/profile")
def save_profile(db: DbSession, user: CurrentUser, body: ProfileIn) -> ProfileOut:
    """Set the handle shown on posts and comments, and the skin type. 409 when another user
    has the handle."""
    if blog.handle_taken(db, body.handle, user.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "handle taken")
    try:
        blog.put_profile(db, user.id, body.handle, body.skin_type)
        db.commit()
    except IntegrityError as e:  # taken between the check and the write
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "handle taken") from e
    return ProfileOut(handle=body.handle, skin_type=body.skin_type)


def _require_profile(db: DbSession, user_id: str) -> None:
    if blog.get_profile(db, user_id) is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, PROFILE_REQUIRED)


# --- Posts ---


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "not found")


def _detail(db: DbSession, post_id: int, viewer: str) -> PostDetail:
    post = blog.get_post(db, post_id, viewer)
    if post is None:
        raise _not_found()
    return PostDetail.model_validate(post)


def _post_data(body: PostIn) -> blog.PostData:
    return blog.PostData(
        title=body.title,
        body=body.body,
        rating=body.rating,
        skin_type=body.skin_type,
        disclosure=body.disclosure,
        products=[p.model_dump(exclude_none=True) for p in body.products],
        image_ids=body.image_ids,
        routine=body.routine.model_dump(by_alias=True) if body.routine else None,
    )


def _write(action) -> list[str]:  # noqa: ANN001
    """Run a post write, turning a bad product or image into the contract's errors."""
    try:
        return action()
    except blog.UnknownProduct as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "unknown product_id") from e
    except blog.InvalidImages as e:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "image_ids must be your own uploads, not attached to another post",
        ) from e


@router.get("/blog/posts")
def posts(
    db: DbSession,
    user: CurrentUser,
    skin_type: SkinType | None = None,
    product_id: int | None = None,
    author: Annotated[str | None, Query(max_length=30)] = None,
    saved: bool = False,
    liked: bool = False,
    q: Annotated[str | None, Query(max_length=500)] = None,
    group: Annotated[str | None, Query(max_length=40, pattern=GROUP_PATTERN)] = None,
    sort: Literal["new", "top"] = "new",
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> PostList:
    """Visible posts only, newest first or most liked first. liked / saved: the user's own
    likes / saves. q (2-100 characters once normalized): title, body and product names, with or
    without diacritics, best matches first (sort is ignored). group: posts with a catalogue
    product in that active group (pasted lists are not counted)."""
    search = None
    if q is not None:
        # The length that counts is that of what is searched: normalize_name drops edge
        # punctuation ("a." is one character).
        search = q.strip()
        if not SEARCH_MIN <= len(normalize_name(search)) <= SEARCH_MAX:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                f"q must be {SEARCH_MIN} to {SEARCH_MAX} characters",
            )
    query = blog.PostQuery(
        skin_type=skin_type,
        product_id=product_id,
        author=author,
        saved=saved,
        liked=liked,
        search=search,
        group=group,
        sort=sort,
        offset=offset,
        limit=limit,
    )
    return PostList.model_validate(blog.list_posts(db, user.id, query))


@router.get("/blog/trending")
def trending(
    db: DbSession, user: CurrentUser, days: Annotated[int, Query(ge=1, le=90)] = 7
) -> list[TrendingItem]:
    """Up to 6 catalogue products or active groups that at least 2 visible posts of the last
    `days` days are about, most posts first. Display only: a way to filter the list."""
    return [TrendingItem.model_validate(t) for t in blog.trending(db, days)]


def _limit(kind: str, user_id: str) -> None:
    if not blog.allow(kind, user_id):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, f"too many {kind}s; wait")


@router.post("/blog/posts", status_code=status.HTTP_201_CREATED)
def create_post(db: DbSession, user: CurrentUser, body: PostIn) -> PostDetail:
    """A post with auto flags (app/moderation.py) waits for a reviewer: only its author sees
    it, with the reasons in `flags`. 10 new posts per hour and user."""
    _require_profile(db, user.id)
    data = _post_data(body)
    _limit("post", user.id)
    post_id = _write(lambda: blog.create_post(db, user.id, data))
    db.commit()
    return _detail(db, post_id, user.id)


@router.get("/blog/posts/{post_id}")
def get_post(db: DbSession, user: CurrentUser, post_id: int) -> PostDetail:
    return _detail(db, post_id, user.id)


def _own_post(db: DbSession, post_id: int, user_id: str):  # noqa: ANN202
    """The post's state if the user may change it: 404 if they cannot see it, 403 if it is
    someone else's."""
    state = blog.post_state(db, post_id)
    if not blog.can_see_post(state, user_id):
        raise _not_found()
    if state.author_id != user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not your post")
    return state


@router.put("/blog/posts/{post_id}")
def update_post(db: DbSession, user: CurrentUser, post_id: int, body: PostIn) -> PostDetail:
    """Images left out are deleted with their files. A flagged edit waits for a reviewer
    again, even if the post was visible."""
    state = _own_post(db, post_id, user.id)
    data = _post_data(body)
    removed = _write(lambda: blog.update_post(db, post_id, user.id, state.status, data))
    db.commit()
    images.delete_files(removed)
    return _detail(db, post_id, user.id)


@router.delete("/blog/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(db: DbSession, user: CurrentUser, post_id: int) -> Response:
    """The author may delete their post in any state, even one a reviewer removed (the right
    to delete one's data wins); its images go with their files."""
    state = blog.post_state(db, post_id)
    if state is None or state.author_id != user.id:
        _own_post(db, post_id, user.id)  # 404 if they cannot see it, else 403
    files = blog.delete_post(db, post_id)
    db.commit()
    images.delete_files(files)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _seen_post(db: DbSession, post_id: int, user_id: str) -> None:
    if not blog.can_see_post(blog.post_state(db, post_id), user_id):
        raise _not_found()


@router.put("/blog/posts/{post_id}/like")
def like(db: DbSession, user: CurrentUser, post_id: int) -> LikeOut:
    _seen_post(db, post_id, user.id)
    count = blog.set_like(db, post_id, user.id, True)
    db.commit()
    return LikeOut(liked=True, like_count=count)


@router.delete("/blog/posts/{post_id}/like")
def unlike(db: DbSession, user: CurrentUser, post_id: int) -> LikeOut:
    _seen_post(db, post_id, user.id)
    count = blog.set_like(db, post_id, user.id, False)
    db.commit()
    return LikeOut(liked=False, like_count=count)


@router.put("/blog/posts/{post_id}/save")
def save(db: DbSession, user: CurrentUser, post_id: int) -> SaveOut:
    _seen_post(db, post_id, user.id)
    blog.set_save(db, post_id, user.id, True)
    db.commit()
    return SaveOut(saved=True)


@router.delete("/blog/posts/{post_id}/save")
def unsave(db: DbSession, user: CurrentUser, post_id: int) -> SaveOut:
    _seen_post(db, post_id, user.id)
    blog.set_save(db, post_id, user.id, False)
    db.commit()
    return SaveOut(saved=False)


# --- Comments ---


@router.get("/blog/posts/{post_id}/comments")
def comments(db: DbSession, user: CurrentUser, post_id: int) -> list[CommentOut]:
    """Top-level comments oldest first, each with its replies (one level, oldest first):
    visible ones and the user's own waiting ones. A top-level comment that was deleted, or
    that the user may not see, stays as an empty frame (deleted, no author, no text) while it
    has replies the user sees."""
    _seen_post(db, post_id, user.id)
    return [CommentOut.model_validate(c) for c in blog.list_comments(db, post_id, user.id)]


@router.post("/blog/posts/{post_id}/comments", status_code=status.HTTP_201_CREATED)
def add_comment(db: DbSession, user: CurrentUser, post_id: int, body: CommentIn) -> CommentOut:
    """parent_id: reply to that comment; it must be on this post and seen by the user (404
    otherwise). A reply to a reply is attached to the same top-level comment."""
    _seen_post(db, post_id, user.id)  # a post the user cannot see is 404, profile or not
    if body.parent_id is not None and not blog.can_answer(db, post_id, body.parent_id, user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "parent comment not found")
    _require_profile(db, user.id)
    _limit("comment", user.id)  # 30 per hour and user
    comment_id = blog.add_comment(db, post_id, user.id, body.body, body.parent_id)
    db.commit()
    comment = blog.get_comment(db, comment_id, user.id)
    assert comment is not None
    return CommentOut.model_validate(comment)


@router.delete("/blog/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(db: DbSession, user: CurrentUser, comment_id: int) -> Response:
    """The author may delete their comment in any state, even one a reviewer removed or one
    on a post they can no longer see."""
    state = blog.comment_state(db, comment_id)
    if state is None or state.author_id != user.id:
        if not blog.can_see_comment(db, state, user.id):
            raise _not_found()
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not your comment")
    blog.delete_comment(db, comment_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _seen_comment(db: DbSession, comment_id: int, user_id: str) -> None:
    if not blog.can_see_comment(db, blog.comment_state(db, comment_id), user_id):
        raise _not_found()


@router.put("/blog/comments/{comment_id}/like")
def like_comment(db: DbSession, user: CurrentUser, comment_id: int) -> LikeOut:
    """120 per hour and user."""
    _seen_comment(db, comment_id, user.id)
    _limit("comment_like", user.id)
    count = blog.set_comment_like(db, comment_id, user.id, True)
    db.commit()
    return LikeOut(liked=True, like_count=count)


@router.delete("/blog/comments/{comment_id}/like")
def unlike_comment(db: DbSession, user: CurrentUser, comment_id: int) -> LikeOut:
    _seen_comment(db, comment_id, user.id)
    count = blog.set_comment_like(db, comment_id, user.id, False)
    db.commit()
    return LikeOut(liked=False, like_count=count)


# --- Activity (notifications in the app; never by email) ---


@router.get("/me/activity")
def my_activity(
    db: DbSession, user: CurrentUser, limit: Annotated[int, Query(ge=1, le=100)] = 30
) -> ActivityOut:
    """The latest notifications, newest first. Only those whose post (and comment) is visible
    now, apart from notices about the status of the user's own posts."""
    return ActivityOut.model_validate(blog.activity(db, user.id, limit))


@router.post("/me/activity/read")
def read_activity(
    db: DbSession, user: CurrentUser, body: Annotated[ActivityReadIn | None, Body()] = None
) -> ActivityReadOut:
    """Mark the listed notifications read, or all of them when ids (or the body) is left out."""
    blog.mark_read(db, user.id, body.ids if body else None)
    db.commit()
    return ActivityReadOut(unread_count=blog.unread_count(db, user.id))


# --- Reports ---


@router.post("/blog/reports", status_code=status.HTTP_202_ACCEPTED)
def report(db: DbSession, user: CurrentUser, body: ReportIn) -> dict:
    """One report per person and target; reporting again changes nothing. Once 3 different
    people reported a visible post or comment, it is hidden until a reviewer decides."""
    if body.target_kind == "post":
        state = blog.post_state(db, body.target_id)
        seen = blog.can_see_post(state, user.id)
    else:
        state = blog.comment_state(db, body.target_id)
        seen = blog.can_see_comment(db, state, user.id)
    if not seen:
        raise _not_found()
    if state.author_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "you cannot report your own writing")
    _limit("report", user.id)  # 20 per hour and user
    blog.add_report(db, body.target_kind, body.target_id, user.id, body.reason, body.note or None)
    db.commit()
    return {}


# --- Authors ---


@router.get("/blog/authors/{handle}")
def author(db: DbSession, user: CurrentUser, handle: str) -> AuthorOut:
    page = blog.author_page(db, handle, user.id)
    if page is None:
        raise _not_found()
    return AuthorOut.model_validate(page)


# --- Photos ---


async def read_limited(request: Request, limit: int) -> bytes:
    """The request body, refusing (413) as soon as it grows past `limit` bytes."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "image larger than 5 MB")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > limit:
            raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "image larger than 5 MB")
    return bytes(body)


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
                        "caption": {"type": "string", "maxLength": MAX_CAPTION},
                    },
                }
            }
        },
    }
}


@router.post("/blog/images", status_code=status.HTTP_201_CREATED, openapi_extra=_UPLOAD_DOC)
async def upload_image(request: Request, db: DbSession, user: CurrentUser) -> ImageOut:
    """A JPEG, PNG or WebP photo of at most 5 MB, stored as WebP without any metadata (the
    GPS position a phone may write is gone). Attach it to a post within 24 hours, or it is
    removed. 30 uploads per hour and user."""
    if not blog.allow_image_upload(user.id):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too many uploads; wait")
    raw = await read_limited(request, images.MAX_BYTES + images.MULTIPART_OVERHEAD)
    content_type = request.headers.get("content-type", "")
    # Decoding and the database are blocking: off the event loop.
    return await run_in_threadpool(_store_upload, db, user.id, content_type, raw)


def _store_upload(db: DbSession, user_id: str, content_type: str, raw: bytes) -> ImageOut:
    try:
        fields = images.parse_multipart(content_type, raw)
    except images.BadForm as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from e
    if "file" not in fields:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "no file")
    try:
        caption = fields.get("caption", b"").decode("utf-8").strip() or None
    except UnicodeDecodeError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "caption is not UTF-8") from e
    if caption is not None and len(caption) > MAX_CAPTION:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "caption too long")
    try:
        processed = images.process(fields["file"])
    except images.TooLarge as e:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "image larger than 5 MB") from e
    except images.TooManyPixels as e:
        # 415 like any image this server will not decode; the detail tells the cases apart.
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "image too large in pixels"
        ) from e
    except images.NotAnImage as e:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "not a JPEG, PNG or WebP image"
        ) from e
    stale = blog.drop_stale_uploads(db)
    file_name = images.save(processed)
    try:
        image_id = blog.add_image(
            db, user_id, file_name, processed.width, processed.height, caption
        )
        db.commit()
    except Exception:
        db.rollback()
        images.delete_files([file_name])
        raise
    images.delete_files(stale)
    return ImageOut(
        id=image_id,
        url=blog.image_url(image_id),
        width=processed.width,
        height=processed.height,
        caption=caption,
    )


@router.get(
    "/blog/images/{image_id}",
    response_class=FileResponse,
    responses={200: {"content": {"image/webp": {}}}},
)
def image(db: DbSession, user: CurrentUser, image_id: int) -> FileResponse:
    """The photo, if the user may see the post it is on (or it is their own upload)."""
    row = blog.image_for(db, image_id, user.id)
    path = images.path_of(row.file_name) if row else None
    if path is None:
        raise _not_found()
    return FileResponse(
        path, media_type="image/webp", headers={"Cache-Control": "private, max-age=3600"}
    )
