import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text

from app.moderation import REPORT_THRESHOLD

BODY = "Mình dùng sản phẩm này được ba tuần, da mềm hơn và ít bóng dầu vào buổi chiều."
ROUTINE = {
    "format": "skinwise-routine",
    "version": 1,
    "products": [
        {"key": "a", "name": "Serum", "productId": 1},
        {"key": "b", "name": "Tự dán", "inci": "Aqua, Glycerin"},
    ],
    "entries": [{"productKey": "a", "session": "PM", "days": [0, 2, 4]}],
}


def handle() -> str:
    return f"u_{uuid.uuid4().hex[:8]}"


@pytest.fixture(scope="module")
def product_ids(engine: Engine) -> list[int]:
    with engine.connect() as conn:
        return list(conn.execute(text("SELECT id FROM products ORDER BY id LIMIT 3")).scalars())


def post_body(product_ids: list[int], **change) -> dict:
    return {
        "title": "Cảm nhận sau ba tuần",
        "body": BODY,
        "rating": 4,
        "skin_type": "oily",
        "disclosure": "none",
        "products": [{"product_id": product_ids[0]}],
        "image_ids": [],
        "routine": None,
        **change,
    }


def create(client: TestClient, product_ids: list[int], **change) -> dict:
    response = client.post("/blog/posts", json=post_body(product_ids, **change))
    assert response.status_code == 201, response.text
    return response.json()


def test_every_route_needs_a_session(client: TestClient) -> None:
    for method, path in [
        ("GET", "/me/profile"),
        ("PUT", "/me/profile"),
        ("GET", "/blog/posts"),
        ("POST", "/blog/posts"),
        ("GET", "/blog/posts/1"),
        ("PUT", "/blog/posts/1"),
        ("DELETE", "/blog/posts/1"),
        ("PUT", "/blog/posts/1/like"),
        ("DELETE", "/blog/posts/1/save"),
        ("GET", "/blog/posts/1/comments"),
        ("POST", "/blog/posts/1/comments"),
        ("DELETE", "/blog/comments/1"),
        ("POST", "/blog/reports"),
        ("POST", "/blog/images"),
        ("GET", "/blog/images/1"),
        ("GET", "/blog/authors/someone"),
    ]:
        assert client.request(method, path).status_code == 401, (method, path)


def test_profile(make_user) -> None:
    me = make_user()
    assert me.get("/me/profile").json() == {"handle": None, "skin_type": None}
    name = handle()
    saved = me.put("/me/profile", json={"handle": f"  {name.upper()} ", "skin_type": "dry"})
    assert saved.status_code == 200
    assert saved.json() == {"handle": name, "skin_type": "dry"}
    assert me.get("/me/profile").json() == {"handle": name, "skin_type": "dry"}
    # Saving the same handle again is fine; another user taking it is not.
    assert me.put("/me/profile", json={"handle": name, "skin_type": None}).status_code == 200
    other = make_user()
    taken = other.put("/me/profile", json={"handle": name})
    assert taken.status_code == 409
    for bad in ["a", "x" * 31, "có dấu", "a b", "a-b", ""]:
        assert other.put("/me/profile", json={"handle": bad}).status_code == 422, bad
    assert other.put("/me/profile", json={"handle": handle(), "skin_type": "x"}).status_code == 422


def test_profile_is_required_to_write(make_user, product_ids) -> None:
    author = make_user(handle())
    post = create(author, product_ids)
    nobody = make_user()
    assert nobody.post("/blog/posts", json=post_body(product_ids)).json() == {
        "detail": "profile_required"
    }
    response = nobody.post(f"/blog/posts/{post['id']}/comments", json={"body": "Hay quá"})
    assert response.status_code == 403
    assert response.json()["detail"] == "profile_required"


def test_create_read_update_delete(make_user, product_ids, engine: Engine) -> None:
    name = handle()
    author = make_user(name, "oily")
    post = create(
        author,
        product_ids,
        products=[
            {"product_id": product_ids[0]},
            {"name": "Kem tự dán", "inci": "Aqua, Niacinamide"},
        ],
        routine=ROUTINE,
    )
    assert post["status"] == "visible" and post["is_mine"] and post["flags"] == []
    assert post["author"] == {"handle": name, "skin_type": "oily"}
    assert post["has_routine"] and post["routine"] == ROUTINE
    first, pasted = post["products"]
    assert first["product_id"] == product_ids[0] and first["brand"] and first["inci"] is None
    assert pasted == {
        "position": 2,
        "product_id": None,
        "name": "Kem tự dán",
        "brand": None,
        "inci": "Aqua, Niacinamide",
    }
    assert post["excerpt"] == BODY[:200] and post["cover"] is None
    assert not post["liked"] and not post["saved"]

    reader = make_user(handle())
    seen = reader.get(f"/blog/posts/{post['id']}").json()
    assert seen["is_mine"] is False and seen["title"] == post["title"]

    changed = author.put(
        f"/blog/posts/{post['id']}", json=post_body(product_ids, title="Tiêu đề mới hơn")
    )
    assert changed.status_code == 200
    assert changed.json()["title"] == "Tiêu đề mới hơn" and changed.json()["routine"] is None
    assert len(changed.json()["products"]) == 1

    other = reader.put(f"/blog/posts/{post['id']}", json=post_body(product_ids))
    assert other.status_code == 403
    assert reader.delete(f"/blog/posts/{post['id']}").status_code == 403

    assert author.delete(f"/blog/posts/{post['id']}").status_code == 204
    assert author.get(f"/blog/posts/{post['id']}").status_code == 404
    assert author.delete(f"/blog/posts/{post['id']}").status_code == 404
    with engine.connect() as conn:
        left = conn.execute(
            text("SELECT count(*) FROM blog_post_products WHERE post_id = :p"), {"p": post["id"]}
        )
        assert left.scalar_one() == 0


def test_post_validation(make_user, product_ids) -> None:
    author = make_user(handle())
    bad = [
        {"title": "abc"},
        {"body": "ngắn quá"},
        {"rating": 6},
        {"rating": 0},
        {"skin_type": "oilyish"},
        {"disclosure": "paid"},
        {"products": []},
        {"products": [{"product_id": product_ids[0]}] * 11},
        {"products": [{"name": "Chỉ có tên"}]},
        {"products": [{"product_id": product_ids[0], "name": "X", "inci": "Aqua"}]},
        {"products": [{"name": "X", "inci": "a" * 10_001}]},
        {"image_ids": [1, 2, 3, 4, 5]},
        {"image_ids": [7, 7]},
        {"routine": {**ROUTINE, "format": "other"}},
        {"routine": {**ROUTINE, "entries": [{"productKey": "z", "session": "AM", "days": [1]}]}},
        {
            "routine": {
                **ROUTINE,
                "products": [{"key": "a", "name": "Hai nguồn", "productId": 1, "inci": "Aqua"}],
            }
        },  # fmt: skip
    ]
    for change in bad:
        response = author.post("/blog/posts", json=post_body(product_ids, **change))
        assert response.status_code == 422, change
    unknown = author.post("/blog/posts", json=post_body(product_ids, products=[{"product_id": 0}]))
    assert unknown.status_code == 404
    assert author.get("/blog/posts/999999999").status_code == 404


def test_list_filters_and_sort(make_user, product_ids) -> None:
    a_name, b_name = handle(), handle()
    a = make_user(a_name)
    b = make_user(b_name)
    reader = make_user(handle())
    oily = create(a, product_ids, skin_type="oily", products=[{"product_id": product_ids[1]}])
    dry = create(b, product_ids, skin_type="dry", products=[{"product_id": product_ids[2]}])
    flagged = create(a, product_ids, body=BODY + " Gọi mình 0912 345 678 nhé.")
    assert flagged["status"] == "pending"

    def ids(**query) -> list[int]:
        response = reader.get("/blog/posts", params={"limit": 50, **query})
        assert response.status_code == 200
        return [p["id"] for p in response.json()["items"]]

    assert ids(author=a_name) == [oily["id"]]  # the pending post is left out
    assert reader.get("/blog/posts", params={"author": a_name}).json()["total"] == 1
    assert ids(author=b_name.upper()) == [dry["id"]]
    assert oily["id"] in ids(skin_type="oily") and dry["id"] not in ids(skin_type="oily")
    assert ids(product_id=product_ids[2], author=b_name) == [dry["id"]]
    assert ids(product_id=product_ids[2], author=a_name) == []
    assert ids(author="khong_co_ai") == []
    assert ids(saved=True) == []
    reader.put(f"/blog/posts/{dry['id']}/save")
    assert ids(saved=True) == [dry["id"]]
    assert ids(saved=False, author=a_name) == [oily["id"]]

    newest = ids()
    assert newest.index(dry["id"]) < newest.index(oily["id"])
    reader.put(f"/blog/posts/{oily['id']}/like")
    top = ids(sort="top")
    assert top.index(oily["id"]) < top.index(dry["id"])

    page = reader.get("/blog/posts", params={"limit": 1, "offset": 0}).json()
    assert len(page["items"]) == 1 and page["total"] >= 2
    for bad in [{"limit": 51}, {"limit": 0}, {"offset": -1}, {"sort": "old"}, {"skin_type": "x"}]:
        assert reader.get("/blog/posts", params=bad).status_code == 422, bad


def test_like_and_save_are_idempotent(make_user, product_ids) -> None:
    author = make_user(handle())
    post = create(author, product_ids)
    reader = make_user(handle())
    url = f"/blog/posts/{post['id']}"
    assert reader.put(f"{url}/like").json() == {"liked": True, "like_count": 1}
    assert reader.put(f"{url}/like").json() == {"liked": True, "like_count": 1}
    assert author.put(f"{url}/like").json() == {"liked": True, "like_count": 2}
    assert reader.delete(f"{url}/like").json() == {"liked": False, "like_count": 1}
    assert reader.delete(f"{url}/like").json() == {"liked": False, "like_count": 1}
    assert reader.put(f"{url}/save").json() == {"saved": True}
    assert reader.put(f"{url}/save").json() == {"saved": True}
    detail = reader.get(url).json()
    assert detail["saved"] and not detail["liked"] and detail["like_count"] == 1
    assert reader.delete(f"{url}/save").json() == {"saved": False}
    assert reader.put("/blog/posts/999999999/like").status_code == 404
    assert reader.put("/blog/posts/999999999/save").status_code == 404


def test_comments(make_user, product_ids) -> None:
    author = make_user(handle())
    post = create(author, product_ids)
    url = f"/blog/posts/{post['id']}/comments"
    reader_name = handle()
    reader = make_user(reader_name)
    assert reader.get(url).json() == []
    first = reader.post(url, json={"body": "  Cảm ơn bạn đã chia sẻ!  "})
    assert first.status_code == 201
    assert first.json()["body"] == "Cảm ơn bạn đã chia sẻ!"
    assert first.json()["author"]["handle"] == reader_name and first.json()["is_mine"]
    flagged = reader.post(url, json={"body": "Inbox mình qua zalo 0912345678"}).json()
    assert flagged["status"] == "pending" and flagged["flags"] == ["phone"]
    second = author.post(url, json={"body": "Chúc bạn da đẹp"}).json()

    assert [c["id"] for c in reader.get(url).json()] == [
        first.json()["id"],
        flagged["id"],
        second["id"],
    ]
    seen_by_author = author.get(url).json()
    assert [c["id"] for c in seen_by_author] == [first.json()["id"], second["id"]]
    assert all(c["flags"] == [] for c in seen_by_author)
    assert author.get(f"/blog/posts/{post['id']}").json()["comment_count"] == 2

    for bad in ["", "   ", "x" * 2001]:
        assert reader.post(url, json={"body": bad}).status_code == 422
    assert reader.post("/blog/posts/999999999/comments", json={"body": "a"}).status_code == 404
    assert author.delete(f"/blog/comments/{first.json()['id']}").status_code == 403
    assert reader.delete(f"/blog/comments/{first.json()['id']}").status_code == 204
    assert reader.delete(f"/blog/comments/{first.json()['id']}").status_code == 404
    assert author.delete(f"/blog/comments/{flagged['id']}").status_code == 404  # cannot see it


def test_pending_post_is_only_seen_by_its_author(make_user, product_ids) -> None:
    author = make_user(handle())
    post = create(author, product_ids, body=BODY + " Serum này trị mụn ẩn rất nhanh.")
    assert post["status"] == "pending" and post["flags"] == ["medical_claim"]
    reader = make_user(handle())
    url = f"/blog/posts/{post['id']}"
    assert reader.get(url).status_code == 404
    assert reader.put(f"{url}/like").status_code == 404
    assert reader.get(f"{url}/comments").status_code == 404
    assert reader.put(url, json=post_body(product_ids)).status_code == 404
    report = {"target_kind": "post", "target_id": post["id"], "reason": "other"}
    assert reader.post("/blog/reports", json=report).status_code == 404
    assert author.get(url).json()["flags"] == ["medical_claim"]

    # "giá trị" is not a claim; the clean edit shows the post again.
    fixed = author.put(url, json=post_body(product_ids, body=BODY + " Rất đáng giá trị."))
    assert fixed.json()["status"] == "visible" and fixed.json()["flags"] == []
    assert reader.get(url).status_code == 200
    # A flagged edit of a visible post waits again.
    again = author.put(url, json=post_body(product_ids, title="Mua ở shopabc.vn nhé"))
    assert again.json()["status"] == "pending" and again.json()["flags"] == ["link"]
    assert reader.get(url).status_code == 404


def test_reports_hide_after_three_people(make_user, product_ids) -> None:
    author = make_user(handle())
    post = create(author, product_ids)
    url = f"/blog/posts/{post['id']}"
    report = {"target_kind": "post", "target_id": post["id"], "reason": "advertising"}
    assert author.post("/blog/reports", json=report).status_code == 400
    readers = [make_user(handle()) for _ in range(REPORT_THRESHOLD)]
    for reader in readers[:-1]:
        assert reader.post("/blog/reports", json=report).status_code == 202
        assert reader.post("/blog/reports", json=report).json() == {}  # counted once
    assert readers[0].get(url).status_code == 200
    last = readers[-1].post("/blog/reports", json={**report, "note": "Quảng cáo"})
    assert last.status_code == 202
    assert readers[0].get(url).status_code == 404
    hidden = author.get(url).json()
    assert hidden["status"] == "hidden"
    assert post["id"] not in [p["id"] for p in readers[0].get("/blog/posts").json()["items"]]
    for bad in [
        {**report, "reason": "spam"},
        {**report, "target_kind": "user"},
        {**report, "note": "x" * 301},
    ]:
        assert readers[0].post("/blog/reports", json=bad).status_code == 422
    missing = {**report, "target_id": 999999999}
    assert readers[0].post("/blog/reports", json=missing).status_code == 404


def test_comment_reports(make_user, product_ids) -> None:
    author = make_user(handle())
    post = create(author, product_ids)
    commenter = make_user(handle())
    comment = commenter.post(
        f"/blog/posts/{post['id']}/comments", json={"body": "Bình luận bình thường"}
    ).json()
    report = {"target_kind": "comment", "target_id": comment["id"], "reason": "offensive"}
    assert commenter.post("/blog/reports", json=report).status_code == 400
    for _ in range(REPORT_THRESHOLD):
        assert make_user(handle()).post("/blog/reports", json=report).status_code == 202
    assert author.get(f"/blog/posts/{post['id']}/comments").json() == []
    mine = commenter.get(f"/blog/posts/{post['id']}/comments").json()
    assert [c["status"] for c in mine] == ["hidden"]


def test_author_page(make_user, product_ids) -> None:
    name = handle()
    author = make_user(name, "sensitive")
    visible = create(author, product_ids)
    create(author, product_ids, body=BODY + " Chữa khỏi mụn luôn.")
    page = make_user(handle()).get(f"/blog/authors/{name}").json()
    assert page["handle"] == name and page["skin_type"] == "sensitive"
    assert page["post_count"] == 1 and [p["id"] for p in page["posts"]] == [visible["id"]]
    assert author.get("/blog/authors/khong_co_ai_ca").status_code == 404


def test_no_email_in_any_blog_response(make_user, product_ids) -> None:
    name = handle()
    author = make_user(name)
    reader = make_user(handle())
    post = create(author, product_ids, routine=ROUTINE)
    reader.post(f"/blog/posts/{post['id']}/comments", json={"body": "Hay"})
    author.post(f"/blog/posts/{post['id']}/comments", json={"body": "Cảm ơn"})
    for client in (author, reader):
        for path in [
            "/blog/posts",
            f"/blog/posts/{post['id']}",
            f"/blog/posts/{post['id']}/comments",
            f"/blog/authors/{name}",
            "/me/profile",
        ]:
            body = client.get(path).text
            assert author.email not in body and reader.email not in body, path
            assert "@example.com" not in body, path


def test_export_and_account_deletion(make_user, product_ids, engine: Engine) -> None:
    name = handle()
    author = make_user(name, "dry")
    reader = make_user(handle())
    post = create(author, product_ids, routine=ROUTINE)
    theirs = create(reader, product_ids)
    author.post(f"/blog/posts/{theirs['id']}/comments", json={"body": "Bình luận của mình"})
    author.put(f"/blog/posts/{theirs['id']}/like")
    author.put(f"/blog/posts/{theirs['id']}/save")
    author.post(
        "/blog/reports", json={"target_kind": "post", "target_id": theirs["id"], "reason": "other"}
    )
    reader.post(f"/blog/posts/{post['id']}/comments", json={"body": "Bình luận người khác"})
    reader.post(
        "/blog/reports", json={"target_kind": "post", "target_id": post["id"], "reason": "other"}
    )

    exported = author.get("/me/export").json()
    assert exported["profile"] == {"handle": name, "skin_type": "dry"}
    assert [p["id"] for p in exported["posts"]] == [post["id"]]
    assert exported["posts"][0]["routine"] == ROUTINE
    assert [c["body"] for c in exported["comments"]] == ["Bình luận của mình"]
    assert [x["post_id"] for x in exported["likes"]] == [theirs["id"]]
    assert [x["post_id"] for x in exported["saves"]] == [theirs["id"]]
    assert [r["target_id"] for r in exported["reports"]] == [theirs["id"]]
    assert exported["images"] == []

    deleted = author.request("DELETE", "/me", json={"confirm_email": author.email})
    assert deleted.status_code == 204
    with engine.connect() as conn:

        def count(sql: str) -> int:
            return conn.execute(text(sql), {"u": author.user_id, "p": post["id"]}).scalar_one()

        assert count("SELECT count(*) FROM user_profiles WHERE user_id = :u") == 0
        assert count("SELECT count(*) FROM blog_posts WHERE author_id = :u") == 0
        assert count("SELECT count(*) FROM blog_comments WHERE author_id = :u") == 0
        assert count("SELECT count(*) FROM blog_comments WHERE post_id = :p") == 0
        assert count("SELECT count(*) FROM blog_likes WHERE user_id = :u") == 0
        assert count("SELECT count(*) FROM blog_saves WHERE user_id = :u") == 0
        assert count("SELECT count(*) FROM blog_reports WHERE reporter_id = :u") == 0
        # Others' reports about the deleted posts go too.
        assert (
            count("SELECT count(*) FROM blog_reports WHERE target_kind = 'post' AND target_id = :p")
            == 0
        )
    assert reader.get(f"/blog/posts/{theirs['id']}").json()["like_count"] == 0


def test_rating_average_covers_every_matching_post(make_user, product_ids) -> None:
    name = handle()
    author = make_user(name)
    reader = make_user(handle())
    for rating in (5, 4, None, 2):
        create(author, product_ids, rating=rating)
    create(author, product_ids, rating=1, body=BODY + " Trị mụn luôn.")  # pending: left out
    page = reader.get("/blog/posts", params={"author": name, "limit": 1}).json()
    assert len(page["items"]) == 1 and page["total"] == 4
    assert page["rating_count"] == 3 and page["rating_avg"] == pytest.approx(11 / 3, abs=0.01)
    empty = reader.get("/blog/posts", params={"author": "khong_co_ai"}).json()
    assert empty == {"items": [], "total": 0, "rating_avg": None, "rating_count": 0}


def test_routine_round_trips_as_a_routine_file(make_user, product_ids) -> None:
    """GET returns the routine exactly as frontend share.ts writes it: camelCase keys, and a
    product has productId or inci, never the other as null."""
    author = make_user(handle())
    post = create(author, product_ids, routine=ROUTINE)
    for response in (post, author.get(f"/blog/posts/{post['id']}").json()):
        routine = response["routine"]
        assert routine == ROUTINE
        seeded, pasted = routine["products"]
        assert set(seeded) == {"key", "name", "productId"}
        assert set(pasted) == {"key", "name", "inci"}
        assert set(routine["entries"][0]) == {"productKey", "session", "days"}
    exported = author.get("/me/export").json()
    assert exported["posts"][0]["routine"] == ROUTINE


def test_routine_blank_ingredient_list_is_refused(make_user, product_ids) -> None:
    author = make_user(handle())
    blank = {
        **ROUTINE,
        "products": [{"key": "a", "name": "Trống", "inci": "   \n "}],
        "entries": [],
    }
    assert author.post("/blog/posts", json=post_body(product_ids, routine=blank)).status_code == 422
    # Beside a productId a blank list is simply dropped, as share.ts does.
    seeded = {
        **ROUTINE,
        "products": [{"key": "a", "name": "Serum", "productId": 1, "inci": "  "}],
        "entries": [],
    }
    post = create(author, product_ids, routine=seeded)
    assert post["routine"]["products"] == [{"key": "a", "name": "Serum", "productId": 1}]


def test_comment_on_a_missing_post_without_a_profile_is_404(make_user) -> None:
    nobody = make_user()
    response = nobody.post("/blog/posts/999999999/comments", json={"body": "Chào"})
    assert response.status_code == 404


def test_product_and_routine_names_are_flagged(make_user, product_ids) -> None:
    author = make_user(handle())
    pasted = create(
        author, product_ids, products=[{"name": "Serum zalo 0912 345 678", "inci": "Aqua"}]
    )
    assert pasted["status"] == "pending" and pasted["flags"] == ["phone"]
    routine = {
        **ROUTINE,
        "products": [{"key": "a", "name": "Mua ở 0912.345.678", "productId": 1}],
        "entries": [],
    }
    with_routine = create(author, product_ids, routine=routine)
    assert with_routine["status"] == "pending" and with_routine["flags"] == ["phone"]
