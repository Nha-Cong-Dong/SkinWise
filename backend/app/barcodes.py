"""Retail barcodes (GTIN). Seeded products carry theirs in data/products.toml, each with the
page that prints it; GET /barcode/{code} looks there before asking Open Beauty Facts."""

import re
from typing import Any

_GTIN_LENGTHS = {8, 12, 13, 14}  # EAN-8, UPC-A, EAN-13, GTIN-14


def normalize_barcode(raw: str) -> str | None:
    """The digits of a GTIN barcode with a valid check digit, or None.

    Spaces and dashes are ignored. A wrong check digit is almost always a typo, and looking it
    up would show some other product.
    """
    code = re.sub(r"[\s-]", "", raw)
    if not (code.isascii() and code.isdigit()) or len(code) not in _GTIN_LENGTHS:
        return None
    if len(code) == 12:
        # A UPC-A is kept in its EAN-13 form, as Open Beauty Facts files it, so the two
        # spellings of one code find the same product.
        code = "0" + code
    body, check = code[:-1], int(code[-1])
    # From the right, digits are weighted 3, 1, 3, 1...
    total = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return code if (10 - total % 10) % 10 == check else None


def barcode_problems(products: list[dict[str, Any]]) -> list[str]:
    """Why the barcodes in products.toml cannot be seeded: a wrong check digit, no source
    page, or one code on two products (a scan must find exactly one)."""
    problems: list[str] = []
    owner: dict[str, str] = {}  # code -> slug
    for p in products:
        for b in p.get("barcodes", []):
            code = normalize_barcode(b["code"])
            if code is None:
                problems.append(f"{p['slug']}: {b['code']!r} is not a valid barcode")
                continue
            if not b.get("source_url"):
                problems.append(f"{p['slug']}: barcode {b['code']} has no source_url")
            if code in owner and owner[code] != p["slug"]:
                problems.append(f"{p['slug']}: barcode {b['code']} is also on {owner[code]}")
            elif code in owner:
                problems.append(f"{p['slug']}: barcode {b['code']} is listed twice")
            owner[code] = p["slug"]
    return problems
