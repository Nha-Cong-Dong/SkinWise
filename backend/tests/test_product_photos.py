"""Product photos: checked Open Beauty Facts images of sample products, and users' own photos
of products they typed in (_workspace/feature-product-photos/01_spec.md). No network here."""

import json
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import Engine, text

from app import product_images as pi
from app import product_photos
from scripts import fetch_product_images as script


def png(color: tuple[int, int, int] = (200, 120, 90), size: tuple[int, int] = (40, 30)) -> bytes:
    out = BytesIO()
    Image.new("RGB", size, color).save(out, "PNG")
    return out.getvalue()


# --- Catalogue images ---


@pytest.fixture
def image_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "product_images"
    path.mkdir()
    monkeypatch.setattr(pi, "IMAGE_DIR", path)
    monkeypatch.setattr(pi, "TOML_PATH", tmp_path / "product_images.toml")
    return path


@pytest.fixture
def two_products(engine: Engine) -> list[tuple[int, str]]:
    with engine.connect() as conn:
        return [
            (r.id, r.slug)
            for r in conn.execute(text("SELECT id, slug FROM products ORDER BY id LIMIT 2"))
        ]


def entry(slug: str, data: bytes, checked: bool) -> dict:
    return {
        "slug": slug,
        "barcode": "3600000000000",
        "source_url": "https://world.openbeautyfacts.org/product/3600000000000",
        "image_url": "https://images.openbeautyfacts.org/x/front_en.1.full.jpg",
        "license": pi.LICENSE,
        "fetched_at": datetime(2026, 11, 7, tzinfo=UTC),
        "sha256": pi.sha256_of(data),
        "checked": checked,
    }


@pytest.fixture
def seeded_images(engine: Engine, image_dir: Path, two_products) -> Iterator[list[dict]]:
    """The first product has a checked image, the second an unchecked one."""
    entries = []
    for (_, slug), checked in zip(two_products, [True, False], strict=True):
        data = pi.images.process(png(), max_side=pi.MAX_SIDE).data
        pi.image_path(slug).write_bytes(data)
        entries.append(entry(slug, data, checked))
    with engine.begin() as conn:
        assert pi.seed_product_images(conn, entries) == 1
    yield entries
    with engine.begin() as conn:
        pi.seed_product_images(conn, pi.load_entries())  # back to the real file


def test_only_checked_images_reach_the_api(client: TestClient, seeded_images, two_products):
    (checked_id, checked_slug), (unchecked_id, unchecked_slug) = two_products
    detail = client.get(f"/products/{checked_id}").json()
    image = detail["image"]
    assert image == {
        "url": f"/product-images/{checked_slug}.webp?v={seeded_images[0]['sha256'][:12]}",
        "credit_vi": "Ảnh: Open Beauty Facts (CC BY-SA 3.0)",
        "source_url": "https://world.openbeautyfacts.org/product/3600000000000",
        "license_url": "https://creativecommons.org/licenses/by-sa/3.0/",
    }
    assert client.get(f"/products/{unchecked_id}").json()["image"] is None
    listed = {p["id"]: p["image"] for p in client.get("/products?limit=100").json()}
    assert listed[checked_id] == image and listed[unchecked_id] is None

    served = client.get(image["url"])
    assert served.status_code == 200 and served.headers["content-type"] == "image/webp"
    assert "immutable" in served.headers["cache-control"]
    assert client.get(f"/product-images/{unchecked_slug}.webp").status_code == 404
    assert client.get("/product-images/no-such-product.webp").status_code == 404
    for bad in ["..%2F..%2Fschema", "%00", "A-B", "a%20b"]:
        assert client.get(f"/product-images/{bad}.webp").status_code in (404, 422), bad
    assert client.get("/product-images/%00.webp").status_code == 422


def test_a_file_replaced_after_seeding_is_not_served(
    client: TestClient, seeded_images, two_products
) -> None:
    (checked_id, checked_slug) = two_products[0]
    url = client.get(f"/products/{checked_id}").json()["image"]["url"]
    assert client.get(url).status_code == 200
    pi.image_path(checked_slug).write_bytes(pi.images.process(png((0, 0, 255))).data)
    assert client.get(url).status_code == 404


def test_image_problems(image_dir: Path) -> None:
    data = b"webp bytes"
    (image_dir / "a.webp").write_bytes(data)
    good = entry("a", data, True)
    (image_dir / "changed.webp").write_bytes(b"other bytes")
    assert pi.image_problems([good], {"a"}) == []
    assert pi.image_problems([entry("b", data, False)], {"a", "b"}) == []  # unchecked: no file
    problems = pi.image_problems(
        [
            entry("missing", data, True),
            {**entry("changed", data, True), "sha256": "0" * 64},
            {**good, "license": ""},
            entry("unknown", data, False),
            good,
            good,
        ],
        {"a", "missing", "changed"},
    )
    assert any("missing: checked but missing.webp is missing" in p for p in problems)
    assert any(p.startswith("changed: the file changed") for p in problems)
    assert any("missing license" in p for p in problems)
    assert any("unknown: not a product" in p for p in problems)
    assert any("listed twice" in p for p in problems)


def test_the_real_data_file_is_well_formed() -> None:
    import tomllib

    with (pi.DATA_DIR / "products.toml").open("rb") as f:
        slugs = {p["slug"] for p in tomllib.load(f)["product"]}
    assert pi.image_problems(pi.load_entries(), slugs) == []


def test_front_image_urls_prefer_the_full_size() -> None:
    product = {
        "image_front_url": "https://img/x/front_en.4.400.jpg",
        "selected_images": {"front": {"display": {"en": "https://img/x/front_en.4.400.jpg"}}},
    }
    assert pi.front_image_urls(product) == [
        "https://img/x/front_en.4.full.jpg",
        "https://img/x/front_en.4.400.jpg",
    ]
    assert pi.front_image_urls({}) == []


class FakeObf:
    """Stands in for the network: barcode -> image bytes (None: product without image)."""

    def __init__(self, products: dict[str, bytes | None]) -> None:
        self.products = products
        self.urls: list[str] = []

    def __call__(self, url: str) -> bytes | None:
        self.urls.append(url)
        for code, image in self.products.items():
            if url == pi.OBF_API.format(code=code):
                product = {"code": code}
                if image is not None:
                    product["image_front_url"] = f"https://img/{code}/front_en.1.400.jpg"
                return json.dumps({"status": 1, "product": product}).encode()
            if image is not None and url.startswith(f"https://img/{code}/"):
                return image if url.endswith(".full.jpg") else None
        return None


def test_fetch_writes_unchecked_entries_and_keeps_checked_when_unchanged(image_dir: Path):
    obf = FakeObf({"111": png(), "222": None})
    barcodes = {"a": ["000", "111"], "b": ["222"], "c": []}
    outcome = script.fetch(["a", "b", "c"], barcodes, obf)
    assert outcome == {"a": script.IMAGE, "b": script.NO_IMAGE, "c": script.NO_BARCODE}
    entries = pi.load_entries(pi.TOML_PATH)
    assert [e["slug"] for e in entries] == ["a"]
    a = entries[0]
    assert a["checked"] is False and a["barcode"] == "111"
    assert a["source_url"] == "https://world.openbeautyfacts.org/product/111"
    assert a["image_url"] == "https://img/111/front_en.1.full.jpg"
    assert a["license"] == "CC BY-SA 3.0"
    data = (image_dir / "a.webp").read_bytes()
    assert a["sha256"] == pi.sha256_of(data)
    with Image.open(BytesIO(data)) as image:
        assert image.format == "WEBP" and max(image.size) <= pi.MAX_SIDE

    # A reviewer checks it; fetching the same image again keeps that.
    pi.write_entries([{**a, "checked": True}], pi.TOML_PATH)
    script.fetch(["a"], barcodes, obf)
    assert pi.load_entries(pi.TOML_PATH)[0]["checked"] is True

    # A different image must be checked again.
    script.fetch(["a"], barcodes, FakeObf({"111": png((10, 200, 30))}))
    assert pi.load_entries(pi.TOML_PATH)[0]["checked"] is False


def test_large_images_are_shrunk_to_800(image_dir: Path) -> None:
    script.fetch(["a"], {"a": ["1"]}, FakeObf({"1": png(size=(2000, 1000))}))
    with Image.open(image_dir / "a.webp") as image:
        assert image.size == (800, 400)


def test_user_agent_names_the_app_without_an_email() -> None:
    assert pi.USER_AGENT.startswith("SkinWise/") and "@" not in pi.USER_AGENT


def test_read_barcodes(tmp_path: Path) -> None:
    path = tmp_path / "products.toml"
    path.write_text(
        '[[product]]\nslug = "a"\n[[product.barcodes]]\ncode = "1"\n'
        '[[product.barcodes]]\ncode = "2"\n[[product]]\nslug = "b"\n',
        encoding="utf-8",
    )
    assert script.read_barcodes(path) == {"a": ["1", "2"], "b": []}


# --- Users' own photos ---


@pytest.fixture(autouse=True)
def fresh_limit() -> Iterator[None]:
    product_photos.reset_limit()
    yield
    product_photos.reset_limit()


def upload(client: TestClient, data: bytes, replaces: int | None = None):
    form = {"replaces": str(replaces)} if replaces is not None else None
    return client.post(
        "/me/product-photos", files={"file": ("p.png", data, "image/png")}, data=form
    )


def test_photo_routes_need_a_session(client: TestClient) -> None:
    for method, path in [
        ("POST", "/me/product-photos"),
        ("GET", "/me/product-photos/1"),
        ("DELETE", "/me/product-photos/1"),
    ]:
        assert client.request(method, path).status_code == 401, (method, path)


def test_upload_view_and_delete_own_photo(make_user, upload_dir: Path) -> None:
    me = make_user()
    response = upload(me, png())
    assert response.status_code == 201, response.text
    photo = response.json()
    assert photo == {"id": photo["id"], "url": f"/me/product-photos/{photo['id']}"}
    got = me.get(photo["url"])
    assert got.status_code == 200 and got.headers["content-type"] == "image/webp"
    assert got.headers["cache-control"].startswith("private")
    assert len(list(upload_dir.iterdir())) == 1

    other = make_user()
    assert other.get(photo["url"]).status_code == 404
    assert other.delete(photo["url"]).status_code == 404
    assert me.delete(photo["url"]).status_code == 204
    assert me.get(photo["url"]).status_code == 404
    assert me.delete(photo["url"]).status_code == 404
    assert list(upload_dir.iterdir()) == []


def test_upload_errors(make_user) -> None:
    me = make_user()
    assert upload(me, b"not an image").status_code == 415
    assert me.post("/me/product-photos", data={"x": "1"}).status_code == 422
    assert upload(me, png(), replaces=999_999_999).status_code == 404
    response = me.post(
        "/me/product-photos",
        files={"file": ("p.png", png(), "image/png")},
        data={"replaces": "abc"},
    )
    assert response.status_code == 422


def test_replacing_deletes_the_old_photo(make_user, upload_dir: Path) -> None:
    me = make_user()
    old = upload(me, png()).json()
    new = upload(me, png((1, 2, 3)), replaces=old["id"])
    assert new.status_code == 201
    assert me.get(old["url"]).status_code == 404
    assert me.get(new.json()["url"]).status_code == 200
    assert len(list(upload_dir.iterdir())) == 1
    # Someone else's photo cannot be replaced (or deleted) this way.
    other = make_user()
    assert upload(other, png(), replaces=new.json()["id"]).status_code == 404
    assert me.get(new.json()["url"]).status_code == 200


def test_at_most_60_photos_per_account(make_user, engine: Engine) -> None:
    me = make_user()
    with engine.begin() as conn:
        for _ in range(product_photos.MAX_PER_ACCOUNT - 1):
            product_photos.add_photo(conn, me.user_id, f"{uuid.uuid4().hex}.webp", 1, 1)
    last = upload(me, png())
    assert last.status_code == 201
    assert upload(me, png()).status_code == 409
    # Replacing one keeps the count, so it is allowed.
    assert upload(me, png(), replaces=last.json()["id"]).status_code == 201


def test_uploads_are_limited_per_hour(make_user) -> None:
    me = make_user()
    data = png(size=(4, 4))
    codes = [upload(me, data).status_code for _ in range(product_photos.UPLOADS_PER_HOUR + 1)]
    assert codes == [201] * product_photos.UPLOADS_PER_HOUR + [429]
    assert upload(make_user(), data).status_code == 201  # per user


ROUTINE_PRODUCT = {
    "key": "k1",
    "name": "Kem tự dán",
    "brand": None,
    "productId": None,
    "inci": "Aqua, Glycerin",
    "groups": [],
    "notices": [],
}


def put_routine(client: TestClient, products: list[dict]) -> dict:
    current = client.get("/me/routine").json()
    response = client.put(
        "/me/routine",
        json={"data": {"products": products, "entries": []}, "base_version": current["version"]},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_routine_keeps_photo_id(make_user) -> None:
    me = make_user()
    photo = upload(me, png()).json()
    saved = put_routine(me, [{**ROUTINE_PRODUCT, "photoId": photo["id"]}])
    assert saved["data"]["products"][0]["photoId"] == photo["id"]
    without = put_routine(me, [ROUTINE_PRODUCT])
    assert "photoId" not in without["data"]["products"][0]


def test_a_routine_on_a_blog_post_drops_photo_id(make_user, engine: Engine) -> None:
    me = make_user(f"p_{uuid.uuid4().hex[:8]}")
    with engine.connect() as conn:
        product_id = conn.execute(text("SELECT min(id) FROM products")).scalar_one()
    routine = {
        "format": "skinwise-routine",
        "version": 1,
        "products": [{"key": "a", "name": "Tự dán", "inci": "Aqua", "photoId": 5}],
        "entries": [],
    }
    post = me.post(
        "/blog/posts",
        json={
            "title": "Bài có routine",
            "body": "Mình dùng sản phẩm này được ba tuần, da mềm hơn.",
            "products": [{"product_id": product_id}],
            "routine": routine,
        },
    )
    assert post.status_code == 201, post.text
    assert "photoId" not in json.dumps(post.json()["routine"])
    with engine.connect() as conn:
        stored = conn.execute(
            text("SELECT routine::text FROM blog_posts WHERE id = :id"), {"id": post.json()["id"]}
        ).scalar_one()
    assert "photoId" not in stored


def test_orphan_photos_are_purged_after_7_days(make_user, engine: Engine, upload_dir: Path):
    me = make_user()
    used = upload(me, png()).json()
    unused = upload(me, png((9, 9, 9))).json()
    fresh = upload(me, png((8, 8, 8))).json()
    put_routine(me, [{**ROUTINE_PRODUCT, "photoId": used["id"]}])
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE user_product_photos SET last_seen_at = now() - interval '8 days' "
                "WHERE id = ANY(:ids)"
            ),
            {"ids": [used["id"], unused["id"]]},
        )
        files = product_photos.purge_orphans(conn)
    assert len(files) == 1
    pi.images.delete_files(files)
    assert me.get(used["url"]).status_code == 200  # still in the routine
    assert me.get(fresh["url"]).status_code == 200  # not 7 days yet
    assert me.get(unused["url"]).status_code == 404
    assert len(list(upload_dir.iterdir())) == 2


def test_account_deletion_removes_photo_files_and_export_lists_them(
    make_user, upload_dir: Path, engine: Engine
) -> None:
    me = make_user()
    photo = upload(me, png()).json()
    exported = me.get("/me/export").json()
    assert [p["id"] for p in exported["product_photos"]] == [photo["id"]]
    assert me.request("DELETE", "/me", json={"confirm_email": me.email}).status_code == 204
    assert list(upload_dir.iterdir()) == []
    with engine.connect() as conn:
        assert (
            conn.execute(
                text("SELECT count(*) FROM user_product_photos WHERE owner_id = :u"),
                {"u": me.user_id},
            ).scalar_one()
            == 0
        )


def test_nul_characters_are_a_bad_request_not_a_server_error(
    client: TestClient, make_user, engine: Engine
) -> None:
    for path in [
        "/products?q=%00",
        "/products?q=a%00b",
        "/rules?groups=%00",
        "/goals/%00/article",
        "/product-images/%00.webp",
    ]:
        assert client.get(path).status_code == 422, path
    me = make_user(f"n_{uuid.uuid4().hex[:8]}")
    assert me.post("/inci/analyze", json={"inci": "Aqua, Nia\u0000cinamide"}).status_code == 422
    assert me.get("/blog/posts", params={"q": "ab\x00c"}).status_code == 422
    assert me.get("/blog/authors/a%00b").status_code == 422


def test_demo_resets_collect_photo_files(engine: Engine) -> None:
    from app.demo_account import DEMO_EMAIL, remove_demo_account
    from scripts.demo_blog import remove_demo_accounts

    with engine.connect() as conn:
        outer = conn.begin()
        try:
            conn.execute(text("DELETE FROM users WHERE email LIKE '%@skinwise.test'"))
            ids = {
                email: conn.execute(
                    text("INSERT INTO users (email) VALUES (:e) RETURNING id::text"), {"e": email}
                ).scalar_one()
                for email in ["demo9@skinwise.test", DEMO_EMAIL]
            }
            for email, user_id in ids.items():
                product_photos.add_photo(conn, user_id, f"photo-{email}.webp", 1, 1)
                conn.execute(
                    text(
                        "INSERT INTO blog_images (owner_id, file_name, width, height) "
                        "VALUES (:o, :f, 1, 1)"
                    ),
                    {"o": user_id, "f": f"blog-{email}.webp"},
                )
            _, files = remove_demo_accounts(conn)
            assert sorted(files) == [
                "blog-demo9@skinwise.test.webp",
                "photo-demo9@skinwise.test.webp",
            ]
            collected: list[str] = []
            assert remove_demo_account(conn, collected)
            assert sorted(collected) == [f"blog-{DEMO_EMAIL}.webp", f"photo-{DEMO_EMAIL}.webp"]
        finally:
            outer.rollback()
