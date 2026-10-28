"""Measure photo reading on real labels (direction G) before relying on it:
uv run python -m scripts.label_check photo.jpg [slug]

Reads the photo with the same model call as POST /label/read and prints the text. With the
slug of a seeded product (data/products.toml, already verified against its source), it also
compares the two lists: missing, extra and reordered entries, and whether the active groups,
which decide the warnings, come out the same. Needs ANTHROPIC_API_KEY; each run is billed.
"""

import base64
import sys
from pathlib import Path

from app.db import get_engine
from app.inci import parse_inci, read_label_text
from app.ingredients import product_groups, resolve
from app.label_reader import MAX_IMAGE_BASE64, LabelReadingError, read_label
from app.seed import load_toml

MEDIA_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
               ".webp": "image/webp", ".gif": "image/gif"}  # fmt: skip


def names(entries) -> list[str]:
    return [e.candidates[0] for e in entries]


def compare(text: str, slug: str) -> bool:
    """Print how the reading differs from the verified list; True if the groups match."""
    product = next((p for p in load_toml("products.toml")["product"] if p["slug"] == slug), None)
    if product is None:
        sys.exit(f"no seeded product with slug {slug!r}")
    read = read_label_text(text).entries
    truth = parse_inci(product["ingredients"])
    read_names, truth_names = names(read), names(truth)
    missing = [n for n in truth_names if n not in read_names]
    extra = [n for n in read_names if n not in truth_names]
    common = [n for n in read_names if n in truth_names]
    reordered = common != [n for n in truth_names if n in read_names]
    print(f"\nCompared with {slug} ({len(truth_names)} entries, verified):")
    print(f"  missing ({len(missing)}): {', '.join(missing) or '-'}")
    print(f"  extra   ({len(extra)}): {', '.join(extra) or '-'}")
    print(f"  order:  {'differs' if reordered else 'same'}")
    with get_engine().connect() as conn:
        read_groups = product_groups(resolve(conn, read))
        truth_groups = product_groups(resolve(conn, truth))
    same = read_groups == truth_groups
    print(f"  groups: read {sorted(read_groups)}, verified {sorted(truth_groups)}"
          f" -> {'same' if same else 'DIFFERENT'}")  # fmt: skip
    return same


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        sys.exit(__doc__)
    path = Path(sys.argv[1])
    media_type = MEDIA_TYPES.get(path.suffix.lower())
    if media_type is None:
        sys.exit(f"unsupported image type {path.suffix!r}; use JPEG, PNG, WebP or GIF")
    data = base64.b64encode(path.read_bytes()).decode()
    if len(data) > MAX_IMAGE_BASE64:
        sys.exit("the photo is over the API's 10 MB limit; resize it first")
    try:
        reading = read_label(media_type, data)
    except LabelReadingError as e:
        sys.exit(f"reading failed ({e.status}): {e}")
    if not reading.found:
        sys.exit("no ingredient list found in the photo")
    print(reading.text)
    print(f"\n{len(read_label_text(reading.text).entries)} entries, "
          f"{reading.unreadable_count} unreadable [?]")  # fmt: skip
    if len(sys.argv) == 3 and not compare(reading.text, sys.argv[2]):
        sys.exit(1)
