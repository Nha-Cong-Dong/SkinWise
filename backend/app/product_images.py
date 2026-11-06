"""Images of catalogue products, from Open Beauty Facts (OBF), looked up by barcode.

scripts.fetch_product_images downloads the front image of each sample product, re-encodes it
with app/images.py (WebP, no metadata, at most MAX_SIDE pixels a side) into
data/product_images/<slug>.webp and records where it came from in data/product_images.toml with
checked = false. A reviewer looks at each image and sets checked = true when it shows the right
product; only checked images are seeded and served (like `published` for rules).

OBF images are CC BY-SA 3.0: the API returns the credit and the OBF page with every image.
Display only: nothing here reaches the warning engine. Images are never taken from brand sites.
"""

import hashlib
import json
import tomllib
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app import images

Db = Session | Connection

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
IMAGE_DIR = DATA_DIR / "product_images"
TOML_PATH = DATA_DIR / "product_images.toml"

MAX_SIDE = 800
LICENSE = "CC BY-SA 3.0"
LICENSE_URL = "https://creativecommons.org/licenses/by-sa/3.0/"
CREDIT_VI = "Ảnh: Open Beauty Facts (CC BY-SA 3.0)"
USER_AGENT = "SkinWise/0.1 (hackathon; github.com/Nha-Cong-Dong/SkinWise)"
OBF_API = "https://world.openbeautyfacts.org/api/v2/product/{code}.json?fields=code,image_front_url,selected_images"
OBF_PAGE = "https://world.openbeautyfacts.org/product/{code}"
REQUIRED = ("slug", "barcode", "source_url", "image_url", "license", "fetched_at", "sha256")


def image_path(slug: str) -> Path:
    return IMAGE_DIR / f"{slug}.webp"


def sha256_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def image_url(slug: str, sha256: str) -> str:
    """Where the API serves the image; the hash changes the address when the image changes,
    so it can be cached for long."""
    return f"/product-images/{slug}.webp?v={sha256[:12]}"


# --- Data file ---


def load_entries(path: Path = TOML_PATH) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    with path.open("rb") as f:
        return tomllib.load(f).get("image", [])


def image_problems(entries: list[dict[str, Any]], known_slugs: set[str]) -> list[str]:
    """Why seeding these entries would be wrong; [] when fine. A checked image must be on disk
    exactly as the reviewer saw it (same sha256)."""
    problems: list[str] = []
    seen: set[str] = set()
    for e in entries:
        slug = e.get("slug", "?")
        if missing := [k for k in REQUIRED if not e.get(k)]:
            problems.append(f"{slug}: missing {', '.join(missing)}")
            continue
        if slug in seen:
            problems.append(f"{slug}: listed twice")
        seen.add(slug)
        if slug not in known_slugs:
            problems.append(f"{slug}: not a product in products.toml")
        if e.get("checked"):
            path = image_path(slug)
            if not path.is_file():
                problems.append(f"{slug}: checked but {path.name} is missing")
            elif sha256_of(path.read_bytes()) != e["sha256"]:
                problems.append(f"{slug}: the file changed since it was checked; check it again")
    return problems


def _toml_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, datetime):
        return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    return json.dumps(value, ensure_ascii=False)  # a valid TOML basic string


HEADER = """\
# Front images of sample products from Open Beauty Facts (CC BY-SA 3.0), written by
# scripts.fetch_product_images (do not edit by hand, apart from `checked`). The file is
# data/product_images/<slug>.webp. Set checked = true only after looking at the image: it must
# show this very product (brand, name, size), and nothing else (no person, no personal data).
# Seed serves checked images only; it refuses a checked image whose file changed (sha256).
"""


def write_entries(entries: list[dict[str, Any]], path: Path = TOML_PATH) -> None:
    lines = [HEADER]
    for e in sorted(entries, key=lambda x: x["slug"]):
        lines.append("[[image]]")
        for key in (*REQUIRED, "checked"):
            lines.append(f"{key} = {_toml_value(e.get(key, False))}")
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


# --- Seed and API ---


def seed_product_images(conn: Connection, entries: list[dict[str, Any]]) -> int:
    """Replace the table with the checked entries; returns how many."""
    conn.execute(text("DELETE FROM product_images"))
    count = 0
    for e in entries:
        if not e.get("checked"):
            continue
        conn.execute(
            text(
                """
                INSERT INTO product_images
                  (product_id, barcode, source_url, image_url, license, fetched_at, sha256)
                SELECT id, :barcode, :source_url, :image_url, :license, :fetched_at, :sha256
                FROM products WHERE slug = :slug
                """
            ),
            {k: e[k] for k in REQUIRED},
        )
        count += 1
    return count


def images_for(db: Db, product_ids: list[int]) -> dict[int, dict[str, str]]:
    """{product id: {url, credit_vi, source_url, license_url}} for products with a checked
    image."""
    if not product_ids:
        return {}
    rows = db.execute(
        text(
            "SELECT pi.product_id, p.slug, pi.sha256, pi.source_url FROM product_images pi "
            "JOIN products p ON p.id = pi.product_id WHERE pi.product_id = ANY(:ids)"
        ),
        {"ids": product_ids},
    )
    return {
        r.product_id: {
            "url": image_url(r.slug, r.sha256),
            "credit_vi": CREDIT_VI,
            "source_url": r.source_url,
            "license_url": LICENSE_URL,
        }
        for r in rows
    }


def file_for(db: Db, slug: str) -> Path | None:
    """The file of a seeded (checked) image, or None. Also None when the file on disk is no
    longer the one the reviewer checked (its sha256 differs from the seeded one), so a file
    replaced after seeding is never served."""
    sha256 = db.execute(
        text(
            "SELECT pi.sha256 FROM product_images pi JOIN products p ON p.id = pi.product_id "
            "WHERE p.slug = :slug"
        ),
        {"slug": slug},
    ).scalar_one_or_none()
    if sha256 is None:
        return None
    path = image_path(slug)
    if not path.is_file() or sha256_of(path.read_bytes()) != sha256:
        return None
    return path


# --- Fetching from Open Beauty Facts (scripts.fetch_product_images) ---

Get = Callable[[str], bytes | None]  # url -> body, None when not found


def front_image_urls(product: dict[str, Any]) -> list[str]:
    """Candidate URLs of the front image of an OBF product, largest first."""
    urls: list[str] = []
    front = product.get("image_front_url")
    if isinstance(front, str) and front:
        # ".../front_en.12.400.jpg" -> ".../front_en.12.full.jpg"
        if front.endswith(".400.jpg"):
            urls.append(front[: -len(".400.jpg")] + ".full.jpg")
        urls.append(front)
    display = (product.get("selected_images") or {}).get("front", {}).get("display", {})
    if isinstance(display, dict):
        urls += [u for u in display.values() if isinstance(u, str) and u not in urls]
    return urls


@dataclass(frozen=True)
class Fetched:
    barcode: str
    image_url: str
    data: bytes  # processed WebP


def fetch_front_image(barcodes: list[str], get: Get) -> Fetched | None:
    """The first barcode OBF knows with a front image that decodes, processed; None if none."""
    for code in barcodes:
        body = get(OBF_API.format(code=code))
        if body is None:
            continue
        try:
            answer = json.loads(body)
        except ValueError:
            continue
        if answer.get("status") != 1:
            continue
        for url in front_image_urls(answer.get("product") or {}):
            raw = get(url)
            if raw is None:
                continue
            try:
                processed = images.process(raw, max_side=MAX_SIDE)
            except (images.NotAnImage, images.TooLarge, images.TooManyPixels):
                continue
            return Fetched(code, url, processed.data)
    return None


def update_entry(
    old: dict[str, Any] | None, slug: str, fetched: Fetched, now: datetime
) -> dict[str, Any]:
    """The new entry for a fetched image. `checked` is kept only when the image is the same
    (same OBF image and same file)."""
    sha = sha256_of(fetched.data)
    same = (
        old is not None and old.get("sha256") == sha and old.get("image_url") == fetched.image_url
    )
    return {
        "slug": slug,
        "barcode": fetched.barcode,
        "source_url": OBF_PAGE.format(code=fetched.barcode),
        "image_url": fetched.image_url,
        "license": LICENSE,
        "fetched_at": old["fetched_at"] if same and old.get("fetched_at") else now,
        "sha256": sha,
        "checked": bool(old.get("checked")) if same and old else False,
    }
