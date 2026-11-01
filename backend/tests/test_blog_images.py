import uuid
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import Engine, text

from app import images
from app.images import MAX_BYTES, parse_multipart

BODY = "Mình dùng sản phẩm này được ba tuần, da mềm hơn và ít bóng dầu vào buổi chiều."
GPS_IFD = 0x8825


def handle() -> str:
    return f"i_{uuid.uuid4().hex[:8]}"


def jpeg_with_gps(size: tuple[int, int] = (64, 48)) -> bytes:
    image = Image.new("RGB", size, (200, 120, 90))
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"  # Make
    gps = exif.get_ifd(GPS_IFD)
    gps[1] = "N"
    gps[2] = (21.0, 1.0, 30.0)  # latitude
    gps[3] = "E"
    gps[4] = (105.0, 51.0, 0.0)
    out = BytesIO()
    image.save(out, "JPEG", exif=exif)
    data = out.getvalue()
    with Image.open(BytesIO(data)) as check:  # the test image really carries a position
        assert check.getexif().get_ifd(GPS_IFD)
    return data


def png_bytes(mode: str = "RGBA", size: tuple[int, int] = (10, 10)) -> bytes:
    out = BytesIO()
    Image.new(mode, size).save(out, "PNG")
    return out.getvalue()


def upload(client: TestClient, data: bytes, caption: str | None = None, name: str = "a.jpg"):
    form = {"caption": caption} if caption is not None else None
    return client.post("/blog/images", files={"file": (name, data, "image/jpeg")}, data=form)


@pytest.fixture(scope="module")
def product_id(engine: Engine) -> int:
    with engine.connect() as conn:
        return conn.execute(text("SELECT min(id) FROM products")).scalar_one()


def post_body(product_id: int, image_ids: list[int], **change) -> dict:
    return {
        "title": "Bài có ảnh",
        "body": BODY,
        "disclosure": "none",
        "products": [{"product_id": product_id}],
        "image_ids": image_ids,
        **change,
    }


def files_in(upload_dir) -> set[str]:
    return {p.name for p in upload_dir.iterdir()} if upload_dir.exists() else set()


def test_upload_strips_exif_and_reencodes_as_webp(make_user, upload_dir) -> None:
    user = make_user(handle())
    response = upload(user, jpeg_with_gps(), caption="  Kết cấu serum  ", name="../../evil.jpg")
    assert response.status_code == 201, response.text
    image = response.json()
    assert image["url"] == f"/blog/images/{image['id']}"
    assert (image["width"], image["height"], image["caption"]) == (64, 48, "Kết cấu serum")
    [stored] = files_in(upload_dir)
    assert stored.endswith(".webp") and "evil" not in stored
    with Image.open(upload_dir / stored) as saved:
        assert saved.format == "WEBP"
        assert not saved.getexif()
        assert "exif" not in saved.info and "xmp" not in saved.info
        assert "icc_profile" not in saved.info or not saved.info["icc_profile"]
    raw = (upload_dir / stored).read_bytes()
    assert b"EXIF" not in raw and b"PhoneMaker" not in raw

    served = user.get(image["url"])
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/webp"
    assert served.headers["cache-control"].startswith("private")
    assert served.content == raw


def test_large_images_are_shrunk_and_transparency_flattened(make_user, upload_dir) -> None:
    user = make_user(handle())
    big = BytesIO()
    Image.new("RGB", (3200, 1000), (10, 20, 30)).save(big, "PNG")
    image = upload(user, big.getvalue()).json()
    assert (image["width"], image["height"]) == (1600, 500)
    transparent = upload(user, png_bytes("RGBA")).json()
    assert transparent["width"] == 10


def test_not_an_image_is_415(make_user) -> None:
    user = make_user(handle())
    assert upload(user, b"%PDF-1.4 not an image").status_code == 415
    assert upload(user, jpeg_with_gps()[:200]).status_code == 415  # truncated
    gif = BytesIO()
    Image.new("RGB", (5, 5)).save(gif, "GIF")
    assert upload(user, gif.getvalue()).status_code == 415


def test_too_large_is_413(make_user, upload_dir) -> None:
    user = make_user(handle())
    assert upload(user, b"\xff" * (MAX_BYTES + 1)).status_code == 413
    assert files_in(upload_dir) == set()


def test_bad_form_is_422(make_user) -> None:
    user = make_user(handle())
    assert user.post("/blog/images", data={"caption": "không có tệp"}).status_code == 422
    assert user.post("/blog/images", content=b"abc").status_code == 422
    assert upload(user, png_bytes(), caption="x" * 201).status_code == 422


def test_upload_rate_limit(make_user, monkeypatch) -> None:
    from app import blog

    user = make_user(handle())
    monkeypatch.setattr(blog, "_image_uploads", blog.RateLimit({"email": (2, 3600.0)}))
    assert upload(user, png_bytes()).status_code == 201
    assert upload(user, png_bytes()).status_code == 201
    assert upload(user, png_bytes()).status_code == 429


def test_images_of_others_cannot_be_attached(make_user, product_id) -> None:
    author = make_user(handle())
    other = make_user(handle())
    theirs = upload(other, png_bytes()).json()
    response = author.post("/blog/posts", json=post_body(product_id, [theirs["id"]]))
    assert response.status_code == 422
    mine = upload(author, png_bytes()).json()
    first = author.post("/blog/posts", json=post_body(product_id, [mine["id"]])).json()
    # Already on another post.
    again = author.post("/blog/posts", json=post_body(product_id, [mine["id"]]))
    assert again.status_code == 422
    assert first["cover"]["id"] == mine["id"]
    # Not attached yet: only its owner may see it.
    assert other.get(f"/blog/images/{theirs['id']}").status_code == 200
    assert author.get(f"/blog/images/{theirs['id']}").status_code == 404
    assert author.get("/blog/images/999999999").status_code == 404


def test_images_follow_the_post(make_user, product_id, upload_dir, engine: Engine) -> None:
    author = make_user(handle())
    reader = make_user(handle())
    a, b, c = (upload(author, png_bytes("RGB"), caption=f"Ảnh {n}").json() for n in "abc")
    post = author.post("/blog/posts", json=post_body(product_id, [b["id"], a["id"]])).json()
    assert [i["id"] for i in post["images"]] == [b["id"], a["id"]]
    assert post["cover"]["id"] == b["id"]
    listed = reader.get("/blog/posts", params={"author": post["author"]["handle"]}).json()
    assert listed["items"][0]["cover"]["id"] == b["id"]
    assert reader.get(a["url"]).status_code == 200
    assert len(files_in(upload_dir)) == 3

    # Leaving image a out of the edit deletes it, with its file.
    edited = author.put(
        f"/blog/posts/{post['id']}", json=post_body(product_id, [c["id"], b["id"]])
    ).json()
    assert [i["id"] for i in edited["images"]] == [c["id"], b["id"]]
    assert reader.get(a["url"]).status_code == 404
    assert len(files_in(upload_dir)) == 2

    # Deleting the post deletes the rest.
    assert author.delete(f"/blog/posts/{post['id']}").status_code == 204
    assert files_in(upload_dir) == set()
    with engine.connect() as conn:
        left = conn.execute(
            text("SELECT count(*) FROM blog_images WHERE id = ANY(:ids)"),
            {"ids": [a["id"], b["id"], c["id"]]},
        )
        assert left.scalar_one() == 0


def test_images_of_a_pending_post_are_hidden(make_user, product_id) -> None:
    author = make_user(handle())
    reader = make_user(handle())
    image = upload(author, png_bytes("RGB")).json()
    post = author.post(
        "/blog/posts", json=post_body(product_id, [image["id"]], body=BODY + " Trị mụn tốt.")
    ).json()
    assert post["status"] == "pending"
    assert author.get(image["url"]).status_code == 200
    assert reader.get(image["url"]).status_code == 404


def test_a_caption_with_a_phone_number_holds_the_post(make_user, product_id) -> None:
    author = make_user(handle())
    image = upload(author, png_bytes("RGB"), caption="Mua ở 0912 345 678").json()
    post = author.post("/blog/posts", json=post_body(product_id, [image["id"]])).json()
    assert post["status"] == "pending" and post["flags"] == ["phone"]


def test_account_deletion_removes_files(make_user, product_id, upload_dir) -> None:
    author = make_user(handle())
    attached = upload(author, png_bytes("RGB")).json()
    upload(author, png_bytes("RGB"))  # never attached
    author.post("/blog/posts", json=post_body(product_id, [attached["id"]]))
    assert len(files_in(upload_dir)) == 2
    deleted = author.request("DELETE", "/me", json={"confirm_email": author.email})
    assert deleted.status_code == 204
    assert files_in(upload_dir) == set()


def test_stale_uploads_are_removed(make_user, upload_dir, engine: Engine) -> None:
    user = make_user(handle())
    old = upload(user, png_bytes("RGB")).json()
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE blog_images SET created_at = now() - interval '25 hours' WHERE id = :i"),
            {"i": old["id"]},
        )
    upload(user, png_bytes("RGB"))
    assert user.get(old["url"]).status_code == 404
    assert len(files_in(upload_dir)) == 1


def test_export_lists_images_without_content(make_user) -> None:
    user = make_user(handle())
    image = upload(user, png_bytes("RGB"), caption="Chú thích").json()
    exported = user.get("/me/export").json()
    [listed] = exported["images"]
    assert listed["id"] == image["id"] and listed["caption"] == "Chú thích"
    assert set(listed) == {"id", "post_id", "caption", "created_at"}


def test_parse_multipart_keeps_binary_bytes() -> None:
    payload = bytes(range(256)) * 3 + b"\r\n--not-the-boundary\r\n"
    body = (
        b"--XyZ\r\n"
        b'Content-Disposition: form-data; name="file"; filename="a.bin"\r\n'
        b"Content-Type: application/octet-stream\r\n\r\n" + payload + b"\r\n"
        b'--XyZ\r\nContent-Disposition: form-data; name="caption"\r\n\r\n'
        + "xin chào".encode()
        + b"\r\n--XyZ--\r\n"
    )
    fields = parse_multipart("multipart/form-data; boundary=XyZ", body)
    assert fields["file"] == payload
    assert fields["caption"].decode() == "xin chào"
    with pytest.raises(images.BadForm):
        parse_multipart("application/json", body)


def test_multi_frame_jpeg_from_phones_is_accepted(make_user, upload_dir) -> None:
    """MPO: a JPEG with several frames (iPhone HDR, Samsung); the first frame is kept."""
    user = make_user(handle())
    out = BytesIO()
    first = Image.new("RGB", (40, 30), (250, 0, 0))
    first.save(out, "MPO", save_all=True, append_images=[Image.new("RGB", (40, 30), (0, 0, 250))])
    with Image.open(BytesIO(out.getvalue())) as check:
        assert check.format == "MPO" and check.n_frames == 2
    response = upload(user, out.getvalue())
    assert response.status_code == 201, response.text
    [stored] = files_in(upload_dir)
    with Image.open(upload_dir / stored) as saved:
        red, green, blue = saved.convert("RGB").getpixel((20, 15))
        assert red > 200 and blue < 50


def test_too_many_pixels_is_refused_with_its_own_detail(make_user, monkeypatch) -> None:
    user = make_user(handle())
    monkeypatch.setattr(images, "MAX_PIXELS", 100)
    response = upload(user, png_bytes("RGB", (20, 20)))
    assert response.status_code == 415
    assert response.json()["detail"] == "image too large in pixels"
    assert upload(user, b"not an image").json()["detail"] == "not a JPEG, PNG or WebP image"


def test_phone_sized_photos_pass_the_pixel_cap() -> None:
    assert images.MAX_PIXELS >= 50_000_000  # 48-50 MP phone cameras


def test_pixel_cap_is_checked_from_the_header(monkeypatch) -> None:
    """The explicit check refuses just above the cap, where Pillow itself only warns."""
    import warnings

    monkeypatch.setattr(images, "MAX_PIXELS", 399)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # whatever the warning filters, the check holds
        with pytest.raises(images.TooManyPixels):
            images.process(png_bytes("RGB", (20, 20)))  # 400 pixels
    monkeypatch.setattr(images, "MAX_PIXELS", 400)
    assert images.process(png_bytes("RGB", (20, 20))).width == 20


def _request(headers: dict[str, str], chunks: list[bytes]):
    from starlette.requests import Request

    messages = [
        {"type": "http.request", "body": c, "more_body": i < len(chunks) - 1}
        for i, c in enumerate(chunks)
    ]

    async def receive():
        return messages.pop(0)

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/blog/images",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
    }
    return Request(scope, receive)


def test_read_limited_stops_a_chunked_body_past_the_limit() -> None:
    import asyncio

    from fastapi import HTTPException

    from app.blog_api import _read_limited

    limit = MAX_BYTES + images.MULTIPART_OVERHEAD
    chunk = b"x" * (1024 * 1024)
    chunked = _request({"transfer-encoding": "chunked"}, [chunk] * 6)  # no Content-Length
    with pytest.raises(HTTPException) as e:
        asyncio.run(_read_limited(chunked, limit))
    assert e.value.status_code == 413
    small = _request({"transfer-encoding": "chunked"}, [b"abc", b"def"])
    assert asyncio.run(_read_limited(small, limit)) == b"abcdef"


def test_read_limited_trusts_a_large_content_length_to_refuse() -> None:
    import asyncio

    from fastapi import HTTPException

    from app.blog_api import _read_limited

    declared = _request({"content-length": str(MAX_BYTES + 10**6)}, [b""])
    with pytest.raises(HTTPException) as e:
        asyncio.run(_read_limited(declared, MAX_BYTES + images.MULTIPART_OVERHEAD))
    assert e.value.status_code == 413


def test_upload_over_5_mb_without_content_length_is_413(make_user, upload_dir) -> None:
    user = make_user(handle())
    boundary = "b0undary"
    head = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\n\r\n'
    ).encode()

    def body():
        yield head
        for _ in range(6):
            yield b"\xff" * (1024 * 1024)
        yield f"\r\n--{boundary}--\r\n".encode()

    response = user.post(
        "/blog/images",
        content=body(),
        headers={"content-type": f"multipart/form-data; boundary={boundary}"},
    )
    assert response.status_code == 413
    assert files_in(upload_dir) == set()
