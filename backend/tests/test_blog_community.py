"""Community features of the blog: search and new filters, "trending", one level of replies,
comment likes and in-app notifications (_workspace/feature-blog-community/01_spec.md)."""

import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text

from app.blog import LIMITS, purge_read_notifications
from app.moderation import REPORT_THRESHOLD
from app.reviewers import set_reviewer

BODY = "Mình dùng sản phẩm này được ba tuần, da mềm hơn và ít bóng dầu vào buổi chiều."
REVIEWER, REVIEWER_PASSWORD = "Người duyệt cộng đồng", "mat-khau-duyet-cong-dong"


def handle() -> str:
    return f"c_{uuid.uuid4().hex[:8]}"


@pytest.fixture(scope="module")
def groups(engine: Engine) -> dict[str, int]:
    """A catalogue product with NIACINAMIDE, and one with no active group at all."""
    with engine.connect() as conn:
        with_group = conn.execute(
            text(
                "SELECT min(pi.product_id) FROM product_ingredients pi "
                "JOIN ingredient_groups ig ON ig.ingredient_id = pi.ingredient_id "
                "WHERE ig.group_code = 'NIACINAMIDE'"
            )
        ).scalar_one()
        without = conn.execute(
            text(
                "SELECT min(p.id) FROM products p WHERE NOT EXISTS ("
                "SELECT 1 FROM product_ingredients pi JOIN ingredient_groups ig "
                "ON ig.ingredient_id = pi.ingredient_id WHERE pi.product_id = p.id)"
            )
        ).scalar_one()
    return {"niacinamide": with_group, "none": without}


def create(client: TestClient, products: list[dict], **change) -> dict:
    body = {"title": "Cảm nhận sau ba tuần", "body": BODY, "products": products, **change}
    response = client.post("/blog/posts", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def catalogue(product_id: int) -> list[dict]:
    return [{"product_id": product_id}]


PASTED = [{"name": "Kem tự trộn", "inci": "Aqua, Niacinamide, Glycerin"}]


def ids(response) -> list[int]:  # noqa: ANN001
    assert response.status_code == 200, response.text
    return [p["id"] for p in response.json()["items"]]


@pytest.fixture(scope="module")
def reviewer(engine: Engine) -> Iterator[str]:
    with engine.begin() as conn:
        set_reviewer(conn, REVIEWER, REVIEWER_PASSWORD)
    yield REVIEWER
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM reviewers WHERE name = :n"), {"n": REVIEWER})


@pytest.fixture
def auth(client: TestClient, reviewer: str) -> dict[str, str]:
    response = client.post("/review/login", json={"name": REVIEWER, "password": REVIEWER_PASSWORD})
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_new_routes_need_a_session(client: TestClient) -> None:
    for method, path in [
        ("GET", "/blog/trending"),
        ("PUT", "/blog/comments/1/like"),
        ("DELETE", "/blog/comments/1/like"),
        ("GET", "/me/activity"),
        ("POST", "/me/activity/read"),
    ]:
        assert client.request(method, path).status_code == 401, (method, path)


# --- Filters and search ---


def test_liked_filter(make_user, groups) -> None:
    author = make_user(handle())
    reader = make_user(handle())
    liked = create(author, catalogue(groups["none"]))
    create(author, catalogue(groups["none"]))
    assert ids(reader.get("/blog/posts?liked=true")) == []
    reader.put(f"/blog/posts/{liked['id']}/like")
    assert ids(reader.get("/blog/posts?liked=true")) == [liked["id"]]
    assert ids(author.get("/blog/posts?liked=true")) == []  # the caller's own likes only
    reader.delete(f"/blog/posts/{liked['id']}/like")
    assert ids(reader.get("/blog/posts?liked=true")) == []


def test_search_with_and_without_diacritics(make_user, groups, engine: Engine) -> None:
    author = make_user(handle())
    in_title = create(author, catalogue(groups["none"]), title="Hoa phượng vĩ và kem dưỡng")
    in_body = create(author, catalogue(groups["none"]), body=BODY + " Mùa phượng vĩ nở.")
    pasted = create(
        author, [{"name": "Kem Hoa Sứ tự trộn", "inci": "Aqua, Glycerin"}], title="Kem tự trộn"
    )
    other = create(author, catalogue(groups["none"]))
    for q in ["phượng vĩ", "PHUONG VI", "  phuong vi  ", "phượng"]:
        found = ids(author.get("/blog/posts", params={"q": q}))
        assert in_title["id"] in found and in_body["id"] in found, q
        assert other["id"] not in found and pasted["id"] not in found, q
    assert ids(author.get("/blog/posts", params={"q": "hoa su"})) == [pasted["id"]]

    # Catalogue product names, through products.search_name.
    with engine.connect() as conn:
        name = conn.execute(
            text("SELECT name FROM products WHERE id = :id"), {"id": groups["niacinamide"]}
        ).scalar_one()
    by_product = create(author, catalogue(groups["niacinamide"]), title="Không nhắc tên")
    assert ids(author.get("/blog/posts", params={"q": name}))[0] == by_product["id"]

    # Visible posts only, even the caller's own pending one.
    flagged = create(author, catalogue(groups["none"]), body=BODY + " Phượng vĩ trị mụn.")
    assert flagged["status"] == "pending"
    assert flagged["id"] not in ids(author.get("/blog/posts", params={"q": "phuong vi"}))


def test_search_ranks_the_best_match_first(make_user, groups) -> None:
    author = make_user(handle())
    exact = create(author, catalogue(groups["none"]), title="Kem dưỡng hoa quỳnh đêm")
    close = create(author, catalogue(groups["none"]), title="Kem dưỡng hoa quynhh")
    found = ids(author.get("/blog/posts", params={"q": "hoa quỳnh", "sort": "new"}))
    assert found.index(exact["id"]) < found.index(close["id"])


def test_search_validation(make_user) -> None:
    me = make_user(handle())
    for q in ["", " a ", "x" * 101, "  --  ", "a.", " .a. "]:
        assert me.get("/blog/posts", params={"q": q}).status_code == 422, q
    assert me.get("/blog/posts", params={"q": " ab "}).status_code == 200
    assert me.get("/blog/posts", params={"q": "x" * 100}).status_code == 200
    for q in ["ab.", "x" * 100 + "."]:  # the normalized length counts
        assert me.get("/blog/posts", params={"q": q}).status_code == 200, q


def test_search_text_is_kept_up_to_date_and_backfilled(make_user, groups, engine) -> None:
    from app.blog import backfill_search_text

    author = make_user(handle())
    post = create(author, catalogue(groups["none"]))
    assert ids(author.get("/blog/posts", params={"q": "hoa ngọc lan"})) == []
    edit = {"title": "Hoa ngọc lan", "body": BODY, "products": catalogue(groups["none"])}
    assert author.put(f"/blog/posts/{post['id']}", json=edit).status_code == 200
    assert ids(author.get("/blog/posts", params={"q": "hoa ngoc lan"})) == [post["id"]]

    with engine.begin() as conn:
        conn.execute(
            text("UPDATE blog_posts SET search_text = NULL WHERE id = :id"), {"id": post["id"]}
        )
        backfill_search_text(conn)
        assert (
            conn.execute(
                text("SELECT search_text FROM blog_posts WHERE id = :id"), {"id": post["id"]}
            )
            .scalar_one()
            .startswith("hoa ngoc lan")
        )


def test_group_filter_reads_catalogue_groups_only(make_user, groups) -> None:
    author = make_user(handle())
    with_group = create(author, catalogue(groups["niacinamide"]))
    create(author, catalogue(groups["none"]))
    pasted = create(author, PASTED)  # a pasted list is not resolved for this filter
    found = ids(author.get("/blog/posts?group=NIACINAMIDE&limit=50"))
    assert with_group["id"] in found
    assert pasted["id"] not in found
    assert ids(author.get("/blog/posts?group=NO_SUCH_GROUP")) == []
    for bad in ["niacinamide", "A B", "X" * 41]:
        assert author.get("/blog/posts", params={"group": bad}).status_code == 422, bad


# --- Trending ---


def test_trending(make_user, groups, engine: Engine) -> None:
    author = make_user(handle())
    url = "/blog/trending"
    # One post is not enough.
    first = create(author, catalogue(groups["niacinamide"]))
    trending = author.get(url).json()
    assert not any(t["product_id"] == groups["niacinamide"] for t in trending)

    second = create(author, catalogue(groups["niacinamide"]))
    create(author, PASTED)  # pasted lists count for nothing
    trending = author.get(url).json()
    product = next(t for t in trending if t["product_id"] == groups["niacinamide"])
    assert product["kind"] == "product" and product["group"] is None
    assert product["post_count"] == 2
    with engine.connect() as conn:
        assert (
            product["label_vi"]
            == conn.execute(
                text("SELECT name FROM products WHERE id = :id"), {"id": groups["niacinamide"]}
            ).scalar_one()
        )
        name_vi = conn.execute(
            text("SELECT name_vi FROM functional_groups WHERE code = 'NIACINAMIDE'")
        ).scalar_one()
    group = next(t for t in trending if t["group"] == "NIACINAMIDE")
    assert group == {
        "kind": "group",
        "product_id": None,
        "group": "NIACINAMIDE",
        "label_vi": name_vi,
        "post_count": 2,
    }
    assert len(trending) <= 6
    assert [t["post_count"] for t in trending] == sorted(
        (t["post_count"] for t in trending), reverse=True
    )
    assert all(t["post_count"] >= 2 for t in trending)

    # Only posts in the window count.
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE blog_posts SET created_at = now() - interval '10 days' WHERE id = :id"),
            {"id": first["id"]},
        )
    assert not any(t["product_id"] == groups["niacinamide"] for t in author.get(url).json())
    long_window = author.get(url, params={"days": 30}).json()
    assert any(t["product_id"] == groups["niacinamide"] for t in long_window)

    # Only visible posts count.
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE blog_posts SET status = 'hidden' WHERE id = :id"), {"id": second["id"]}
        )
    long_window = author.get(url, params={"days": 30}).json()
    assert not any(t["product_id"] == groups["niacinamide"] for t in long_window)

    for bad in [0, 91, "x"]:
        assert author.get(url, params={"days": bad}).status_code == 422


def test_trending_empty(make_user) -> None:
    me = make_user(handle())
    response = me.get("/blog/trending")
    assert response.status_code == 200 and isinstance(response.json(), list)


# --- Replies ---


def test_one_level_of_replies(make_user, groups) -> None:
    author = make_user(handle())
    post = create(author, catalogue(groups["none"]))
    url = f"/blog/posts/{post['id']}/comments"
    a_name, b_name = handle(), handle()
    a, b = make_user(a_name), make_user(b_name)

    root = a.post(url, json={"body": "Bình luận gốc"}).json()
    assert root["parent_id"] is None and root["replies"] == [] and not root["deleted"]
    reply = b.post(url, json={"body": "Trả lời", "parent_id": root["id"]})
    assert reply.status_code == 201
    reply = reply.json()
    assert reply["parent_id"] == root["id"] and reply["reply_to_handle"] is None
    # A reply to a reply goes under the same top-level comment and names whom it answers.
    deeper = a.post(url, json={"body": "Trả lời trả lời", "parent_id": reply["id"]}).json()
    assert deeper["parent_id"] == root["id"] and deeper["reply_to_handle"] == b_name
    second_root = b.post(url, json={"body": "Gốc thứ hai"}).json()

    tree = author.get(url).json()
    assert [c["id"] for c in tree] == [root["id"], second_root["id"]]
    assert [r["id"] for r in tree[0]["replies"]] == [reply["id"], deeper["id"]]
    assert all(r["replies"] == [] for r in tree[0]["replies"])
    assert tree[1]["replies"] == []
    # Replies count as comments.
    assert author.get(f"/blog/posts/{post['id']}").json()["comment_count"] == 4


def test_reply_parent_must_be_on_the_post_and_seen(make_user, groups) -> None:
    author = make_user(handle())
    post = create(author, catalogue(groups["none"]))
    other = create(author, catalogue(groups["none"]))
    url = f"/blog/posts/{post['id']}/comments"
    reader = make_user(handle())
    elsewhere = reader.post(f"/blog/posts/{other['id']}/comments", json={"body": "Ở bài khác"})
    waiting = author.post(url, json={"body": "Gọi 0912345678"}).json()  # pending: author only
    assert waiting["status"] == "pending"
    for parent in [elsewhere.json()["id"], waiting["id"], 999_999_999]:
        response = reader.post(url, json={"body": "Trả lời", "parent_id": parent})
        assert response.status_code == 404, parent
    # The author may answer their own waiting comment.
    assert author.post(url, json={"body": "Ok", "parent_id": waiting["id"]}).status_code == 201


def test_deleting_a_comment_with_replies_keeps_an_empty_frame(make_user, groups, engine) -> None:
    author = make_user(handle())
    post = create(author, catalogue(groups["none"]))
    url = f"/blog/posts/{post['id']}/comments"
    a, b = make_user(handle()), make_user(handle())
    root = a.post(url, json={"body": "Gốc sẽ bị xoá"}).json()
    reply = b.post(url, json={"body": "Trả lời vẫn còn", "parent_id": root["id"]}).json()
    b.put(f"/blog/comments/{root['id']}/like")
    lone = a.post(url, json={"body": "Gốc không có trả lời"}).json()

    assert a.delete(f"/blog/comments/{lone['id']}").status_code == 204
    assert a.delete(f"/blog/comments/{root['id']}").status_code == 204
    tree = b.get(url).json()
    assert [c["id"] for c in tree] == [root["id"]]  # the lone one is gone for good
    frame = tree[0]
    assert frame["deleted"] and frame["author"] is None and frame["body"] == ""
    assert frame["like_count"] == 0 and not frame["liked_by_me"] and not frame["is_mine"]
    assert [r["id"] for r in frame["replies"]] == [reply["id"]]
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT body, author_id FROM blog_comments WHERE id = :id"), {"id": root["id"]}
        ).one()
    assert row.body == "" and row.author_id is None  # nothing of the author is kept
    assert b.get(f"/blog/posts/{post['id']}").json()["comment_count"] == 1

    # The frame can no longer be liked, reported, answered or deleted.
    assert b.put(f"/blog/comments/{root['id']}/like").status_code == 404
    report = {"target_kind": "comment", "target_id": root["id"], "reason": "other"}
    assert b.post("/blog/reports", json=report).status_code == 404
    assert b.post(url, json={"body": "x", "parent_id": root["id"]}).status_code == 404
    assert a.delete(f"/blog/comments/{root['id']}").status_code == 404

    # When its last reply goes, so does the frame.
    assert b.delete(f"/blog/comments/{reply['id']}").status_code == 204
    assert b.get(url).json() == []
    with engine.connect() as conn:
        assert (
            conn.execute(
                text("SELECT count(*) FROM blog_comments WHERE id = :id"), {"id": root["id"]}
            ).scalar_one()
            == 0
        )


def test_a_hidden_comment_with_replies_shows_as_a_frame(make_user, groups) -> None:
    author = make_user(handle())
    post = create(author, catalogue(groups["none"]))
    url = f"/blog/posts/{post['id']}/comments"
    writer = make_user(handle())
    root = writer.post(url, json={"body": "Sẽ bị báo cáo"}).json()
    reply = author.post(url, json={"body": "Trả lời", "parent_id": root["id"]}).json()
    for _ in range(REPORT_THRESHOLD):
        make_user(handle()).post(
            "/blog/reports",
            json={"target_kind": "comment", "target_id": root["id"], "reason": "other"},
        )
    reader = make_user(handle())
    frame = reader.get(url).json()[0]
    assert frame["id"] == root["id"] and frame["deleted"] and frame["body"] == ""
    assert frame["author"] is None
    assert [r["id"] for r in frame["replies"]] == [reply["id"]]
    # Its author still sees it, with its status.
    own = writer.get(url).json()[0]
    assert own["status"] == "hidden" and own["body"] == "Sẽ bị báo cáo" and not own["deleted"]


def test_replies_are_moderated_like_comments(make_user, groups) -> None:
    author = make_user(handle())
    post = create(author, catalogue(groups["none"]))
    url = f"/blog/posts/{post['id']}/comments"
    root = author.post(url, json={"body": "Gốc"}).json()
    writer = make_user(handle())
    flagged = writer.post(url, json={"body": "Ghé www.shop.vn nhé", "parent_id": root["id"]})
    assert flagged.json()["status"] == "pending" and flagged.json()["flags"] == ["link"]
    assert author.get(url).json()[0]["replies"] == []
    assert [r["id"] for r in writer.get(url).json()[0]["replies"]] == [flagged.json()["id"]]


# --- Comment likes ---


def test_comment_likes(make_user, groups) -> None:
    author = make_user(handle())
    post = create(author, catalogue(groups["none"]))
    url = f"/blog/posts/{post['id']}/comments"
    comment = author.post(url, json={"body": "Thích bình luận này"}).json()
    assert comment["like_count"] == 0 and not comment["liked_by_me"]
    reader = make_user(handle())
    like = f"/blog/comments/{comment['id']}/like"
    assert reader.put(like).json() == {"liked": True, "like_count": 1}
    assert reader.put(like).json() == {"liked": True, "like_count": 1}  # idempotent
    assert author.put(like).json() == {"liked": True, "like_count": 2}
    seen = reader.get(url).json()[0]
    assert seen["like_count"] == 2 and seen["liked_by_me"]
    assert reader.delete(like).json() == {"liked": False, "like_count": 1}
    assert reader.delete(like).json() == {"liked": False, "like_count": 1}
    assert not reader.get(url).json()[0]["liked_by_me"]
    assert reader.put("/blog/comments/999999999/like").status_code == 404

    waiting = author.post(url, json={"body": "Gọi 0912345678"}).json()
    assert reader.put(f"/blog/comments/{waiting['id']}/like").status_code == 404


def test_comment_likes_are_limited(make_user, groups) -> None:
    author = make_user(handle())
    post = create(author, catalogue(groups["none"]))
    comment = author.post(f"/blog/posts/{post['id']}/comments", json={"body": "Gốc"}).json()
    reader = make_user(handle())
    like = f"/blog/comments/{comment['id']}/like"
    codes = [reader.put(like).status_code for _ in range(LIMITS["comment_like"][0] + 1)]
    assert codes == [200] * LIMITS["comment_like"][0] + [429]
    assert reader.delete(like).status_code == 200  # unliking is not counted


# --- Notifications ---


def activity(client: TestClient) -> dict:
    response = client.get("/me/activity")
    assert response.status_code == 200, response.text
    return response.json()


def kinds(client: TestClient) -> list[str]:
    return [i["kind"] for i in activity(client)["items"]]


def test_social_notifications(make_user, groups) -> None:
    author = make_user(handle())
    post = create(author, catalogue(groups["none"]))
    url = f"/blog/posts/{post['id']}/comments"
    a_name, b_name = handle(), handle()
    a, b = make_user(a_name), make_user(b_name)
    assert activity(author) == {"unread_count": 0, "items": []}

    a.put(f"/blog/posts/{post['id']}/like")
    root = a.post(url, json={"body": "Bình luận khá dài " + "x" * 100}).json()
    reply = b.post(url, json={"body": "Trả lời a", "parent_id": root["id"]}).json()
    b.put(f"/blog/comments/{root['id']}/like")

    got = activity(author)
    assert [i["kind"] for i in got["items"]] == ["post_commented", "post_commented", "post_liked"]
    assert got["unread_count"] == 3
    liked = got["items"][2]
    assert liked["actor_handle"] is None and liked["post_id"] == post["id"]
    assert liked["post_title"] == post["title"] and liked["comment_id"] is None
    assert liked["excerpt_vi"] is None and liked["read"] is False
    commented = got["items"][1]
    assert commented["actor_handle"] == a_name and got["items"][0]["actor_handle"] == b_name
    assert commented["comment_id"] == root["id"]
    assert commented["excerpt_vi"] == root["body"][:80] and len(commented["excerpt_vi"]) == 80

    got = activity(a)
    assert [i["kind"] for i in got["items"]] == ["comment_liked", "comment_replied"]
    assert got["items"][0]["actor_handle"] is None  # who liked is never shown
    assert got["items"][1]["actor_handle"] == b_name  # who replied is
    assert got["items"][0]["comment_id"] == root["id"]
    assert got["items"][1]["comment_id"] == reply["id"]
    assert got["items"][1]["excerpt_vi"] == "Trả lời a"

    # A reply to a reply notifies the author of that reply.
    a.post(url, json={"body": "Cảm ơn b", "parent_id": reply["id"]})
    assert kinds(b) == ["comment_replied"]

    # The post's author answering a comment: the comment's author is told, nobody else.
    before = kinds(author)
    author.post(url, json={"body": "Cảm ơn mọi người", "parent_id": root["id"]})
    assert kinds(a)[0] == "comment_replied"
    assert kinds(author) == before


def test_no_notification_for_oneself(make_user, groups) -> None:
    author = make_user(handle())
    post = create(author, catalogue(groups["none"]))
    url = f"/blog/posts/{post['id']}/comments"
    author.put(f"/blog/posts/{post['id']}/like")
    comment = author.post(url, json={"body": "Tự bình luận"}).json()
    author.post(url, json={"body": "Tự trả lời", "parent_id": comment["id"]})
    author.put(f"/blog/comments/{comment['id']}/like")
    assert activity(author) == {"unread_count": 0, "items": []}


def test_a_like_is_notified_once(make_user, groups) -> None:
    author = make_user(handle())
    post = create(author, catalogue(groups["none"]))
    comment = author.post(f"/blog/posts/{post['id']}/comments", json={"body": "Gốc"}).json()
    reader = make_user(handle())
    for _ in range(3):
        reader.put(f"/blog/posts/{post['id']}/like")
        reader.put(f"/blog/comments/{comment['id']}/like")
    assert sorted(kinds(author)) == ["comment_liked", "post_liked"]


def test_unliking_removes_the_like_notice(make_user, groups) -> None:
    author = make_user(handle())
    post = create(author, catalogue(groups["none"]))
    comment = author.post(f"/blog/posts/{post['id']}/comments", json={"body": "Gốc"}).json()
    reader, other = make_user(handle()), make_user(handle())
    for client in (reader, other):
        client.put(f"/blog/posts/{post['id']}/like")
        client.put(f"/blog/comments/{comment['id']}/like")
    assert sorted(kinds(author)) == ["comment_liked"] * 2 + ["post_liked"] * 2
    author.post("/me/activity/read", json={})  # read notices go too

    assert reader.delete(f"/blog/posts/{post['id']}/like").status_code == 200
    assert sorted(kinds(author)) == ["comment_liked"] * 2 + ["post_liked"]
    assert reader.delete(f"/blog/comments/{comment['id']}/like").status_code == 200
    assert sorted(kinds(author)) == ["comment_liked", "post_liked"]  # the other reader's stay

    # Liking again notifies again, still without a name.
    reader.put(f"/blog/posts/{post['id']}/like")
    got = activity(author)
    assert got["unread_count"] == 1
    assert [i["actor_handle"] for i in got["items"]] == [None, None, None]


def test_like_notices_never_name_who_liked(make_user, groups, engine) -> None:
    author = make_user(handle())
    post = create(author, catalogue(groups["none"]))
    comment = author.post(f"/blog/posts/{post['id']}/comments", json={"body": "Gốc"}).json()
    liker_name = handle()
    liker = make_user(liker_name)
    liker.put(f"/blog/posts/{post['id']}/like")
    liker.put(f"/blog/comments/{comment['id']}/like")
    response = author.get("/me/activity")
    assert sorted(i["kind"] for i in response.json()["items"]) == ["comment_liked", "post_liked"]
    assert liker_name not in response.text

    # Rows written before this rule (or by any other path) are hidden when read, too.
    with engine.begin() as conn:
        actor = conn.execute(
            text("SELECT user_id FROM user_profiles WHERE handle = :h"), {"h": liker_name}
        ).scalar_one()
        conn.execute(text("DELETE FROM blog_notifications WHERE actor_id = :a"), {"a": actor})
        conn.execute(
            text(
                "INSERT INTO blog_notifications (recipient_id, actor_id, kind, post_id, comment_id)"
                " SELECT author_id, :a, k, id, c FROM blog_posts, (VALUES "
                " ('post_liked', NULL::bigint), ('comment_liked', CAST(:c AS bigint))) v(k, c)"
                " WHERE id = :p"
            ),
            {"a": actor, "p": post["id"], "c": comment["id"]},
        )
    response = author.get("/me/activity")
    assert len(response.json()["items"]) == 2
    assert liker_name not in response.text


def test_status_notifications(make_user, groups, client: TestClient, auth) -> None:
    author = make_user(handle())
    flagged = create(author, catalogue(groups["none"]), body=BODY + " Trị mụn nhanh.")
    assert kinds(author) == ["post_pending"]
    notice = activity(author)["items"][0]
    assert notice["actor_handle"] is None and notice["post_title"] == flagged["title"]

    assert (
        client.post(
            f"/review/blog/post/{flagged['id']}", json={"action": "approve"}, headers=auth
        ).status_code
        == 200
    )
    assert kinds(author) == ["post_visible", "post_pending"]

    for _ in range(REPORT_THRESHOLD):
        make_user(handle()).post(
            "/blog/reports",
            json={"target_kind": "post", "target_id": flagged["id"], "reason": "other"},
        )
    assert kinds(author)[0] == "post_hidden"

    client.post(f"/review/blog/post/{flagged['id']}", json={"action": "remove"}, headers=auth)
    # Status notices are shown to the author even now that nobody else sees the post.
    assert kinds(author) == ["post_removed", "post_hidden", "post_visible", "post_pending"]

    # An edit that gets flagged waits again, and says so.
    other = create(author, catalogue(groups["none"]))
    edit = {
        "title": other["title"],
        "body": BODY + " Chữa khỏi.",
        "products": catalogue(groups["none"]),
    }
    assert author.put(f"/blog/posts/{other['id']}", json=edit).json()["status"] == "pending"
    assert kinds(author)[0] == "post_pending"


def test_hidden_content_is_not_shown_through_notifications(make_user, groups, engine) -> None:
    author = make_user(handle())
    post = create(author, catalogue(groups["none"]))
    url = f"/blog/posts/{post['id']}/comments"
    writer = make_user(handle())
    # A comment waiting for review: no notice until it is visible.
    waiting = writer.post(url, json={"body": "Mua ở www.shop.vn"}).json()
    assert waiting["status"] == "pending"
    assert activity(author) == {"unread_count": 0, "items": []}
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE blog_comments SET status = 'visible' WHERE id = :id"),
            {"id": waiting["id"]},
        )
    assert activity(author)["items"][0]["excerpt_vi"] == "Mua ở www.shop.vn"
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE blog_comments SET status = 'removed' WHERE id = :id"),
            {"id": waiting["id"]},
        )
    assert activity(author) == {"unread_count": 0, "items": []}

    # Notices about a post that is no longer visible are not shown either.
    writer.put(f"/blog/posts/{post['id']}/like")
    assert kinds(author) == ["post_liked"]
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE blog_posts SET status = 'hidden' WHERE id = :id"), {"id": post["id"]}
        )
    assert activity(author) == {"unread_count": 0, "items": []}


def test_mark_read(make_user, groups) -> None:
    author = make_user(handle())
    post = create(author, catalogue(groups["none"]))
    for _ in range(3):
        make_user(handle()).put(f"/blog/posts/{post['id']}/like")
    items = activity(author)["items"]
    assert activity(author)["unread_count"] == 3
    response = author.post("/me/activity/read", json={"ids": [items[0]["id"]]})
    assert response.status_code == 200 and response.json() == {"unread_count": 2}
    assert [i["read"] for i in activity(author)["items"]] == [True, False, False]
    # Someone else's ids change nothing.
    assert make_user(handle()).post("/me/activity/read", json={"ids": [items[1]["id"]]}).json() == {
        "unread_count": 0
    }
    assert activity(author)["unread_count"] == 2
    assert author.post("/me/activity/read", json={}).json() == {"unread_count": 0}
    assert author.post("/me/activity/read").json() == {"unread_count": 0}
    assert all(i["read"] for i in activity(author)["items"])
    assert author.post("/me/activity/read", json={"ids": ["x"]}).status_code == 422
    assert author.get("/me/activity?limit=0").status_code == 422
    assert author.get("/me/activity?limit=101").status_code == 422
    assert len(author.get("/me/activity?limit=1").json()["items"]) == 1


def test_read_notifications_are_purged_after_90_days(make_user, groups, engine) -> None:
    author = make_user(handle())
    post = create(author, catalogue(groups["none"]))
    make_user(handle()).put(f"/blog/posts/{post['id']}/like")
    make_user(handle()).put(f"/blog/posts/{post['id']}/like")
    make_user(handle()).put(f"/blog/posts/{post['id']}/like")
    old, recent, unread = activity(author)["items"]
    author.post("/me/activity/read", json={"ids": [old["id"], recent["id"]]})
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE blog_notifications SET read_at = now() - interval '91 days', "
                "created_at = now() - interval '100 days' WHERE id = ANY(:ids)"
            ),
            {"ids": [old["id"], unread["id"]]},
        )
        conn.execute(
            text("UPDATE blog_notifications SET read_at = NULL WHERE id = :id"),
            {"id": unread["id"]},
        )
        assert purge_read_notifications(conn) >= 1
    assert sorted(i["id"] for i in activity(author)["items"]) == sorted(
        [recent["id"], unread["id"]]
    )


def test_account_deletion_removes_notifications_and_keeps_others_replies(
    make_user, groups, engine
) -> None:
    author = make_user(handle())
    post = create(author, catalogue(groups["none"]))
    url = f"/blog/posts/{post['id']}/comments"
    leaving = make_user(handle())
    staying = make_user(handle())
    root = leaving.post(url, json={"body": "Gốc của người sẽ xoá tài khoản"}).json()
    own_reply = leaving.post(url, json={"body": "Tự trả lời", "parent_id": root["id"]}).json()
    reply = staying.post(url, json={"body": "Trả lời của người ở lại", "parent_id": root["id"]})
    leaving.put(f"/blog/posts/{post['id']}/like")
    lone = leaving.post(url, json={"body": "Gốc không ai trả lời"}).json()
    # Liked, commented (root, own reply, the other's reply, lone).
    assert len(activity(author)["items"]) == 5
    assert kinds(leaving) == ["comment_replied"]

    deleted = leaving.request("DELETE", "/me", json={"confirm_email": leaving.email})
    assert deleted.status_code == 204
    with engine.connect() as conn:
        for sql in [
            "SELECT count(*) FROM blog_notifications WHERE recipient_id = :u",
            "SELECT count(*) FROM blog_notifications WHERE actor_id = :u",
            "SELECT count(*) FROM blog_comments WHERE author_id = :u",
            "SELECT count(*) FROM blog_comment_likes WHERE user_id = :u",
        ]:
            assert conn.execute(text(sql), {"u": leaving.user_id}).scalar_one() == 0, sql
        assert (
            conn.execute(
                text("SELECT count(*) FROM blog_comments WHERE id = ANY(:ids)"),
                {"ids": [own_reply["id"], lone["id"]]},
            ).scalar_one()
            == 0
        )
    # Only the notice caused by the user who stays is left.
    assert [i["comment_id"] for i in activity(author)["items"]] == [reply.json()["id"]]
    tree = staying.get(url).json()
    assert len(tree) == 1 and tree[0]["deleted"] and tree[0]["author"] is None
    assert [r["id"] for r in tree[0]["replies"]] == [reply.json()["id"]]


def test_export_includes_comment_likes_and_notifications(make_user, groups) -> None:
    author = make_user(handle())
    post = create(author, catalogue(groups["none"]))
    reader = make_user(handle())
    comment = reader.post(f"/blog/posts/{post['id']}/comments", json={"body": "Hay"}).json()
    author.put(f"/blog/comments/{comment['id']}/like")
    exported = author.get("/me/export").json()
    assert [x["comment_id"] for x in exported["comment_likes"]] == [comment["id"]]
    assert [n["kind"] for n in exported["notifications"]] == ["post_commented"]
    assert "actor_id" not in exported["notifications"][0]
    assert [n["kind"] for n in reader.get("/me/export").json()["notifications"]] == [
        "comment_liked"
    ]


def test_no_email_in_new_responses(make_user, groups) -> None:
    name = handle()
    author = make_user(name)
    reader = make_user(handle())
    post = create(author, catalogue(groups["niacinamide"]))
    create(author, catalogue(groups["niacinamide"]))
    url = f"/blog/posts/{post['id']}/comments"
    root = reader.post(url, json={"body": "Hay"}).json()
    author.post(url, json={"body": "Cảm ơn", "parent_id": root["id"]})
    author.put(f"/blog/comments/{root['id']}/like")
    reader.put(f"/blog/posts/{post['id']}/like")
    for client in (author, reader):
        for path in [
            "/blog/trending",
            "/blog/posts?q=cam+nhan",
            "/blog/posts?group=NIACINAMIDE",
            "/blog/posts?liked=true",
            url,
            "/me/activity",
        ]:
            body = client.get(path).text
            assert "@example.com" not in body, path
        assert "@example.com" not in client.post("/me/activity/read").text
