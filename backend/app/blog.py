"""Community reviews (blog): profiles, posts, comments (one level of replies), likes of posts
and comments, saves, reports, photos, search, "trending" and in-app notifications.

A demo with made-up data only, not open to the public (plan/decisions.md, 28/10). Nothing
here reads or writes the rules, calls the warning engine or resolve(): the sourced part of a
post page is built by the frontend from /products, /inci/analyze and /routine/check alone.
The email of an author never leaves this module: authors are shown by their handle.

Visibility: a post or comment is seen by everyone when `visible`; its author also sees it when
`pending` (auto flags, app/moderation.py) or `hidden` (reported); nobody sees `removed`.
Lists, author pages and counts include `visible` only. Notifications are shown only while
what they point to is visible (status notices to a post's author excepted), never by email.
The `group` filter and "trending" read the groups the seed stored for catalogue products; a
pasted ingredient list is never resolved here.
"""

import json
from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.accounts import RateLimit
from app.inci import normalize_name
from app.moderation import auto_flags, status_after_edit, status_after_reports

Db = Session | Connection
Kind = Literal["post", "comment"]

EXCERPT_LENGTH = 200
# Notifications quote at most this much of a comment, and only of a visible one.
NOTICE_EXCERPT_LENGTH = 80
# Read notifications are removed after this many days (scripts.purge).
READ_NOTICE_DAYS = 90
# Search (GET /blog/posts?q=): pg_trgm word_similarity of the query with the post's own text
# (title, body, pasted product names) and with catalogue product names, both normalized by
# normalize_name. A whole post body is long, so its threshold is stricter than the one for
# product names (the same 0.3 as app/products.py product search).
POST_TEXT_SIMILARITY = 0.6
PRODUCT_NAME_SIMILARITY = 0.3
UNATTACHED_IMAGE_HOURS = 24
# Writes per user and hour, against spam. In memory, per process, like the account limits;
# the key is the sha256 of the user id.
LIMITS: dict[str, tuple[int, float]] = {
    "image": (30, 3600.0),
    "post": (10, 3600.0),
    "comment": (30, 3600.0),
    "report": (20, 3600.0),
    "comment_like": (120, 3600.0),
}
_limits = {kind: RateLimit({"email": limit}) for kind, limit in LIMITS.items()}


def allow(kind: str, user_id: str) -> bool:
    """Count one write of this kind; False once the user reached the hourly limit."""
    limit = _limits[kind]
    if limit.blocked(user_id, None):
        return False
    limit.record(user_id, None)
    return True


def allow_image_upload(user_id: str) -> bool:
    return allow("image", user_id)


def reset_image_limit() -> None:
    """Clear every blog write limit (images, posts, comments, reports)."""
    for limit in _limits.values():
        limit.clear()


# --- Profiles ---


def get_profile(db: Db, user_id: str) -> Any:
    return db.execute(
        text("SELECT handle, skin_type FROM user_profiles WHERE user_id = :u"), {"u": user_id}
    ).first()


def handle_taken(db: Db, handle: str, user_id: str) -> bool:
    return (
        db.execute(
            text("SELECT 1 FROM user_profiles WHERE handle = :h AND user_id <> :u"),
            {"h": handle, "u": user_id},
        ).first()
        is not None
    )


def put_profile(db: Db, user_id: str, handle: str, skin_type: str | None) -> None:
    db.execute(
        text(
            """
            INSERT INTO user_profiles (user_id, handle, skin_type) VALUES (:u, :h, :s)
            ON CONFLICT (user_id) DO UPDATE
              SET handle = excluded.handle, skin_type = excluded.skin_type, updated_at = now()
            """
        ),
        {"u": user_id, "h": handle, "s": skin_type},
    )


# --- Reading posts ---

# Whether :viewer may see post p (or comment c): visible, or their own and not removed.
_POST_SEEN = "(p.status = 'visible' OR (p.author_id = :viewer AND p.status <> 'removed'))"
_COMMENT_SEEN = "(c.status = 'visible' OR (c.author_id = :viewer AND c.status <> 'removed'))"

_SUMMARY_COLUMNS = f"""
    p.id, p.title, left(p.body, {EXCERPT_LENGTH}) AS excerpt, p.rating, p.skin_type,
    p.disclosure, p.routine IS NOT NULL AS has_routine, p.status, p.flags, p.created_at,
    p.updated_at, p.author_id = :viewer AS is_mine, pr.handle, pr.skin_type AS author_skin_type,
    (SELECT count(*) FROM blog_likes l WHERE l.post_id = p.id) AS like_count,
    (SELECT count(*) FROM blog_comments c
      WHERE c.post_id = p.id AND c.status = 'visible' AND c.deleted_at IS NULL) AS comment_count
"""
_FROM_POSTS = "FROM blog_posts p JOIN user_profiles pr ON pr.user_id = p.author_id"


def image_url(image_id: int) -> str:
    return f"/blog/images/{image_id}"


def _image(row: Any) -> dict[str, Any]:
    return {
        "id": row.id,
        "url": image_url(row.id),
        "width": row.width,
        "height": row.height,
        "caption": row.caption,
    }


def _products_of(db: Db, post_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
    rows = db.execute(
        text(
            """
            SELECT bp.post_id, bp.position, bp.product_id, coalesce(pd.name, bp.name) AS name,
                   pd.brand, bp.inci
            FROM blog_post_products bp LEFT JOIN products pd ON pd.id = bp.product_id
            WHERE bp.post_id = ANY(:ids) ORDER BY bp.post_id, bp.position
            """
        ),
        {"ids": post_ids},
    )
    out: dict[int, list[dict[str, Any]]] = {i: [] for i in post_ids}
    for r in rows:
        out[r.post_id].append(
            {
                "position": r.position,
                "product_id": r.product_id,
                "name": r.name,
                "brand": r.brand,
                "inci": r.inci,
            }
        )
    return out


def _images_of(db: Db, post_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
    rows = db.execute(
        text(
            "SELECT id, post_id, width, height, caption FROM blog_images "
            "WHERE post_id = ANY(:ids) ORDER BY post_id, position, id"
        ),
        {"ids": post_ids},
    )
    out: dict[int, list[dict[str, Any]]] = {i: [] for i in post_ids}
    for r in rows:
        out[r.post_id].append(_image(r))
    return out


def _summaries(db: Db, rows: list[Any]) -> list[dict[str, Any]]:
    ids = [r.id for r in rows]
    products = _products_of(db, ids)
    images = _images_of(db, ids)
    return [
        {
            "cover": images[r.id][0] if images[r.id] else None,
            "id": r.id,
            "title": r.title,
            "excerpt": r.excerpt,
            "rating": r.rating,
            "skin_type": r.skin_type,
            "disclosure": r.disclosure,
            "author": {"handle": r.handle, "skin_type": r.author_skin_type},
            "products": products[r.id],
            "like_count": r.like_count,
            "comment_count": r.comment_count,
            "has_routine": r.has_routine,
            "status": r.status,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@dataclass(frozen=True)
class PostQuery:
    skin_type: str | None = None
    product_id: int | None = None
    author: str | None = None  # handle
    saved: bool = False
    liked: bool = False
    # Search text (already trimmed, 2-100 characters); when set, the best matches come first
    # and `sort` is ignored.
    search: str | None = None
    # An active group code: posts with at least one catalogue product in that group (the
    # groups seeded for the product). Pasted lists are not resolved for this filter.
    group: str | None = None
    sort: Literal["new", "top"] = "new"
    offset: int = 0
    limit: int = 20


def _like_pattern(q: str) -> str:
    return q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# Catalogue products of post p whose normalized name matches the query.
_PRODUCT_NAME_MATCHES = """
    SELECT 1 FROM blog_post_products bp JOIN products pd ON pd.id = bp.product_id
    WHERE bp.post_id = p.id
      AND (word_similarity(:q, pd.search_name) >= :product_threshold
           OR pd.search_name LIKE '%' || :pattern || '%' ESCAPE '\\')
"""
_SEARCH_MATCHES = f"""
    (word_similarity(:q, p.search_text) >= :text_threshold
     OR p.search_text LIKE '%' || :pattern || '%' ESCAPE '\\'
     OR EXISTS ({_PRODUCT_NAME_MATCHES}))
"""
# How well the post matches: the best of its own text and its catalogue product names.
_SEARCH_SCORE = """
    greatest(
      coalesce(word_similarity(:q, p.search_text), 0),
      coalesce((SELECT max(word_similarity(:q, pd.search_name))
                FROM blog_post_products bp JOIN products pd ON pd.id = bp.product_id
                WHERE bp.post_id = p.id), 0))
"""


def search_text_of(title: str, body: str, pasted_names: list[str]) -> str:
    """What GET /blog/posts?q= searches in the post itself, normalized like product names.
    Catalogue product names are matched through products.search_name instead."""
    return normalize_name("\n".join([title, body, *pasted_names]))


def backfill_search_text(db: Db) -> None:
    """Fill blog_posts.search_text on databases from before the column existed (in Python, so
    the value is exactly normalize_name's)."""
    rows = db.execute(
        text("SELECT id, title, body FROM blog_posts WHERE search_text IS NULL")
    ).all()
    for row in rows:
        names = db.execute(
            text(
                "SELECT name FROM blog_post_products WHERE post_id = :p AND product_id IS NULL "
                "ORDER BY position"
            ),
            {"p": row.id},
        ).scalars()
        db.execute(
            text("UPDATE blog_posts SET search_text = :s WHERE id = :id"),
            {"s": search_text_of(row.title, row.body, list(names)), "id": row.id},
        )


def list_posts(db: Db, viewer: str, q: PostQuery) -> dict[str, Any]:
    """Visible posts matching the filters (one page), how many there are in all, and the
    average rating over all of them that have one (not just this page)."""
    where = ["p.status = 'visible'"]
    params: dict[str, Any] = {"viewer": viewer, "offset": q.offset, "limit": q.limit}
    if q.skin_type:
        where.append("p.skin_type = :skin_type")
        params["skin_type"] = q.skin_type
    if q.product_id is not None:
        where.append(
            "EXISTS (SELECT 1 FROM blog_post_products bp "
            "WHERE bp.post_id = p.id AND bp.product_id = :product_id)"
        )
        params["product_id"] = q.product_id
    if q.author:
        where.append("pr.handle = :author")
        params["author"] = q.author.strip().lower()
    if q.saved:
        where.append(
            "EXISTS (SELECT 1 FROM blog_saves s WHERE s.post_id = p.id AND s.user_id = :viewer)"
        )
    if q.liked:
        where.append(
            "EXISTS (SELECT 1 FROM blog_likes l WHERE l.post_id = p.id AND l.user_id = :viewer)"
        )
    if q.group:
        # Read only: the groups the seed stored for catalogue products (same join as
        # rules.load_product_groups); nothing from the post reaches resolve() or the engine.
        where.append(
            """EXISTS (SELECT 1 FROM blog_post_products bp
                 JOIN product_ingredients pi ON pi.product_id = bp.product_id
                 JOIN ingredient_groups ig ON ig.ingredient_id = pi.ingredient_id
                 WHERE bp.post_id = p.id AND ig.group_code = :group)"""
        )
        params["group"] = q.group
    order = (
        "like_count DESC, p.created_at DESC, p.id DESC"
        if q.sort == "top"
        else "p.created_at DESC, p.id DESC"
    )
    if q.search is not None:
        needle = normalize_name(q.search)
        where.append(_SEARCH_MATCHES)
        params.update(
            q=needle,
            pattern=_like_pattern(needle),
            text_threshold=POST_TEXT_SIMILARITY,
            product_threshold=PRODUCT_NAME_SIMILARITY,
        )
        order = f"{_SEARCH_SCORE} DESC, p.created_at DESC, p.id DESC"
    condition = " AND ".join(where)
    totals = db.execute(
        text(
            f"SELECT count(*) AS total, count(p.rating) AS rating_count, "
            f"avg(p.rating)::float AS rating_avg {_FROM_POSTS} WHERE {condition}"
        ),
        params,
    ).one()
    rows = db.execute(
        text(
            f"SELECT {_SUMMARY_COLUMNS} {_FROM_POSTS} WHERE {condition} "
            f"ORDER BY {order} OFFSET :offset LIMIT :limit"
        ),
        params,
    ).all()
    return {
        "items": _summaries(db, rows),
        "total": totals.total,
        "rating_avg": round(totals.rating_avg, 2) if totals.rating_avg is not None else None,
        "rating_count": totals.rating_count,
    }


def post_state(db: Db, post_id: int) -> Any:
    """(author_id, status) of a post, or None."""
    return db.execute(
        text("SELECT author_id::text AS author_id, status FROM blog_posts WHERE id = :id"),
        {"id": post_id},
    ).first()


def can_see_post(state: Any, viewer: str) -> bool:
    if state is None:
        return False
    return state.status == "visible" or (state.author_id == viewer and state.status != "removed")


def get_post(db: Db, post_id: int, viewer: str) -> dict[str, Any] | None:
    """The post as `viewer` may see it, or None."""
    row = db.execute(
        text(
            f"SELECT {_SUMMARY_COLUMNS}, p.body, p.routine, "
            "EXISTS (SELECT 1 FROM blog_likes l WHERE l.post_id = p.id AND l.user_id = :viewer) "
            "  AS liked, "
            "EXISTS (SELECT 1 FROM blog_saves s WHERE s.post_id = p.id AND s.user_id = :viewer) "
            "  AS saved "
            f"{_FROM_POSTS} WHERE p.id = :id AND {_POST_SEEN}"
        ),
        {"id": post_id, "viewer": viewer},
    ).first()
    if row is None:
        return None
    summary = _summaries(db, [row])[0]
    return {
        **summary,
        "body": row.body,
        "images": _images_of(db, [row.id])[row.id],
        "routine": row.routine,
        "flags": list(row.flags) if row.is_mine else [],
        "liked": row.liked,
        "saved": row.saved,
        "is_mine": row.is_mine,
        "updated_at": row.updated_at,
    }


def author_page(db: Db, handle: str, viewer: str) -> dict[str, Any] | None:
    profile = db.execute(
        text("SELECT handle, skin_type FROM user_profiles WHERE handle = :h"),
        {"h": handle.strip().lower()},
    ).first()
    if profile is None:
        return None
    found = list_posts(db, viewer, PostQuery(author=profile.handle, limit=1000))
    return {
        "handle": profile.handle,
        "skin_type": profile.skin_type,
        "post_count": found["total"],
        "posts": found["items"],
    }


# Products and groups talked about in recent posts: catalogue products only (the groups are
# those the seed stored for them); a pasted list is never resolved here.
TRENDING_MAX = 6
TRENDING_MIN_POSTS = 2
_TRENDING = """
WITH recent AS (
  SELECT id FROM blog_posts
  WHERE status = 'visible' AND created_at >= now() - make_interval(days => :days)
), per_product AS (
  SELECT bp.product_id, count(DISTINCT bp.post_id) AS n
  FROM blog_post_products bp JOIN recent r ON r.id = bp.post_id
  WHERE bp.product_id IS NOT NULL
  GROUP BY bp.product_id
), per_group AS (
  SELECT ig.group_code, count(DISTINCT bp.post_id) AS n
  FROM blog_post_products bp JOIN recent r ON r.id = bp.post_id
  JOIN product_ingredients pi ON pi.product_id = bp.product_id
  JOIN ingredient_groups ig ON ig.ingredient_id = pi.ingredient_id
  GROUP BY ig.group_code
)
SELECT * FROM (
  SELECT 'product' AS kind, pd.id AS product_id, NULL AS group_code, pd.name AS label_vi, x.n
  FROM per_product x JOIN products pd ON pd.id = x.product_id
  UNION ALL
  SELECT 'group', NULL, g.code, g.name_vi, x.n
  FROM per_group x JOIN functional_groups g ON g.code = x.group_code
) t
WHERE t.n >= :min_posts
ORDER BY t.n DESC, t.kind DESC, t.label_vi
LIMIT :max
"""


def trending(db: Db, days: int) -> list[dict[str, Any]]:
    """Catalogue products and active groups in at least TRENDING_MIN_POSTS visible posts of
    the last `days` days, most posts first (products before groups on a tie). Display only."""
    rows = db.execute(
        text(_TRENDING), {"days": days, "min_posts": TRENDING_MIN_POSTS, "max": TRENDING_MAX}
    )
    return [
        {
            "kind": r.kind,
            "product_id": r.product_id,
            "group": r.group_code,
            "label_vi": r.label_vi,
            "post_count": r.n,
        }
        for r in rows
    ]


# --- Writing posts ---


class InvalidImages(Exception):
    """An image id is not the user's own, or is attached to another post."""


class UnknownProduct(Exception):
    """A product_id is not in the catalogue."""


def check_products(db: Db, product_ids: list[int]) -> None:
    if not product_ids:
        return
    found = set(
        db.execute(
            text("SELECT id FROM products WHERE id = ANY(:ids)"), {"ids": product_ids}
        ).scalars()
    )
    if set(product_ids) - found:
        raise UnknownProduct


def _usable_images(db: Db, owner: str, image_ids: list[int], post_id: int | None) -> list[Any]:
    """The images in the given order, if all are the owner's and free (or on this post)."""
    if not image_ids:
        return []
    rows = db.execute(
        text(
            "SELECT id, caption FROM blog_images WHERE id = ANY(:ids) AND owner_id = :owner "
            "AND (post_id IS NULL OR post_id = :post)"
        ),
        {"ids": image_ids, "owner": owner, "post": post_id},
    ).all()
    if len(rows) != len(set(image_ids)):
        raise InvalidImages
    return rows


def _flags(data: "PostData", captions: list[str | None]) -> list[str]:
    """Auto flags of everything others will read in the post: title, body, image captions,
    the names given to pasted products and to the products of the attached routine."""
    names = [p.get("name") for p in data.products]
    if data.routine:
        names += [p.get("name") for p in data.routine.get("products", [])]
    parts = [data.title, data.body, *captions, *names]
    return auto_flags("\n".join(x for x in parts if x))


def _write_products(db: Db, post_id: int, products: list[dict[str, Any]]) -> None:
    db.execute(text("DELETE FROM blog_post_products WHERE post_id = :p"), {"p": post_id})
    for position, p in enumerate(products, start=1):
        db.execute(
            text(
                "INSERT INTO blog_post_products (post_id, position, product_id, name, inci) "
                "VALUES (:post, :pos, :pid, :name, :inci)"
            ),
            {
                "post": post_id,
                "pos": position,
                "pid": p.get("product_id"),
                "name": p.get("name"),
                "inci": p.get("inci"),
            },
        )


def _attach_images(db: Db, post_id: int, image_ids: list[int]) -> list[str]:
    """Attach the images in this order; images of the post left out are deleted. Returns
    the file names to remove from disk after the commit."""
    gone = db.execute(
        text(
            "DELETE FROM blog_images WHERE post_id = :post AND NOT (id = ANY(:ids)) "
            "RETURNING file_name"
        ),
        {"post": post_id, "ids": image_ids},
    ).scalars()
    removed = list(gone)
    for position, image_id in enumerate(image_ids, start=1):
        db.execute(
            text("UPDATE blog_images SET post_id = :post, position = :pos WHERE id = :id"),
            {"post": post_id, "pos": position, "id": image_id},
        )
    return removed


def _search_text(data: "PostData") -> str:
    return search_text_of(
        data.title, data.body, [p["name"] for p in data.products if p.get("name")]
    )


@dataclass(frozen=True)
class PostData:
    title: str
    body: str
    rating: int | None
    skin_type: str | None
    disclosure: str
    products: list[dict[str, Any]]  # {product_id} or {name, inci}
    image_ids: list[int]
    routine: dict[str, Any] | None  # a routine file, by alias (camelCase)


def create_post(db: Db, author: str, data: PostData) -> int:
    check_products(db, [p["product_id"] for p in data.products if "product_id" in p])
    images = _usable_images(db, author, data.image_ids, None)
    flags = _flags(data, [i.caption for i in images])
    post_id = db.execute(
        text(
            """
            INSERT INTO blog_posts (author_id, title, body, rating, skin_type, disclosure,
                                    routine, status, flags, search_text)
            VALUES (:author, :title, :body, :rating, :skin, :disclosure,
                    CAST(:routine AS jsonb), :status, :flags, :search)
            RETURNING id
            """
        ),
        {
            "search": _search_text(data),
            "author": author,
            "title": data.title,
            "body": data.body,
            "rating": data.rating,
            "skin": data.skin_type,
            "disclosure": data.disclosure,
            "routine": json.dumps(data.routine) if data.routine is not None else None,
            "status": "pending" if flags else "visible",
            "flags": flags,
        },
    ).scalar_one()
    _write_products(db, post_id, data.products)
    _attach_images(db, post_id, data.image_ids)
    if flags:
        notify(db, "post_pending", author, None, post_id)
    return post_id


def update_post(
    db: Db, post_id: int, author: str, current_status: str, data: PostData
) -> list[str]:
    """Replace the post; returns image files to remove after the commit."""
    check_products(db, [p["product_id"] for p in data.products if "product_id" in p])
    images = _usable_images(db, author, data.image_ids, post_id)
    flags = _flags(data, [i.caption for i in images])
    new_status = status_after_edit(current_status, flags)
    db.execute(
        text(
            """
            UPDATE blog_posts SET title = :title, body = :body, rating = :rating,
              skin_type = :skin, disclosure = :disclosure, routine = CAST(:routine AS jsonb),
              status = :status, flags = :flags, search_text = :search, updated_at = now()
            WHERE id = :id
            """
        ),
        {
            "search": _search_text(data),
            "id": post_id,
            "title": data.title,
            "body": data.body,
            "rating": data.rating,
            "skin": data.skin_type,
            "disclosure": data.disclosure,
            "routine": json.dumps(data.routine) if data.routine is not None else None,
            "status": new_status,
            "flags": flags,
        },
    )
    if new_status == "pending" and current_status != "pending":
        notify(db, "post_pending", author, None, post_id)
    _write_products(db, post_id, data.products)
    return _attach_images(db, post_id, data.image_ids)


def drop_orphan_reports(db: Db) -> None:
    """Reports have no foreign key to their target; remove those whose target is gone."""
    db.execute(
        text(
            """
            DELETE FROM blog_reports r
            WHERE (r.target_kind = 'post'
                   AND NOT EXISTS (SELECT 1 FROM blog_posts p WHERE p.id = r.target_id))
               OR (r.target_kind = 'comment'
                   AND NOT EXISTS (SELECT 1 FROM blog_comments c WHERE c.id = r.target_id))
            """
        )
    )


def delete_post(db: Db, post_id: int) -> list[str]:
    """Delete the post with its products, images, comments, likes, saves and reports; returns
    image files to remove after the commit."""
    files = list(
        db.execute(
            text("DELETE FROM blog_images WHERE post_id = :p RETURNING file_name"), {"p": post_id}
        ).scalars()
    )
    db.execute(text("DELETE FROM blog_posts WHERE id = :p"), {"p": post_id})
    drop_orphan_reports(db)
    return files


# --- Notifications (in the app only, never by email) ---

NoticeKind = Literal[
    "post_liked",
    "post_commented",
    "comment_replied",
    "comment_liked",
    "post_pending",
    "post_visible",
    "post_hidden",
    "post_removed",
]
STATUS_NOTICES = ("post_pending", "post_visible", "post_hidden", "post_removed")
# Who liked is never shown (the privacy policy says others do not see who liked): the actor
# is kept only so that unliking can remove the notice, and so it goes with that account.
LIKE_NOTICES = ("post_liked", "comment_liked")


def notify(
    db: Db,
    kind: NoticeKind,
    recipient: str | None,
    actor: str | None,
    post_id: int,
    comment_id: int | None = None,
) -> None:
    """Record one notification. Nobody is notified of their own action; a like is notified
    at most once per person and post / comment while it stands (unique index), and the
    notice goes when the like is taken back (`_drop_like_notice`)."""
    if recipient is None or (actor is not None and str(actor) == str(recipient)):
        return
    db.execute(
        text(
            "INSERT INTO blog_notifications (recipient_id, actor_id, kind, post_id, comment_id) "
            "VALUES (:r, :a, :k, :p, :c) ON CONFLICT DO NOTHING"
        ),
        {"r": recipient, "a": actor, "k": kind, "p": post_id, "c": comment_id},
    )


def _drop_like_notice(db: Db, actor: str, *, post_id: int = 0, comment_id: int = 0) -> None:
    """Unliking removes the like notice it caused, read or not: the comment's when
    comment_id is given, else the post's."""
    if not comment_id:
        sql = "kind = 'post_liked' AND post_id = :p"
    else:
        sql = "kind = 'comment_liked' AND comment_id = :c"
    db.execute(
        text(f"DELETE FROM blog_notifications WHERE actor_id = :a AND {sql}"),
        {"a": actor, "p": post_id, "c": comment_id},
    )


def _post_author(db: Db, post_id: int) -> str | None:
    return db.execute(
        text("SELECT author_id::text FROM blog_posts WHERE id = :p"), {"p": post_id}
    ).scalar_one_or_none()


# A notification is shown while what it points to is visible: the post, and the comment when
# there is one. Status notices go to the post's author and are always shown.
_STATUS_LIST = ", ".join(f"'{k}'" for k in STATUS_NOTICES)
_LIKE_LIST = ", ".join(f"'{k}'" for k in LIKE_NOTICES)
_NOTICE_SHOWN = f"""
    (n.kind IN ({_STATUS_LIST})
     OR (p.status = 'visible'
         AND (n.comment_id IS NULL OR (c.status = 'visible' AND c.deleted_at IS NULL))))
"""
_FROM_NOTICES = """
    FROM blog_notifications n
    JOIN blog_posts p ON p.id = n.post_id
    LEFT JOIN blog_comments c ON c.id = n.comment_id
"""


def unread_count(db: Db, viewer: str) -> int:
    return db.execute(
        text(
            f"SELECT count(*) {_FROM_NOTICES} "
            f"WHERE n.recipient_id = :viewer AND n.read_at IS NULL AND {_NOTICE_SHOWN}"
        ),
        {"viewer": viewer},
    ).scalar_one()


def activity(db: Db, viewer: str, limit: int) -> dict[str, Any]:
    """The viewer's latest notifications that may be shown, newest first. Like notices never
    name who liked, also for rows written before that rule (checked here, when reading)."""
    rows = db.execute(
        text(
            f"""
            SELECT n.id, n.kind, n.created_at, n.read_at IS NOT NULL AS read,
                   CASE WHEN n.kind IN ({_LIKE_LIST}) THEN NULL ELSE pr.handle END AS handle,
                   n.post_id, p.title, n.comment_id,
                   CASE WHEN c.status = 'visible' AND c.deleted_at IS NULL
                        THEN left(c.body, {NOTICE_EXCERPT_LENGTH}) END AS excerpt
            {_FROM_NOTICES}
            LEFT JOIN user_profiles pr ON pr.user_id = n.actor_id
            WHERE n.recipient_id = :viewer AND {_NOTICE_SHOWN}
            ORDER BY n.created_at DESC, n.id DESC
            LIMIT :limit
            """
        ),
        {"viewer": viewer, "limit": limit},
    ).all()
    return {
        "unread_count": unread_count(db, viewer),
        "items": [
            {
                "id": r.id,
                "kind": r.kind,
                "created_at": r.created_at,
                "read": r.read,
                "actor_handle": r.handle,
                "post_id": r.post_id,
                "post_title": r.title,
                "comment_id": r.comment_id,
                "excerpt_vi": r.excerpt,
            }
            for r in rows
        ],
    }


def mark_read(db: Db, viewer: str, ids: list[int] | None) -> None:
    """Mark the viewer's notifications read: those listed, or all when ids is None."""
    if ids is None:
        db.execute(
            text(
                "UPDATE blog_notifications SET read_at = now() "
                "WHERE recipient_id = :viewer AND read_at IS NULL"
            ),
            {"viewer": viewer},
        )
    elif ids:
        db.execute(
            text(
                "UPDATE blog_notifications SET read_at = now() "
                "WHERE recipient_id = :viewer AND read_at IS NULL AND id = ANY(:ids)"
            ),
            {"viewer": viewer, "ids": ids},
        )


def purge_read_notifications(db: Db) -> int:
    """Remove notifications read more than READ_NOTICE_DAYS ago; returns how many."""
    return db.execute(
        text("DELETE FROM blog_notifications WHERE read_at < now() - make_interval(days => :d)"),
        {"d": READ_NOTICE_DAYS},
    ).rowcount


# --- Likes and saves ---


def set_like(db: Db, post_id: int, user_id: str, on: bool) -> int:
    if on:
        db.execute(
            text(
                "INSERT INTO blog_likes (post_id, user_id) VALUES (:p, :u) ON CONFLICT DO NOTHING"
            ),
            {"p": post_id, "u": user_id},
        )
        notify(db, "post_liked", _post_author(db, post_id), user_id, post_id)
    else:
        db.execute(
            text("DELETE FROM blog_likes WHERE post_id = :p AND user_id = :u"),
            {"p": post_id, "u": user_id},
        )
        _drop_like_notice(db, user_id, post_id=post_id)
    return db.execute(
        text("SELECT count(*) FROM blog_likes WHERE post_id = :p"), {"p": post_id}
    ).scalar_one()


def set_save(db: Db, post_id: int, user_id: str, on: bool) -> None:
    if on:
        db.execute(
            text(
                "INSERT INTO blog_saves (post_id, user_id) VALUES (:p, :u) ON CONFLICT DO NOTHING"
            ),
            {"p": post_id, "u": user_id},
        )
    else:
        db.execute(
            text("DELETE FROM blog_saves WHERE post_id = :p AND user_id = :u"),
            {"p": post_id, "u": user_id},
        )


# --- Comments ---
#
# One level of replies: a top-level comment has parent_id NULL; a reply has the id of the
# top-level comment, even when it answers another reply (reply_to_id then names that reply,
# for "@handle"). A top-level comment deleted while it has replies stays as an empty frame
# (deleted_at set, body emptied, author_id NULL).

_COMMENT_COLUMNS = """
    c.id, c.post_id, c.parent_id, c.body, c.status, c.flags, c.created_at,
    c.deleted_at IS NOT NULL AS deleted,
    coalesce(c.author_id = :viewer, false) AS is_mine,
    pr.handle, pr.skin_type AS author_skin_type,
    rp.handle AS reply_to_handle,
    (SELECT count(*) FROM blog_comment_likes cl WHERE cl.comment_id = c.id) AS like_count,
    EXISTS (SELECT 1 FROM blog_comment_likes cl
            WHERE cl.comment_id = c.id AND cl.user_id = :viewer) AS liked_by_me
"""
# The handle of the answered reply, only while the viewer may see that reply.
_FROM_COMMENTS = """
    FROM blog_comments c
    LEFT JOIN user_profiles pr ON pr.user_id = c.author_id
    LEFT JOIN blog_comments rc ON rc.id = c.reply_to_id AND rc.deleted_at IS NULL
      AND (rc.status = 'visible' OR (rc.author_id = :viewer AND rc.status <> 'removed'))
    LEFT JOIN user_profiles rp ON rp.user_id = rc.author_id
"""


def _comment(row: Any, frame: bool = False) -> dict[str, Any]:
    """A comment as the API returns it. frame: shown only to hold its replies (deleted, or
    one the viewer may not see): no author, no text, no likes."""
    frame = frame or row.deleted
    return {
        "id": row.id,
        "post_id": row.post_id,
        "parent_id": row.parent_id,
        "reply_to_handle": row.reply_to_handle,
        "author": None if frame else {"handle": row.handle, "skin_type": row.author_skin_type},
        "body": "" if frame else row.body,
        "status": "visible" if frame else row.status,
        "flags": list(row.flags) if row.is_mine and not frame else [],
        "is_mine": row.is_mine and not frame,
        "deleted": frame,
        "like_count": 0 if frame else row.like_count,
        "liked_by_me": row.liked_by_me and not frame,
        "created_at": row.created_at,
        "replies": [],
    }


def list_comments(db: Db, post_id: int, viewer: str) -> list[dict[str, Any]]:
    """Top-level comments, oldest first, each with its replies (oldest first). The viewer
    sees visible comments and their own waiting ones. A top-level comment that is deleted, or
    that the viewer may not see, is shown as an empty frame while it has replies they see."""
    rows = db.execute(
        text(
            f"SELECT {_COMMENT_COLUMNS}, ({_COMMENT_SEEN} AND c.deleted_at IS NULL) AS seen "
            f"{_FROM_COMMENTS} WHERE c.post_id = :post ORDER BY c.created_at, c.id"
        ),
        {"post": post_id, "viewer": viewer},
    ).all()
    replies: dict[int, list[dict[str, Any]]] = {}
    for r in rows:
        if r.parent_id is not None and r.seen:
            replies.setdefault(r.parent_id, []).append(_comment(r))
    out = []
    for r in rows:
        if r.parent_id is not None:
            continue
        if r.seen:
            out.append({**_comment(r), "replies": replies.get(r.id, [])})
        elif r.id in replies:
            out.append({**_comment(r, frame=True), "replies": replies[r.id]})
    return out


def get_comment(db: Db, comment_id: int, viewer: str) -> dict[str, Any] | None:
    """One comment, without its replies."""
    row = db.execute(
        text(f"SELECT {_COMMENT_COLUMNS} {_FROM_COMMENTS} WHERE c.id = :id"),
        {"id": comment_id, "viewer": viewer},
    ).first()
    return _comment(row) if row else None


def comment_state(db: Db, comment_id: int) -> Any:
    """(author_id, status, post_id, parent_id, deleted) of a comment, or None."""
    return db.execute(
        text(
            "SELECT author_id::text AS author_id, status, post_id, parent_id, "
            "deleted_at IS NOT NULL AS deleted FROM blog_comments WHERE id = :id"
        ),
        {"id": comment_id},
    ).first()


def can_see_comment(db: Db, state: Any, viewer: str) -> bool:
    """Whether the viewer sees the comment itself (not an empty frame) on a post they see."""
    if state is None or state.deleted:
        return False
    if not can_see_post(post_state(db, state.post_id), viewer):
        return False
    return state.status == "visible" or (state.author_id == viewer and state.status != "removed")


def can_answer(db: Db, post_id: int, answered_id: int, viewer: str) -> bool:
    """Whether the viewer may reply to comment `answered_id` on this post: it is on this post
    and they see it."""
    state = comment_state(db, answered_id)
    return state is not None and state.post_id == post_id and can_see_comment(db, state, viewer)


def add_comment(
    db: Db, post_id: int, author: str, body: str, answered_id: int | None = None
) -> int:
    """A comment, or a reply to comment `answered_id` (checked with can_answer first); a
    reply to a reply goes under the same top-level comment. Notifies the author of the
    answered comment, and the post's author."""
    parent_id = reply_to_id = answered_author = None
    if answered_id is not None:
        state = comment_state(db, answered_id)
        parent_id = state.parent_id or answered_id
        reply_to_id = answered_id if state.parent_id is not None else None
        answered_author = state.author_id
    flags = auto_flags(body)
    comment_id = db.execute(
        text(
            "INSERT INTO blog_comments (post_id, author_id, body, status, flags, parent_id, "
            "reply_to_id) VALUES (:post, :author, :body, :status, :flags, :parent, :reply_to) "
            "RETURNING id"
        ),
        {
            "post": post_id,
            "author": author,
            "body": body,
            "status": "pending" if flags else "visible",
            "flags": flags,
            "parent": parent_id,
            "reply_to": reply_to_id,
        },
    ).scalar_one()
    if answered_author is not None:
        notify(db, "comment_replied", answered_author, author, post_id, comment_id)
    post_author = _post_author(db, post_id)
    if post_author != answered_author:
        notify(db, "post_commented", post_author, author, post_id, comment_id)
    return comment_id


def _drop_empty_frames(db: Db) -> None:
    """Remove deleted top-level comments that no longer have any reply."""
    db.execute(
        text(
            "DELETE FROM blog_comments c WHERE c.deleted_at IS NOT NULL "
            "AND NOT EXISTS (SELECT 1 FROM blog_comments r WHERE r.parent_id = c.id)"
        )
    )


def _empty_frame(db: Db, comment_ids: list[int]) -> None:
    """Keep these top-level comments only as frames for their replies: nothing of the text
    or the author stays, nor its likes, reports or the notifications pointing to it."""
    if not comment_ids:
        return
    params = {"ids": comment_ids}
    db.execute(
        text(
            "UPDATE blog_comments SET body = '', author_id = NULL, flags = '{}', "
            "status = 'visible', deleted_at = now() WHERE id = ANY(:ids)"
        ),
        params,
    )
    db.execute(text("DELETE FROM blog_comment_likes WHERE comment_id = ANY(:ids)"), params)
    db.execute(text("DELETE FROM blog_notifications WHERE comment_id = ANY(:ids)"), params)
    db.execute(
        text("DELETE FROM blog_reports WHERE target_kind = 'comment' AND target_id = ANY(:ids)"),
        params,
    )


def delete_comment(db: Db, comment_id: int) -> None:
    """Delete the comment. A top-level comment with replies becomes an empty frame; a frame
    whose last reply goes is removed."""
    has_replies = db.execute(
        text("SELECT EXISTS (SELECT 1 FROM blog_comments WHERE parent_id = :id)"),
        {"id": comment_id},
    ).scalar_one()
    if has_replies:
        _empty_frame(db, [comment_id])
    else:
        db.execute(text("DELETE FROM blog_comments WHERE id = :id"), {"id": comment_id})
        _drop_empty_frames(db)
    drop_orphan_reports(db)


def keep_threads_of(db: Db, user_id: str) -> None:
    """Before the user's account is deleted: their top-level comments that others replied to
    become empty frames, so the deletion does not take others' replies with it."""
    ids = db.execute(
        text(
            "SELECT c.id FROM blog_comments c WHERE c.author_id = :u AND c.parent_id IS NULL "
            "AND EXISTS (SELECT 1 FROM blog_comments r "
            "            WHERE r.parent_id = c.id AND r.author_id <> :u)"
        ),
        {"u": user_id},
    ).scalars()
    _empty_frame(db, list(ids))


def after_account_deletion(db: Db) -> None:
    """After an account is deleted: others' reports about its writing, and frames left
    without replies, go."""
    drop_orphan_reports(db)
    _drop_empty_frames(db)


def set_comment_like(db: Db, comment_id: int, user_id: str, on: bool) -> int:
    if on:
        db.execute(
            text(
                "INSERT INTO blog_comment_likes (comment_id, user_id) VALUES (:c, :u) "
                "ON CONFLICT DO NOTHING"
            ),
            {"c": comment_id, "u": user_id},
        )
        state = comment_state(db, comment_id)
        notify(db, "comment_liked", state.author_id, user_id, state.post_id, comment_id)
    else:
        db.execute(
            text("DELETE FROM blog_comment_likes WHERE comment_id = :c AND user_id = :u"),
            {"c": comment_id, "u": user_id},
        )
        _drop_like_notice(db, user_id, comment_id=comment_id)
    return db.execute(
        text("SELECT count(*) FROM blog_comment_likes WHERE comment_id = :c"), {"c": comment_id}
    ).scalar_one()


# --- Reports and the review queue ---

_TABLES = {"post": "blog_posts", "comment": "blog_comments"}


def _reporters_since_review(db: Db, kind: Kind, target_id: int) -> int:
    return db.execute(
        text(
            f"""
            SELECT count(*) FROM blog_reports r JOIN {_TABLES[kind]} t ON t.id = r.target_id
            WHERE r.target_kind = :kind AND r.target_id = :id
              AND (t.reviewed_at IS NULL OR r.created_at > t.reviewed_at)
            """
        ),
        {"kind": kind, "id": target_id},
    ).scalar_one()


def add_report(
    db: Db, kind: Kind, target_id: int, reporter: str, reason: str, note: str | None
) -> None:
    """Record the report (once per person and target) and hide the target once enough
    distinct people reported it since the last reviewer decision."""
    inserted = db.execute(
        text(
            """
            INSERT INTO blog_reports (target_kind, target_id, reporter_id, reason, note)
            VALUES (:kind, :id, :reporter, :reason, :note)
            ON CONFLICT (target_kind, target_id, reporter_id) DO NOTHING
            RETURNING id
            """
        ),
        {"kind": kind, "id": target_id, "reporter": reporter, "reason": reason, "note": note},
    ).first()
    if inserted is None:
        return
    current = db.execute(
        text(f"SELECT status FROM {_TABLES[kind]} WHERE id = :id"), {"id": target_id}
    ).scalar_one()
    new = status_after_reports(current, _reporters_since_review(db, kind, target_id))
    if new != current:
        db.execute(
            text(f"UPDATE {_TABLES[kind]} SET status = :s WHERE id = :id"),
            {"s": new, "id": target_id},
        )
        if kind == "post" and new == "hidden":
            notify(db, "post_hidden", _post_author(db, target_id), None, target_id)


_QUEUE_SQL = """
SELECT * FROM (
  SELECT 'post' AS kind, p.id, p.id AS post_id, p.title, p.body, pr.handle AS author,
         p.status, p.flags, p.created_at, p.reviewed_at
  FROM blog_posts p JOIN user_profiles pr ON pr.user_id = p.author_id
  UNION ALL
  SELECT 'comment', c.id, c.post_id, NULL, c.body, pr.handle, c.status, c.flags, c.created_at,
         c.reviewed_at
  FROM blog_comments c JOIN user_profiles pr ON pr.user_id = c.author_id
) t
"""


def _with_reports(db: Db, rows: list[Any]) -> list[dict[str, Any]]:
    out = []
    for r in rows:
        reports = db.execute(
            text(
                "SELECT reason, note FROM blog_reports "
                "WHERE target_kind = :kind AND target_id = :id "
                "AND (CAST(:since AS timestamptz) IS NULL OR created_at > :since) "
                "ORDER BY created_at"
            ),
            {"kind": r.kind, "id": r.id, "since": r.reviewed_at},
        ).all()
        reasons = [x.reason for x in reports]
        attached = (
            db.execute(
                text(
                    "SELECT id, caption FROM blog_images WHERE post_id = :p ORDER BY position, id"
                ),
                {"p": r.id},
            ).all()
            if r.kind == "post"
            else []
        )
        out.append(
            {
                "kind": r.kind,
                "id": r.id,
                "post_id": r.post_id,
                "title": r.title,
                "body": r.body,
                "author": r.author,
                "status": r.status,
                "flags": list(r.flags),
                "report_count": len(reasons),
                "report_reasons": list(dict.fromkeys(reasons)),
                "report_notes": [x.note for x in reports if x.note],
                "images": [{"id": i.id, "caption": i.caption} for i in attached],
                "created_at": r.created_at,
            }
        )
    return out


def review_queue(db: Db, status: Literal["pending", "hidden"]) -> list[dict[str, Any]]:
    rows = db.execute(
        text(f"{_QUEUE_SQL} WHERE t.status = :s ORDER BY t.created_at, t.kind, t.id"),
        {"s": status},
    ).all()
    return _with_reports(db, rows)


def moderation_item(db: Db, kind: Kind, item_id: int) -> dict[str, Any] | None:
    rows = db.execute(
        text(f"{_QUEUE_SQL} WHERE t.kind = :k AND t.id = :id"), {"k": kind, "id": item_id}
    ).all()
    items = _with_reports(db, rows)
    return items[0] if items else None


def moderate(db: Db, kind: Kind, item_id: int, action: Literal["approve", "remove"]) -> bool:
    """approve: visible again; remove: nobody sees it. Reports before this decision no longer
    count toward hiding it. False if there is no such item (a deleted comment kept as a frame
    for its replies is not one). The author of a post is notified when its status changes."""
    table = _TABLES[kind]
    live = " AND deleted_at IS NULL" if kind == "comment" else ""
    before = db.execute(
        text(f"SELECT status FROM {table} WHERE id = :id{live} FOR UPDATE"), {"id": item_id}
    ).scalar_one_or_none()
    if before is None:
        return False
    new = "visible" if action == "approve" else "removed"
    db.execute(
        text(f"UPDATE {table} SET status = :s, reviewed_at = clock_timestamp() WHERE id = :id"),
        {"s": new, "id": item_id},
    )
    if kind == "post" and new != before:
        notice = "post_visible" if new == "visible" else "post_removed"
        notify(db, notice, _post_author(db, item_id), None, item_id)
    return True


# --- Photos ---


def add_image(
    db: Db, owner: str, file_name: str, width: int, height: int, caption: str | None
) -> int:
    return db.execute(
        text(
            "INSERT INTO blog_images (owner_id, file_name, width, height, caption) "
            "VALUES (:owner, :file, :w, :h, :caption) RETURNING id"
        ),
        {"owner": owner, "file": file_name, "w": width, "h": height, "caption": caption},
    ).scalar_one()


def drop_stale_uploads(db: Db) -> list[str]:
    """Remove uploads never attached to a post within a day; returns their file names."""
    return list(
        db.execute(
            text(
                "DELETE FROM blog_images WHERE post_id IS NULL "
                "AND created_at < now() - make_interval(hours => :h) RETURNING file_name"
            ),
            {"h": UNATTACHED_IMAGE_HOURS},
        ).scalars()
    )


def image_for(db: Db, image_id: int, viewer: str) -> Any:
    """(file_name, ...) of an image `viewer` may see: on a post they may see, or their own
    upload not attached yet. None otherwise."""
    row = db.execute(
        text(
            """
            SELECT i.file_name, i.owner_id::text AS owner_id, i.post_id,
                   p.author_id::text AS author_id, p.status
            FROM blog_images i LEFT JOIN blog_posts p ON p.id = i.post_id
            WHERE i.id = :id
            """
        ),
        {"id": image_id},
    ).first()
    if row is None:
        return None
    if row.post_id is None:
        return row if row.owner_id == viewer else None
    return row if can_see_post(row, viewer) else None


def image_for_reviewer(db: Db, image_id: int) -> str | None:
    """The file of an image on a post, whatever the post's status; None for an upload not
    attached yet (nobody has published it) or an unknown id."""
    return db.execute(
        text("SELECT file_name FROM blog_images WHERE id = :id AND post_id IS NOT NULL"),
        {"id": image_id},
    ).scalar_one_or_none()


# --- Rights of the user (Law 91/2025/QH15 Art. 4): export and deletion ---


def export_blog(db: Db, user_id: str) -> dict[str, Any]:
    """Everything the blog keeps about the user. Images are listed, not embedded."""
    profile = get_profile(db, user_id)
    posts = db.execute(
        text(
            "SELECT id, title, body, rating, skin_type, disclosure, routine, status, flags, "
            "created_at, updated_at FROM blog_posts WHERE author_id = :u ORDER BY created_at"
        ),
        {"u": user_id},
    ).all()
    products = _products_of(db, [p.id for p in posts])

    def iso(value: Any) -> str | None:
        return value.isoformat() if value is not None else None

    def rows(sql: str) -> list[dict[str, Any]]:
        result = db.execute(text(sql), {"u": user_id})
        return [
            {k: iso(v) if hasattr(v, "isoformat") else v for k, v in r._mapping.items()}
            for r in result
        ]

    return {
        "profile": (
            {"handle": profile.handle, "skin_type": profile.skin_type} if profile else None
        ),
        "posts": [
            {
                "id": p.id,
                "title": p.title,
                "body": p.body,
                "rating": p.rating,
                "skin_type": p.skin_type,
                "disclosure": p.disclosure,
                "products": [
                    {k: v for k, v in pp.items() if k != "brand"} for pp in products[p.id]
                ],
                "routine": p.routine,
                "status": p.status,
                "flags": list(p.flags),
                "created_at": iso(p.created_at),
                "updated_at": iso(p.updated_at),
            }
            for p in posts
        ],
        "images": rows(
            "SELECT id, post_id, caption, created_at FROM blog_images "
            "WHERE owner_id = :u ORDER BY id"
        ),
        "comments": rows(
            "SELECT id, post_id, parent_id, body, status, created_at FROM blog_comments "
            "WHERE author_id = :u ORDER BY created_at"
        ),
        "likes": rows(
            "SELECT post_id, created_at FROM blog_likes WHERE user_id = :u ORDER BY created_at"
        ),
        "saves": rows(
            "SELECT post_id, created_at FROM blog_saves WHERE user_id = :u ORDER BY created_at"
        ),
        "reports": rows(
            "SELECT target_kind, target_id, reason, note, created_at FROM blog_reports "
            "WHERE reporter_id = :u ORDER BY created_at"
        ),
        "comment_likes": rows(
            "SELECT comment_id, created_at FROM blog_comment_likes WHERE user_id = :u "
            "ORDER BY created_at"
        ),
        # Received ones; who caused each is left out (that is someone else's data).
        "notifications": rows(
            "SELECT kind, post_id, comment_id, created_at, read_at FROM blog_notifications "
            "WHERE recipient_id = :u ORDER BY created_at"
        ),
    }


def image_files_of(db: Db, user_id: str) -> list[str]:
    """Files of every image the user uploaded, to remove after their account is deleted."""
    return list(
        db.execute(
            text("SELECT file_name FROM blog_images WHERE owner_id = :u"), {"u": user_id}
        ).scalars()
    )
