"""GET /products?q= matching ingredients as well as product names (display only)."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text
from sqlalchemy.engine import Connection

from app.db import _backfill_ingredient_search_names
from app.inci import normalize_name
from app.products import search_products

RETINOL = "the-ordinary-retinol-05-in-squalane"
BHA = "paulas-choice-skin-perfecting-2-bha-liquid-exfoliant"
VITAMIN_C = "the-ordinary-vitamin-c-suspension-23-ha-spheres-2"
ASCORBYL_GLUCOSIDE = "the-ordinary-ascorbyl-glucoside-solution-12"
NIACINAMIDE = "the-ordinary-niacinamide-10-zinc-1"


def search(client: TestClient, q: str, **params: int) -> list[dict]:
    response = client.get("/products", params={"q": q, **params})
    assert response.status_code == 200
    return response.json()


def matched(client: TestClient, q: str) -> dict[str, list[str]]:
    return {p["slug"]: p["matched_ingredients"] for p in search(client, q)}


def label_names(engine: Engine, q: str) -> dict[str, list[str]]:
    """Per product slug, the label lines whose printed name contains q after normalizing."""
    names: dict[str, list[str]] = {}
    with engine.connect() as conn:
        for slug, raw in conn.execute(
            text(
                "SELECT p.slug, pi.raw_name FROM product_ingredients pi"
                " JOIN products p ON p.id = pi.product_id ORDER BY pi.position"
            )
        ):
            if q in normalize_name(raw):
                names.setdefault(slug, []).append(raw)
    return names


def test_ingredient_search_finds_every_label_naming_the_ingredient(
    client: TestClient, engine: Engine
) -> None:
    expected = label_names(engine, "retinol")
    assert RETINOL in expected
    found = matched(client, "retinol")
    assert set(found) >= set(expected)
    for slug, names in expected.items():
        assert set(names[:5]) <= set(found[slug]), slug


def test_ingredient_search_uses_synonyms_and_groups(client: TestClient) -> None:
    found = matched(client, "vitamin c")
    # Ascorbyl Glucoside never says "vitamin c" on the label: it matches through its group.
    assert found[ASCORBYL_GLUCOSIDE] == ["Ascorbyl Glucoside"]
    assert found[VITAMIN_C] == ["Ascorbic Acid"]


def test_ingredient_search_matches_group_codes(client: TestClient) -> None:
    found = matched(client, "BHA")
    assert found[BHA] == ["Salicylic Acid"]
    assert "cerave-renewing-sa-cleanser" in found
    # Every hit says which ingredient matched, except a name match whose label has no BHA
    # (the Some By Mi "AHA-BHA-PHA" serum lists wintergreen extract, not salicylic acid).
    assert all(lines for slug, lines in found.items() if "bha" not in slug)


def test_ingredient_search_matches_substrings(client: TestClient) -> None:
    found = matched(client, "niacinamid")
    assert found[NIACINAMIDE] == ["Niacinamide"]
    assert len(found) > 5


@pytest.mark.parametrize("q", ["c", "ab", " C ", "Đ"])
def test_short_queries_match_names_only(client: TestClient, q: str) -> None:
    assert all(p["matched_ingredients"] == [] for p in search(client, q))


def test_name_matches_come_before_ingredient_only_matches(client: TestClient) -> None:
    products = search(client, "vitamin c")
    named = ["vitamin c" in normalize_name(f"{p['brand']} {p['name']}") for p in products]
    assert named[0] and False in named
    first_ingredient_only = named.index(False)
    assert all(named[:first_ingredient_only])
    assert products[0]["matched_ingredients"]  # a name match also says what matched


def test_limit_applies_to_name_and_ingredient_matches_together(client: TestClient) -> None:
    products = search(client, "niacinamid", limit=2)
    assert len(products) == 2
    assert "niacinamide" in products[0]["name"].lower()  # a name match comes first


def test_empty_query_lists_products_without_matches(client: TestClient) -> None:
    products = search(client, "")
    assert len(products) >= 15
    assert all(p["matched_ingredients"] == [] for p in products)


@pytest.mark.parametrize("q", ["re_inol", "ret%", "%%%", "___", "\\\\\\"])
def test_like_wildcards_in_query_are_literal(client: TestClient, q: str) -> None:
    for p in search(client, q):
        assert p["matched_ingredients"] == []


def test_product_detail_has_no_matches(client: TestClient, engine: Engine) -> None:
    with engine.connect() as conn:
        product_id = conn.execute(
            text("SELECT id FROM products WHERE slug = :slug"), {"slug": RETINOL}
        ).scalar_one()
    assert client.get(f"/products/{product_id}").json()["matched_ingredients"] == []


# Fake products in a transaction that is rolled back, to pin down ordering, de-duplication
# and the cap on returned names without depending on the sample data.


@pytest.fixture
def conn(engine: Engine) -> Iterator[Connection]:
    with engine.connect() as conn:
        transaction = conn.begin()
        yield conn
        transaction.rollback()


def add_product(conn: Connection, brand: str, name: str, lines: list[str]) -> int:
    product_id = conn.execute(
        text(
            "INSERT INTO products (brand, name, search_name, ingredients_source)"
            " VALUES (:brand, :name, :search_name, 'manual') RETURNING id"
        ),
        {"brand": brand, "name": name, "search_name": normalize_name(f"{brand} {name}")},
    ).scalar_one()
    for position, raw in enumerate(lines, start=1):
        conn.execute(
            text(
                "INSERT INTO product_ingredients (product_id, position, raw_name, search_name)"
                " VALUES (:id, :position, :raw, :search_name)"
            ),
            {
                "id": product_id,
                "position": position,
                "raw": raw,
                "search_name": normalize_name(raw),
            },
        )
    return product_id


def test_matched_names_are_deduplicated_capped_and_in_label_order(conn: Connection) -> None:
    lines = ["Aqua", "Zyxolate B", "ZYXOLATE B", "Zyxolate A", "Zyxolate C", "Zyxolate D"]
    lines += ["Zyxolate E", "Zyxolate F"]
    add_product(conn, "Brand", "Cream", lines)
    [hit] = search_products(conn, "zyxolate", 50)
    assert hit.matched_ingredients == (
        "Zyxolate B",
        "Zyxolate A",
        "Zyxolate C",
        "Zyxolate D",
        "Zyxolate E",
    )


def test_ingredient_only_matches_are_ordered_by_label_position(conn: Connection) -> None:
    low = add_product(conn, "Aaa", "Low", ["Aqua", "Glycerin", "Qorvium Extract"])
    high = add_product(conn, "Zzz", "High", ["Qorvium Extract", "Aqua"])
    named = add_product(conn, "Qorvium", "Lotion", ["Aqua"])
    hits = search_products(conn, "qorvium", 50)
    assert [h.id for h in hits] == [named, high, low]
    assert hits[0].matched_ingredients == ()
    assert hits[1].matched_ingredients == ("Qorvium Extract",)


def test_ingredient_search_ignores_diacritics(conn: Connection) -> None:
    product_id = add_product(conn, "Brand", "Gel", ["Aqua", "Chiết xuất bí đao Xyrqa"])
    hits = {h.id: h for h in search_products(conn, "bi dao xyrqa", 50)}
    assert hits[product_id].matched_ingredients == ("Chiết xuất bí đao Xyrqa",)


def test_ingredient_search_starts_at_three_characters(conn: Connection) -> None:
    product_id = add_product(conn, "Brand", "Gel", ["Aqua", "Vk Extract"])
    assert product_id not in {h.id for h in search_products(conn, "vk", 50)}
    hits = {h.id: h for h in search_products(conn, "vk ", 50)}
    assert product_id not in hits  # trailing space is normalized away
    hits = {h.id: h for h in search_products(conn, "vk e", 50)}
    assert hits[product_id].matched_ingredients == ("Vk Extract",)


def test_init_schema_backfills_search_names(conn: Connection) -> None:
    product_id = add_product(conn, "Brand", "Old", ["Ácido Hialurónico – Wqx"])
    conn.execute(
        text("UPDATE product_ingredients SET search_name = NULL WHERE product_id = :id"),
        {"id": product_id},
    )
    _backfill_ingredient_search_names(conn)
    stored = conn.execute(
        text("SELECT search_name FROM product_ingredients WHERE product_id = :id"),
        {"id": product_id},
    ).scalar_one()
    assert stored == normalize_name("Ácido Hialurónico – Wqx")


def test_ingredient_names_match_at_the_start_of_a_word(conn: Connection) -> None:
    product_id = add_product(
        conn,
        "Brand",
        "Serum",
        ["Aqua", "Alpha-Arbutin", "3-O-Ethyl Ascorbic Acid", "Gluconolactone"],
    )
    hits = {h.id: h for h in search_products(conn, "pha", 50)}
    assert product_id not in hits  # lines here are not linked to the dictionary
    hits = {h.id: h for h in search_products(conn, "ascorbic", 50)}
    assert "3-O-Ethyl Ascorbic Acid" in hits[product_id].matched_ingredients
    hits = {h.id: h for h in search_products(conn, "arbutin", 50)}
    assert hits[product_id].matched_ingredients == ("Alpha-Arbutin",)
    assert product_id not in {h.id for h in search_products(conn, "lpha", 50)}


@pytest.mark.parametrize("boundary", [" ", "-", "(", "/", ","])
def test_every_word_boundary_counts(conn: Connection, boundary: str) -> None:
    line = f"Aqua{boundary}Zorbitol"
    product_id = add_product(conn, "Brand", "Mist", [line])
    hits = {h.id: h for h in search_products(conn, "zorb", 50)}
    assert hits[product_id].matched_ingredients == (line,)


def test_pha_does_not_match_alpha_arbutin_in_sample_products(client: TestClient) -> None:
    for names in matched(client, "pha").values():
        assert not any("arbutin" in normalize_name(n) for n in names)
