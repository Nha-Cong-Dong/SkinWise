import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text

from app.moderation import REPORT_THRESHOLD
from app.reviewers import set_reviewer

NAME, PASSWORD = "Người duyệt blog", "mat-khau-duyet-blog"
BODY = "Mình dùng sản phẩm này được ba tuần, da mềm hơn và ít bóng dầu vào buổi chiều."


@pytest.fixture(scope="module")
def reviewer(engine: Engine) -> Iterator[str]:
    with engine.begin() as conn:
        set_reviewer(conn, NAME, PASSWORD)
    yield NAME
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM reviewers WHERE name = :n"), {"n": NAME})


@pytest.fixture
def auth(client: TestClient, reviewer: str) -> dict[str, str]:
    response = client.post("/review/login", json={"name": NAME, "password": PASSWORD})
    return {"Authorization": f"Bearer {response.json()['token']}"}


@pytest.fixture(scope="module")
def product_id(engine: Engine) -> int:
    with engine.connect() as conn:
        return conn.execute(text("SELECT min(id) FROM products")).scalar_one()


def handle() -> str:
    return f"r_{uuid.uuid4().hex[:8]}"


def create(client: TestClient, product_id: int, body: str = BODY) -> dict:
    response = client.post(
        "/blog/posts",
        json={
            "title": "Bài review thử",
            "body": body,
            "disclosure": "gifted",
            "products": [{"product_id": product_id}],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_queue_needs_a_reviewer(client: TestClient, make_user) -> None:
    assert client.get("/review/blog").status_code == 401
    assert client.post("/review/blog/post/1", json={"action": "approve"}).status_code == 401
    # A user's session is not a reviewer token.
    user = make_user(handle())
    assert user.get("/review/blog").status_code == 401
    bad = {"Authorization": "Bearer not-a-token"}
    assert client.get("/review/blog", headers=bad).status_code == 401


def test_approve_a_flagged_post(client: TestClient, auth, make_user, product_id) -> None:
    name = handle()
    author = make_user(name)
    reader = make_user(handle())
    post = create(author, product_id, BODY + " Kem này trị mụn tốt lắm.")
    queue = client.get("/review/blog", params={"status": "pending"}, headers=auth).json()
    item = next(i for i in queue if i["kind"] == "post" and i["id"] == post["id"])
    assert item == {
        "kind": "post",
        "id": post["id"],
        "post_id": post["id"],
        "title": "Bài review thử",
        "body": BODY + " Kem này trị mụn tốt lắm.",
        "author": name,
        "status": "pending",
        "flags": ["medical_claim"],
        "report_count": 0,
        "report_reasons": [],
        "report_notes": [],
        "images": [],
        "created_at": item["created_at"],
    }
    assert reader.get(f"/blog/posts/{post['id']}").status_code == 404

    approved = client.post(
        f"/review/blog/post/{post['id']}", json={"action": "approve"}, headers=auth
    )
    assert approved.status_code == 200 and approved.json()["status"] == "visible"
    assert reader.get(f"/blog/posts/{post['id']}").status_code == 200
    pending = client.get("/review/blog", params={"status": "pending"}, headers=auth).json()
    assert post["id"] not in [i["id"] for i in pending if i["kind"] == "post"]


def test_remove_a_reported_comment_then_reports_restart(
    client: TestClient, auth, make_user, product_id
) -> None:
    author = make_user(handle())
    post = create(author, product_id)
    commenter_name = handle()
    commenter = make_user(commenter_name)
    comment = commenter.post(
        f"/blog/posts/{post['id']}/comments", json={"body": "Một bình luận"}
    ).json()
    report = {"target_kind": "comment", "target_id": comment["id"], "reason": "offensive"}
    for _ in range(REPORT_THRESHOLD):
        make_user(handle()).post("/blog/reports", json=report)
    hidden = client.get("/review/blog", params={"status": "hidden"}, headers=auth).json()
    item = next(i for i in hidden if i["kind"] == "comment" and i["id"] == comment["id"])
    assert item["post_id"] == post["id"] and item["title"] is None
    assert item["author"] == commenter_name
    assert item["report_count"] == REPORT_THRESHOLD and item["report_reasons"] == ["offensive"]

    approved = client.post(
        f"/review/blog/comment/{comment['id']}", json={"action": "approve"}, headers=auth
    ).json()
    assert approved["status"] == "visible" and approved["report_count"] == 0
    # Reports before the decision no longer count: one new report does not hide it again.
    make_user(handle()).post("/blog/reports", json=report)
    assert len(author.get(f"/blog/posts/{post['id']}/comments").json()) == 1

    removed = client.post(
        f"/review/blog/comment/{comment['id']}", json={"action": "remove"}, headers=auth
    )
    assert removed.json()["status"] == "removed"
    assert author.get(f"/blog/posts/{post['id']}/comments").json() == []
    assert commenter.get(f"/blog/posts/{post['id']}/comments").json() == []


def test_removed_post_is_seen_by_nobody(client: TestClient, auth, make_user, product_id) -> None:
    author = make_user(handle())
    post = create(author, product_id)
    removed = client.post(
        f"/review/blog/post/{post['id']}", json={"action": "remove"}, headers=auth
    )
    assert removed.json()["status"] == "removed"
    assert author.get(f"/blog/posts/{post['id']}").status_code == 404


def test_moderate_errors(client: TestClient, auth) -> None:
    assert (
        client.post("/review/blog/post/999999999", json={"action": "approve"}, headers=auth)
    ).status_code == 404
    assert (
        client.post("/review/blog/user/1", json={"action": "approve"}, headers=auth)
    ).status_code == 422
    assert (
        client.post("/review/blog/post/1", json={"action": "publish"}, headers=auth)
    ).status_code == 422
    assert client.get("/review/blog", params={"status": "visible"}, headers=auth).status_code == 422


def test_author_can_delete_removed_writing(
    client: TestClient, auth, make_user, product_id, upload_dir, engine: Engine
) -> None:
    """The right to delete wins: removed content stays deletable by its author (with files)."""
    from io import BytesIO

    from PIL import Image

    author = make_user(handle())
    other = make_user(handle())
    png = BytesIO()
    Image.new("RGB", (8, 8)).save(png, "PNG")
    image = author.post("/blog/images", files={"file": ("a.png", png.getvalue())}).json()
    post = author.post(
        "/blog/posts",
        json={
            "title": "Bài sẽ bị gỡ",
            "body": BODY,
            "disclosure": "none",
            "products": [{"product_id": product_id}],
            "image_ids": [image["id"]],
        },
    ).json()
    comment = other.post(f"/blog/posts/{post['id']}/comments", json={"body": "Bình luận"}).json()
    for kind, item in (("post", post["id"]), ("comment", comment["id"])):
        client.post(f"/review/blog/{kind}/{item}", json={"action": "remove"}, headers=auth)
    assert author.get(f"/blog/posts/{post['id']}").status_code == 404  # still hidden from all
    assert other.delete(f"/blog/posts/{post['id']}").status_code == 404
    assert author.delete(f"/blog/comments/{comment['id']}").status_code == 404

    assert other.delete(f"/blog/comments/{comment['id']}").status_code == 204
    assert len(list(upload_dir.iterdir())) == 1
    assert author.delete(f"/blog/posts/{post['id']}").status_code == 204
    assert list(upload_dir.iterdir()) == []
    with engine.connect() as conn:
        for table, ident in (("blog_posts", post["id"]), ("blog_comments", comment["id"])):
            left = conn.execute(text(f"SELECT count(*) FROM {table} WHERE id = :i"), {"i": ident})
            assert left.scalar_one() == 0, table


def test_queue_shows_images_and_report_notes(
    client: TestClient, auth, make_user, product_id, upload_dir
) -> None:
    from io import BytesIO

    from PIL import Image

    author = make_user(handle())
    png = BytesIO()
    Image.new("RGB", (8, 8)).save(png, "PNG")
    upload = author.post(
        "/blog/images", files={"file": ("a.png", png.getvalue())}, data={"caption": "Ảnh tay"}
    ).json()
    unattached = author.post("/blog/images", files={"file": ("b.png", png.getvalue())}).json()
    post = author.post(
        "/blog/posts",
        json={
            "title": "Bài có ảnh bị báo cáo",
            "body": BODY,
            "disclosure": "none",
            "products": [{"product_id": product_id}],
            "image_ids": [upload["id"]],
        },
    ).json()
    notes = ["Ảnh có số điện thoại", None, "Quảng cáo"]
    for note in notes:
        report = {"target_kind": "post", "target_id": post["id"], "reason": "personal_info"}
        assert (
            make_user(handle()).post("/blog/reports", json={**report, "note": note}).status_code
            == 202
        )
    hidden = client.get("/review/blog", params={"status": "hidden"}, headers=auth).json()
    item = next(i for i in hidden if i["kind"] == "post" and i["id"] == post["id"])
    assert item["images"] == [{"id": upload["id"], "caption": "Ảnh tay"}]
    assert item["report_notes"] == ["Ảnh có số điện thoại", "Quảng cáo"]

    url = f"/review/blog/images/{upload['id']}"
    assert client.get(url).status_code == 401
    assert client.get(url, headers={"Authorization": "Bearer nope"}).status_code == 401
    assert author.get(url).status_code == 401  # a user session is not a reviewer token
    served = client.get(url, headers=auth)
    assert served.status_code == 200 and served.headers["content-type"] == "image/webp"
    # Removed posts too, so the reviewer can still check what was reported.
    client.post(f"/review/blog/post/{post['id']}", json={"action": "remove"}, headers=auth)
    assert client.get(url, headers=auth).status_code == 200
    assert client.get(f"/review/blog/images/{unattached['id']}", headers=auth).status_code == 404
    assert client.get("/review/blog/images/999999999", headers=auth).status_code == 404


def test_comment_items_have_no_images(client: TestClient, auth, make_user, product_id) -> None:
    author = make_user(handle())
    post = create(author, product_id)
    comment = author.post(
        f"/blog/posts/{post['id']}/comments", json={"body": "Gọi 0912345678"}
    ).json()
    pending = client.get("/review/blog", params={"status": "pending"}, headers=auth).json()
    item = next(i for i in pending if i["kind"] == "comment" and i["id"] == comment["id"])
    assert item["images"] == [] and item["report_notes"] == []
