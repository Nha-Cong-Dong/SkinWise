"""Plain-language explanations: seed, API and the drafting script (with a fake model)."""

import tomllib
from collections.abc import Iterator
from datetime import date, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text
from sqlalchemy.engine import Connection

from app import plain
from app.config import get_settings
from app.drafts import DraftingError
from app.plain import ModelPlain, check_plain, hedge_losses, latin_names, rules_to_draft
from app.rules import explanation_hash, load_published_rules
from app.seed import _seed_rule, load_toml

URL = "https://example.org/plain-source"
MYTH = "vitamin-c-niacinamide-myth"


# --- Seed and loading ---


@pytest.fixture
def conn(engine: Engine) -> Iterator[Connection]:
    with engine.connect() as conn, conn.begin() as tx:
        yield conn
        tx.rollback()


def seeded_rule(**extra) -> dict:
    explanation = "Dùng chung có thể làm da khô."
    return {
        "key": "test-plain",
        "kind": "conflict",
        "severity": "caution",
        "scope": "same_session",
        "evidence_level": "moderate",
        "group_a": "RETINOID",
        "group_b": "EXFOLIANT_ACID",
        "title_vi": "tiêu đề",
        "explanation_vi": explanation,
        "published": True,
        "reviewed_by": "x",
        "reviewed_at": date(2026, 11, 6),
        "sources": [{"url": URL, "quote": "q"}],
        **extra,
    }


def source_ids(conn: Connection) -> dict[str, int]:
    sid = conn.execute(
        text(
            "INSERT INTO sources (title, publisher, url) VALUES ('T', 'P', :u) "
            "ON CONFLICT (url) DO UPDATE SET title = excluded.title RETURNING id"
        ),
        {"u": URL},
    ).scalar_one()
    return {URL: sid}


def loaded(conn: Connection, key: str):
    (rule,) = [r for r in load_published_rules(conn) if r.key == key]
    return rule


def test_seed_stores_and_clears_plain_vi(conn: Connection) -> None:
    ids = source_ids(conn)
    _seed_rule(conn, seeded_rule(), ids)
    assert loaded(conn, "test-plain").plain_vi is None

    with_plain = seeded_rule(
        plain_vi="Dùng chung có thể làm khô da.",
        plain_for=explanation_hash("Dùng chung có thể làm da khô."),
        plain_reviewed_by="y",
        plain_reviewed_at=date(2026, 11, 6),
    )
    _seed_rule(conn, with_plain, ids)
    assert loaded(conn, "test-plain").plain_vi == "Dùng chung có thể làm khô da."

    _seed_rule(conn, seeded_rule(), ids)  # plain_vi removed from rules.toml
    row = conn.execute(
        text("SELECT plain_vi, plain_reviewed_by, plain_reviewed_at FROM rules WHERE key = :k"),
        {"k": "test-plain"},
    ).one()
    assert tuple(row) == (None, None, None)


def test_unreviewed_plain_vi_is_never_loaded(conn: Connection) -> None:
    # The seed refuses this; the query does not trust that alone.
    _seed_rule(conn, seeded_rule(), source_ids(conn))
    conn.execute(text("UPDATE rules SET plain_vi = 'chưa duyệt' WHERE key = 'test-plain'"))
    assert loaded(conn, "test-plain").plain_vi is None


# --- API ---


@pytest.fixture
def myth_with_plain(engine: Engine) -> Iterator[str]:
    """The seeded myth card with a reviewed plain version, restored afterwards."""
    cols = "plain_vi, plain_reviewed_by, plain_reviewed_at"
    with engine.begin() as c:
        before = c.execute(text(f"SELECT {cols} FROM rules WHERE key = :k"), {"k": MYTH}).one()
        c.execute(
            text(
                "UPDATE rules SET plain_vi = 'Bản dễ hiểu.', plain_reviewed_by = 'x', "
                "plain_reviewed_at = now() WHERE key = :k"
            ),
            {"k": MYTH},
        )
    yield "Bản dễ hiểu."
    with engine.begin() as c:
        c.execute(
            text(
                "UPDATE rules SET plain_vi = :p, plain_reviewed_by = :b, plain_reviewed_at = :a "
                "WHERE key = :k"
            ),
            {"p": before[0], "b": before[1], "a": before[2], "k": MYTH},
        )


def test_rules_carry_plain_vi(client: TestClient, myth_with_plain: str) -> None:
    rules = client.get("/rules").json()["rules"]
    assert rules and all("plain_vi" in r for r in rules)
    by_key = {r["key"]: r for r in rules}
    assert by_key[MYTH]["plain_vi"] == myth_with_plain
    assert by_key[MYTH]["explanation_vi"]  # the original is always there too
    assert by_key["retinoid-exfoliant-acid-same-session"]["plain_vi"] is None


def test_routine_check_warnings_carry_plain_vi(make_user, myth_with_plain: str) -> None:
    client = make_user()
    body = {
        "products": [
            {"key": "c", "inci": "Aqua, Ascorbic Acid"},
            {"key": "n", "inci": "Aqua, Niacinamide"},
        ],
        "items": [
            {"product_key": k, "session": "AM", "step": i, "days": [0]}
            for i, k in enumerate(["c", "n"], start=1)
        ],
    }
    warnings = client.post("/routine/check", json=body).json()["warnings"]
    (myth,) = [w for w in warnings if w["rule"]["key"] == MYTH]
    assert myth["rule"]["plain_vi"] == myth_with_plain


# --- Automatic checks ---

ORIGINAL = (
    "Dùng retinoid cùng với sản phẩm chứa AHA/BHA (ví dụ glycolic acid) có thể làm da khô "
    "và dễ kích ứng hơn trong 2 tuần đầu."
)


def test_check_plain_accepts_a_faithful_version() -> None:
    assert check_plain(ORIGINAL, "Retinoid dùng cùng AHA/BHA có thể làm da khô, dễ rát.") == []


def test_check_plain_flags_lost_hedging() -> None:
    assert check_plain(ORIGINAL, "Retinoid với AHA làm da khô.") == [
        'bản mới ít "có thể" hơn bản gốc (bản gốc 1, bản mới 0)'
    ]


def test_check_plain_flags_dropping_can_consider() -> None:
    original = "Nếu da bị kích ứng, có thể cân nhắc tạm ngưng sản phẩm chứa acid."
    assert check_plain(original, "Nếu da rát, có thể tạm ngưng sản phẩm có acid.") == [
        'bản mới ít "có thể cân nhắc" hơn bản gốc (bản gốc 1, bản mới 0)'
    ]


def test_hedge_losses_count_whole_words() -> None:
    original = (
        "Một số người thường bị khô da; phần lớn nghiên cứu còn ít, chưa rõ và chưa thống nhất."
    )
    assert hedge_losses(original, original) == []
    assert hedge_losses(original, "Da khô.") == [
        ("thường", 1, 0),
        ("một số", 1, 0),
        ("phần lớn", 1, 0),
        ("chưa thống nhất", 1, 0),
        ("chưa rõ", 1, 0),
        ("ít", 1, 0),
    ]
    # "bình thường" (normal) and "ít nhất" (at least) are not hedges; nor is "ít" in "ítem".
    assert hedge_losses("Da bình thường, dùng ít nhất 2 tuần.", "Da khô.") == []
    # Fewer times counts, not only none.
    assert hedge_losses("Có thể khô. Có thể rát.", "Có thể khô, rát.") == [("có thể", 2, 1)]


def test_check_plain_flags_new_names_and_numbers() -> None:
    warnings = check_plain(ORIGINAL, "Retinoid với PHA hay lactic acid có thể khô da 10%.")
    assert warnings == [
        "bản mới có tên không có trong bản gốc: lactic, pha",
        "bản mới có số không có trong bản gốc: 10",
    ]
    # The original's own names and numbers are fine.
    assert check_plain(ORIGINAL, "Glycolic acid và retinoid có thể làm khô da 2 tuần.") == []


def test_check_plain_flags_longer_text() -> None:
    longer = ORIGINAL + " Có thể."
    assert check_plain(ORIGINAL, longer) == [
        f"bản mới dài hơn bản gốc ({len(longer)} so với {len(ORIGINAL)} ký tự)"
    ]


def test_check_plain_flags_treatment_words_but_not_gia_tri() -> None:
    assert check_plain(ORIGINAL, "Có thể trị mụn.") == [
        'bản mới có nhiều chữ kiểu "trị" / "chữa" hơn bản gốc (bản gốc 0, bản mới 1)'
    ]
    assert check_plain(ORIGINAL, "Có thể giữ giá trị.") == []
    assert check_plain(ORIGINAL, "Có thể tri mun.") == [  # typed without diacritics
        'bản mới có nhiều chữ kiểu "trị" / "chữa" hơn bản gốc (bản gốc 0, bản mới 1)'
    ]
    # Only a rise counts: the original's own "điều trị" is not the plain version's fault.
    original = "Thuốc điều trị mụn có thể làm khô da, nhất là trong những tuần đầu tiên."
    assert check_plain(original, "Thuốc trị mụn có thể làm khô da.") == []
    assert check_plain(original, "Thuốc trị mụn có thể làm khô, trị cả da.") == [
        'bản mới có nhiều chữ kiểu "trị" / "chữa" hơn bản gốc (bản gốc 1, bản mới 2)'
    ]


def test_check_plain_flags_a_version_that_is_not_much_shorter() -> None:
    original = "Có thể " + "da " * 31  # 100 characters
    assert check_plain(original, "Có thể " + "da " * 26) == []  # 85%: fine
    assert check_plain(original, "Có thể " + "da " * 26 + "a") == [
        "bản mới chưa ngắn hơn rõ rệt (86 so với 100 ký tự, 86%; nên ≤ 85%)"
    ]


def test_latin_names_skip_plain_vietnamese_words() -> None:
    text_ = "trong theo nhau nhanh thanh khi glycolic Acid retinol BHA tretinoin"
    assert latin_names(text_) == {"glycolic", "acid", "retinol", "bha", "tretinoin"}


# --- Choosing rules ---


LONG = "x" * plain.MIN_EXPLANATION_CHARS


def rule(key: str, published: bool = True, explanation: str = LONG, **extra) -> dict:
    return {
        "key": key,
        "title_vi": "Tiêu đề",
        "severity": "caution",
        "explanation_vi": f"{explanation} {key}",
        "published": published,
        **extra,
    }


def test_rules_to_draft() -> None:
    fresh = rule("fresh", plain_vi="p", plain_for=explanation_hash(f"{LONG} fresh"))
    stale = rule("stale", plain_vi="p", plain_for="000000000000")
    typo = rule("typo", plain_vi=1, plain_for=explanation_hash(f"{LONG} typo"))
    short = rule("short", explanation="ngắn")
    rules = [rule("missing"), rule("draft", published=False), fresh, stale, typo, short]

    assert [r["key"] for r in rules_to_draft(rules, [])] == ["missing", "stale", "typo"]
    assert plain.skipped_as_short(rules) == ["short"]
    # Named keys: exactly those, published or not, short or not, already drafted or not.
    assert [r["key"] for r in rules_to_draft(rules, ["fresh", "draft", "short"])] == [
        "draft",
        "fresh",
        "short",
    ]
    with pytest.raises(ValueError, match="nope"):
        rules_to_draft(rules, ["fresh", "nope"])
    assert rules_to_draft([fresh], []) == []
    # Exactly the threshold counts as long enough.
    edge = {"key": "edge", "published": True, "explanation_vi": "y" * 200}
    assert rules_to_draft([edge], []) == [edge]
    assert plain.skipped_as_short([{**edge, "explanation_vi": "y" * 199}]) == ["edge"]


def test_prompt_has_the_rule_and_its_quotes() -> None:
    r = {
        "key": "k",
        "title_vi": "Tiêu đề",
        "severity": "caution",
        "explanation_vi": "Giải thích.",
        "sources": [{"url": URL, "quote": "A  quoted\npassage."}],
    }
    prompt = plain.build_prompt(r)
    assert "explanation_vi: Giải thích." in prompt and "severity: caution" in prompt
    assert "<source_quote>A quoted passage.</source_quote>" in prompt


# --- The command, with a fake model ---


@pytest.fixture
def api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "test-key")


def test_main_writes_a_reviewable_file(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, api_key, capsys
) -> None:
    rules = {r["key"]: r for r in load_toml("rules.toml")["rule"]}
    keys = ["retinoid-exfoliant-acid-same-session", MYTH]
    prompts: list[str] = []

    def fake_model(prompt: str) -> tuple[ModelPlain, str]:
        prompts.append(prompt)
        if MYTH in prompt or rules[MYTH]["explanation_vi"] in prompt:
            raise DraftingError("the AI service is busy; try again in a minute", 503)
        return ModelPlain(plain_vi="Dùng chung làm khô  da.", notes_vi="Rút gọn.\nDòng 2."), "m-1"

    monkeypatch.setattr(plain, "call_model", fake_model)
    code = plain.main(keys, out_dir=tmp_path, now=datetime(2026, 11, 6, 9, 5))

    assert code == 1  # one model call failed; the file still lists it
    assert len(prompts) == 2
    path = tmp_path / "20261106-0905.toml"
    content = path.read_text(encoding="utf-8")
    parsed = tomllib.loads(content)  # one rule's lines; the failed one is comments only
    explanation = rules["retinoid-exfoliant-acid-same-session"]["explanation_vi"]
    assert parsed == {
        "plain_vi": "Dùng chung làm khô da.",
        "plain_for": explanation_hash(explanation),
    }
    assert (
        "# retinoid-exfoliant-acid-same-session\n# Ghi chú của AI: Rút gọn.\n#   Dòng 2." in content
    )
    assert '#   - bản mới ít "có thể" hơn bản gốc (bản gốc 2, bản mới 0)' in content
    assert f"# Bản gốc: {explanation}" in content
    assert "plain_reviewed_at = 2026-11-06" in content  # how to write the date
    assert '# plain_reviewed_by = ""   # người duyệt tự điền sau khi đọc' in content
    assert "plain_reviewed_by =" not in content.replace("# plain_reviewed_by =", "")
    assert f"# {MYTH}\n# LỖI khi gọi model: the AI service is busy" in content
    out = capsys.readouterr().out
    assert str(path) in out and "2 luật, 1 bản nháp, 1 lỗi" in out

    # A second run in the same minute does not overwrite the first file.
    monkeypatch.setattr(
        plain,
        "call_model",
        lambda p: (
            ModelPlain(
                plain_vi="Retinoid cùng AHA/BHA có thể làm da khô, dễ rát. "
                "Nếu da rát, có thể cân nhắc tạm ngưng sản phẩm có acid.",
                notes_vi="",
            ),
            "m",
        ),
    )
    assert plain.main(keys[:1], out_dir=tmp_path, now=datetime(2026, 11, 6, 9, 5)) == 0
    second = (tmp_path / "20261106-0905-2.toml").read_text(encoding="utf-8")
    assert "# Cảnh báo kiểm tự động: (không có)" in second


def test_main_stops_at_a_key_error(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, api_key, capsys
) -> None:
    keys = ["retinoid-exfoliant-acid-same-session", MYTH, "retinoid-duplicate-same-session"]
    calls: list[str] = []

    def bad_key(prompt: str):
        calls.append(prompt)
        raise DraftingError("AI drafting is not set up: invalid x-api-key", 503, setup=True)

    monkeypatch.setattr(plain, "call_model", bad_key)
    assert plain.main(keys, out_dir=tmp_path, now=datetime(2026, 11, 6, 9, 5)) == 2
    assert len(calls) == 1  # stopped after the first rule
    in_toml_order = [r["key"] for r in rules_to_draft(load_toml("rules.toml")["rule"], keys)]
    content = (tmp_path / "20261106-0905.toml").read_text(encoding="utf-8")
    assert f"# {keys[0]}\n# LỖI khi gọi model: AI drafting is not set up" in content
    assert content.endswith(
        "# DỪNG vì lỗi khoá / quyền truy cập AI. Chưa soạn các luật:\n"
        + "".join(f"#   {key}\n" for key in in_toml_order[1:])
    )
    assert "Chưa soạn 2 luật" in capsys.readouterr().err


def test_main_goes_on_after_other_errors(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, api_key
) -> None:
    keys = ["retinoid-exfoliant-acid-same-session", MYTH]
    calls: list[str] = []

    def busy(prompt: str):
        calls.append(prompt)
        raise DraftingError("the AI service is busy; try again in a minute", 503)

    monkeypatch.setattr(plain, "call_model", busy)
    assert plain.main(keys, out_dir=tmp_path) == 1
    assert len(calls) == 2
    (path,) = tmp_path.iterdir()
    assert "DỪNG" not in path.read_text(encoding="utf-8")


def test_main_without_a_key_fails_clearly(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys
) -> None:
    monkeypatch.setattr(get_settings(), "anthropic_api_key", None)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    called = []
    monkeypatch.setattr(plain, "call_model", lambda p: called.append(p))
    assert plain.main([], out_dir=tmp_path) == 2
    assert "ANTHROPIC_API_KEY" in capsys.readouterr().err
    assert called == [] and list(tmp_path.iterdir()) == []


def test_main_rejects_unknown_keys(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, api_key, capsys
) -> None:
    monkeypatch.setattr(plain, "call_model", lambda p: pytest.fail("no call expected"))
    assert plain.main(["no-such-rule"], out_dir=tmp_path) == 2
    assert "no-such-rule" in capsys.readouterr().err
    assert list(tmp_path.iterdir()) == []


def test_main_reports_rules_skipped_as_short(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, api_key, capsys
) -> None:
    rules = [rule("long"), rule("short", explanation="ngắn")]
    monkeypatch.setattr(plain, "load_toml", lambda name: {"rule": rules})
    drafted: list[str] = []

    def fake_model(prompt: str) -> tuple[ModelPlain, str]:
        drafted.append(prompt)
        return ModelPlain(plain_vi="x", notes_vi=""), "m"

    monkeypatch.setattr(plain, "call_model", fake_model)
    assert plain.main([], out_dir=tmp_path) == 0
    assert len(drafted) == 1 and "long" in drafted[0]
    out = capsys.readouterr().out
    assert "Bỏ qua 1 luật đã bật có lời giải thích ngắn (< 200 ký tự): short." in out
    # Named, a short rule is drafted and nothing is reported as skipped.
    assert plain.main(["short"], out_dir=tmp_path) == 0
    assert "Bỏ qua" not in capsys.readouterr().out


def test_main_with_nothing_to_draft_writes_nothing(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, api_key
) -> None:
    monkeypatch.setattr(plain, "load_toml", lambda name: {"rule": [rule("d", published=False)]})
    monkeypatch.setattr(plain, "call_model", lambda p: pytest.fail("no call expected"))
    assert plain.main([], out_dir=tmp_path) == 0
    assert list(tmp_path.iterdir()) == []


def test_no_route_module_imports_the_drafting_modules() -> None:
    """Only the review page's drafts and label reading call AI; app.plain is script-only."""
    app_dir = Path(plain.__file__).parent
    imports = ("from app.plain", "import app.plain", "from app import plain")
    users = [
        p.name for p in app_dir.glob("*.py") if any(i in p.read_text("utf-8") for i in imports)
    ]
    assert users == []
    anthropic_users = sorted(
        p.name for p in app_dir.glob("*.py") if "import anthropic" in p.read_text("utf-8")
    )
    assert anthropic_users == ["drafts.py", "label_reader.py"]
