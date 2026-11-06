"""Fetch the front image of sample products from Open Beauty Facts, by barcode:

uv run python -m scripts.fetch_product_images --barcodes <barcodes.toml>
uv run python -m scripts.fetch_product_images --barcodes <file> the-ordinary-niacinamide-10-zinc-1

The barcodes are read (never written) from a products.toml that has [[product.barcodes]]
(code = "..."). Each image is re-encoded (WebP, no metadata, at most 800 px a side) into
data/product_images/<slug>.webp and recorded in data/product_images.toml with checked = false;
an image that did not change keeps its `checked`. A reviewer sets checked = true after looking
at the image; only then does scripts.seed serve it. Prints, per product: image / no barcode /
no image on Open Beauty Facts.
"""

import sys
import time
import tomllib
import urllib.error
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

from app import product_images as pi
from app.console import use_utf8_output

PAUSE_SECONDS = 0.7  # between requests, to stay well under OBF's limits


def http_get(url: str) -> bytes | None:
    """The body, or None when the server has nothing there (or cannot be reached)."""
    time.sleep(PAUSE_SECONDS)
    request = urllib.request.Request(url, headers={"User-Agent": pi.USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.read(pi.images.MAX_BYTES + 1)
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code} for {url}")
        return None
    except (urllib.error.URLError, ConnectionError, TimeoutError) as e:
        print(f"  cannot reach {url}: {e}")
        return None


def read_barcodes(path: Path) -> dict[str, list[str]]:
    """slug -> barcodes, in the order the file lists them."""
    with path.open("rb") as f:
        products = tomllib.load(f).get("product", [])
    return {
        p["slug"]: [b["code"] for b in p.get("barcodes", []) if b.get("code")]
        for p in products
        if p.get("slug")
    }


def sample_slugs() -> list[str]:
    with (pi.DATA_DIR / "products.toml").open("rb") as f:
        return [p["slug"] for p in tomllib.load(f).get("product", [])]


IMAGE, NO_BARCODE, NO_IMAGE = "có ảnh", "không có mã vạch", "OBF không có ảnh"


def fetch(
    slugs: list[str], barcodes: dict[str, list[str]], get: pi.Get = http_get
) -> dict[str, str]:
    """Fetch and record the images; returns slug -> outcome."""
    entries = {e["slug"]: e for e in pi.load_entries(pi.TOML_PATH)}
    outcome: dict[str, str] = {}
    pi.IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(UTC).replace(microsecond=0)
    for slug in slugs:
        codes = barcodes.get(slug, [])
        if not codes:
            outcome[slug] = NO_BARCODE
            continue
        fetched = pi.fetch_front_image(codes, get)
        if fetched is None:
            outcome[slug] = NO_IMAGE  # an earlier entry, if any, stays as it was
            continue
        pi.image_path(slug).write_bytes(fetched.data)
        entries[slug] = pi.update_entry(entries.get(slug), slug, fetched, now)
        outcome[slug] = IMAGE
    pi.write_entries(list(entries.values()), pi.TOML_PATH)
    return outcome


def main(args: list[str], get: pi.Get = http_get) -> int:
    if len(args) < 2 or args[0] != "--barcodes":
        print(__doc__)
        return 1
    barcodes = read_barcodes(Path(args[1]))
    known = sample_slugs()
    wanted = args[2:] or known
    if unknown := [s for s in wanted if s not in known]:
        print(f"Not sample products: {unknown}")
        return 1
    outcome = fetch(wanted, barcodes, get)
    width = max(len(s) for s in outcome)
    for slug, result in outcome.items():
        print(f"{slug:<{width}}  {result}")
    counts = {r: list(outcome.values()).count(r) for r in (IMAGE, NO_BARCODE, NO_IMAGE)}
    print(", ".join(f"{n} {r}" for r, n in counts.items()))
    print("Every new image has checked = false: look at it before setting checked = true.")
    return 0


if __name__ == "__main__":
    use_utf8_output()
    sys.exit(main(sys.argv[1:]))
