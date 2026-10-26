import hashlib
import json
import tomllib
import urllib.error
from collections.abc import Iterator

import anthropic
import httpx2
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text

from app import drafts, review_api
from app.config import get_settings
from app.drafts import DraftingError, ModelDraft, ModelQuote, ModelSource, toml_str
from app.reviewers import check_password, hash_password, set_reviewer
from app.rules import rule_problems

NAME, PASSWORD = "Người duyệt thử", "mat-khau-thu-nghiem"
MYTH = "vitamin-c-niacinamide-myth"
RAW_QUESTION = "Tôi tên Lan, 0901234567. Vitamin C và niacinamide có kỵ nhau không?"
PUBLIC_QUESTION = "Vitamin C và niacinamide có kỵ nhau không?"
SOURCE = "https://example.org/study"
REAL_ANTHROPIC = anthropic.Anthropic
PAGE = (
    "Results. Niacinamide and ascorbic acid, applied together twice daily, were well "
    "tolerated by all 40 participants. No serious adverse events occurred."
)


@pytest.fixture(scope="module")
def reviewer(engine: Engine) -> Iterator[str]:
    with engine.begin() as conn:
        set_reviewer(conn, NAME, PASSWORD)
    yield NAME
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM reviewers WHERE name = :n"), {"n": NAME})


def login(client: TestClient) -> dict[str, str]:
    response = client.post("/review/login", json={"name": NAME, "password": PASSWORD})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['token']}"}


@pytest.fixture
def auth(client: TestClient, reviewer: str) -> dict[str, str]:
    return login(client)


@pytest.fixture
def question(engine: Engine) -> Iterator[int]:
    with engine.begin() as conn:
        question_id = conn.execute(
            text(
                "INSERT INTO user_questions (question, group_codes) "
                "VALUES (:q, '{NIACINAMIDE,VITAMIN_C}') RETURNING id"
            ),
            {"q": RAW_QUESTION},
        ).scalar_one()
    yield question_id
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM rule_drafts WHERE question_id = :id"), {"id": question_id})
        conn.execute(text("DELETE FROM user_questions WHERE id = :id"), {"id": question_id})


@pytest.fixture
def unpublished_rule(engine: Engine) -> Iterator[str]:
    key = "test-unpublished-myth"
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO rules (key, kind, severity, scope, evidence_level, group_a, group_b,
                                   title_vi, explanation_vi, published)
                VALUES (:key, 'myth', 'info', 'same_session', 'low', 'RETINOID', 'NIACINAMIDE',
                        'Thẻ thử', 'Chưa bật.', false)
                """
            ),
            {"key": key},
        )
    yield key
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM rules WHERE key = :key"), {"key": key})


def test_password_hash() -> None:
    stored = hash_password("correct horse battery")
    assert check_password("correct horse battery", stored)
    assert not check_password("correct horse batterY", stored)
    assert hash_password("correct horse battery") != stored  # salted


def test_review_routes_need_sign_in(client: TestClient) -> None:
    bogus = {"Authorization": "Bearer not-a-token"}
    for headers in ({}, bogus):
        assert client.get("/review/questions", headers=headers).status_code == 401
        assert client.get("/review/rules", headers=headers).status_code == 401
        assert client.get("/review/drafts", headers=headers).status_code == 401
        draft = {"group_a": "VITAMIN_C", "group_b": "NIACINAMIDE", "source_urls": [SOURCE]}
        assert client.post("/review/drafts", json=draft, headers=headers).status_code == 401
        assert client.put("/review/questions/1", json={"status": "new"}).status_code == 401


def test_login_rejects_wrong_password_and_unknown_name(client: TestClient, reviewer: str) -> None:
    wrong = client.post("/review/login", json={"name": NAME, "password": "nope"})
    assert wrong.status_code == 401
    unknown = client.post("/review/login", json={"name": "Ai đó", "password": PASSWORD})
    assert unknown.status_code == 401


def test_session_lasts_until_logout(client: TestClient, auth: dict[str, str]) -> None:
    assert client.get("/review/me", headers=auth).json() == {"name": NAME}
    assert client.post("/review/logout", headers=auth).status_code == 204
    assert client.get("/review/me", headers=auth).status_code == 401


def test_expired_session_is_rejected(client: TestClient, engine: Engine, reviewer: str) -> None:
    token = "expired-token"
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO reviewer_sessions (token_hash, reviewer, expires_at) "
                "VALUES (:hash, :name, now() - interval '1 minute')"
            ),
            {"hash": hashlib.sha256(token.encode()).hexdigest(), "name": NAME},
        )
    assert client.get("/review/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_review_lists_questions_with_counts(
    client: TestClient, auth: dict[str, str], question: int
) -> None:
    body = client.get("/review/questions", params={"status": "new"}, headers=auth).json()
    listed = {q["id"]: q for q in body["questions"]}
    assert listed[question]["question"] == RAW_QUESTION
    assert listed[question]["group_codes"] == ["NIACINAMIDE", "VITAMIN_C"]
    assert listed[question]["public"] is False
    assert set(body["counts"]) == {"new", "accepted", "rejected", "answered"}
    assert body["counts"]["new"] >= 1
    rejected = client.get("/review/questions", params={"status": "rejected"}, headers=auth).json()
    assert question not in {q["id"] for q in rejected["questions"]}


def test_answered_question_is_shown_in_the_reviewer_wording(
    client: TestClient, auth: dict[str, str], question: int
) -> None:
    update = {"status": "answered", "rule_key": MYTH, "public_question": PUBLIC_QUESTION}
    response = client.put(f"/review/questions/{question}", json=update, headers=auth)
    assert response.status_code == 200
    reviewed = response.json()
    assert reviewed["public"] is True
    assert reviewed["rule"]["key"] == MYTH
    assert reviewed["updated_by"] == NAME

    answered = {q["id"]: q for q in client.get("/questions/answered").json()}
    assert answered[question]["question"] == PUBLIC_QUESTION
    assert answered[question]["rule"]["key"] == MYTH
    assert answered[question]["rule"]["sources"]
    assert "0901234567" not in json.dumps(answered[question])


def test_answering_needs_a_known_rule_and_public_wording(
    client: TestClient, auth: dict[str, str], question: int
) -> None:
    url = f"/review/questions/{question}"
    no_rule = {"status": "answered", "public_question": PUBLIC_QUESTION}
    assert client.put(url, json=no_rule, headers=auth).status_code == 422
    no_wording = {"status": "answered", "rule_key": MYTH}
    assert client.put(url, json=no_wording, headers=auth).status_code == 422
    unknown = {"status": "accepted", "rule_key": "no-such-rule"}
    assert client.put(url, json=unknown, headers=auth).status_code == 422
    assert (
        client.put("/review/questions/999999", json={"status": "new"}, headers=auth).status_code
        == 404
    )


def test_question_answered_by_an_unpublished_rule_stays_hidden(
    client: TestClient, auth: dict[str, str], question: int, unpublished_rule: str
) -> None:
    update = {"status": "answered", "rule_key": unpublished_rule, "public_question": "Câu hỏi?"}
    reviewed = client.put(f"/review/questions/{question}", json=update, headers=auth).json()
    assert reviewed["rule"]["published"] is False
    assert reviewed["public"] is False
    assert question not in {q["id"] for q in client.get("/questions/answered").json()}
    rules = {r["key"]: r for r in client.get("/review/rules", headers=auth).json()}
    assert rules[unpublished_rule]["published"] is False
    assert rules[MYTH]["published"] is True


def model_draft(**overrides) -> ModelDraft:
    fields = {
        "answerable": True,
        "title_vi": "Vitamin C và niacinamide: dung nạp tốt khi dùng chung",
        "explanation_vi": 'Lời đồn cho rằng hai chất kỵ nhau. Một nghiên cứu nhỏ "40 người".',
        "severity": "info",
        "scope": "same_session",
        "evidence_level": "low",
        "sources": [
            ModelSource(url=SOURCE, title="A small trial", publisher="Example Journal (2024)"),
            ModelSource(url="https://invented.example/x", title="Made up", publisher="?"),
        ],
        "quotes": [
            # Case and line breaks differ from the page: still found.
            ModelQuote(
                url=SOURCE,
                quote="niacinamide and ascorbic acid, applied together\n"
                "twice daily, were well tolerated",
            ),
            ModelQuote(url=SOURCE, quote="The combination is completely safe."),  # paraphrase
            ModelQuote(url="https://invented.example/x", quote="No serious adverse events"),
        ],
        "reviewer_notes_vi": "Chỉ có 40 người.\nKhông nói về sản phẩm riêng lẻ.",
    }
    return ModelDraft(**(fields | overrides))


def test_ai_draft_checks_quotes_and_never_becomes_a_rule(
    client: TestClient,
    engine: Engine,
    auth: dict[str, str],
    question: int,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fetched: list[tuple[str, bool]] = []

    def fake_fetch(url: str, keep_scripts: bool = True) -> str:
        fetched.append((url, keep_scripts))
        return PAGE

    prompts: list[str] = []

    def fake_model(prompt: str) -> tuple[ModelDraft, str]:
        prompts.append(prompt)
        return model_draft(), "claude-opus-5-5"

    monkeypatch.setattr(drafts, "fetch_text", fake_fetch)
    monkeypatch.setattr(review_api, "call_model", fake_model)
    request = {
        "question_id": question,
        "group_a": "VITAMIN_C",
        "group_b": "NIACINAMIDE",
        "source_urls": [SOURCE, SOURCE],
        "instructions": "Chú ý cỡ mẫu.",
    }
    response = client.post("/review/drafts", json=request, headers=auth)
    assert response.status_code == 201, response.text
    draft = response.json()

    assert fetched == [(SOURCE, False)]  # readable text only, each page once
    assert RAW_QUESTION in prompts[0] and PAGE in prompts[0] and "Chú ý cỡ mẫu." in prompts[0]
    assert "<example_card>" in prompts[0]  # published myth cards as style examples
    assert [q["found"] for q in draft["quotes"]] == [True, False, False]
    assert draft["quotes"][0]["quote"].count("\n") == 0
    assert [s["url"] for s in draft["sources"]] == [SOURCE]  # URLs nobody gave are dropped
    assert draft["status"] == "draft" and draft["created_by"] == NAME
    assert draft["key"] == "vitamin-c-niacinamide-myth-2"  # the seeded key is taken

    # The TOML pastes into rules.toml as an unpublished rule that the seed accepts.
    parsed = tomllib.loads(draft["toml"])
    [rule] = parsed["rule"]
    assert rule["published"] is False
    assert "reviewed_by" not in rule
    assert rule["sources"] == [{"url": SOURCE, "quote": draft["quotes"][0]["quote"]}]
    assert parsed["source"] == [
        {
            "url": SOURCE,
            "title": "A small trial",
            "publisher": "Example Journal (2024)",
            "accessed_at": parsed["source"][0]["accessed_at"],
        }
    ]
    assert rule_problems(rule, {SOURCE}) == []
    assert "CHƯA KIỂM DUYỆT" in draft["toml"]
    assert "#   Không nói về sản phẩm riêng lẻ." in draft["toml"]

    # Drafts are not rules: users and the engine never see them.
    with engine.connect() as conn:
        row = conn.execute(text("SELECT 1 FROM rules WHERE key = :k"), {"k": draft["key"]})
        assert row.first() is None
    assert draft["key"] not in {r["key"] for r in client.get("/rules").json()["rules"]}

    listed = client.get("/review/questions", headers=auth).json()["questions"]
    assert {q["id"]: q for q in listed}[question]["draft_ids"] == [draft["id"]]
    assert draft["id"] in {d["id"] for d in client.get("/review/drafts", headers=auth).json()}

    discarded = client.patch(
        f"/review/drafts/{draft['id']}", json={"status": "discarded"}, headers=auth
    )
    assert discarded.json()["status"] == "discarded"
    assert draft["id"] not in {d["id"] for d in client.get("/review/drafts", headers=auth).json()}
    old = client.get("/review/drafts", params={"status": "discarded"}, headers=auth).json()
    assert draft["id"] in {d["id"] for d in old}


def test_draft_stops_when_a_source_cannot_be_fetched(
    client: TestClient, engine: Engine, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    def broken_fetch(url: str, keep_scripts: bool = True) -> str:
        raise urllib.error.URLError("connection refused")

    def no_model(prompt: str) -> tuple[ModelDraft, str]:
        raise AssertionError("the model must not run without its sources")

    monkeypatch.setattr(drafts, "fetch_text", broken_fetch)
    monkeypatch.setattr(review_api, "call_model", no_model)
    with engine.connect() as conn:
        before = conn.execute(text("SELECT count(*) FROM rule_drafts")).scalar_one()
    request = {"group_a": "VITAMIN_C", "group_b": "NIACINAMIDE", "source_urls": [SOURCE]}
    response = client.post("/review/drafts", json=request, headers=auth)
    assert response.status_code == 422
    assert SOURCE in response.json()["detail"]
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM rule_drafts")).scalar_one() == before


def test_draft_request_validation(client: TestClient, auth: dict[str, str]) -> None:
    base = {"group_a": "VITAMIN_C", "group_b": "NIACINAMIDE", "source_urls": [SOURCE]}
    for bad in (
        {**base, "source_urls": []},
        {**base, "source_urls": ["file:///etc/passwd"]},
        {**base, "source_urls": [SOURCE + str(i) for i in range(6)]},
        {**base, "group_a": "NOPE"},
    ):
        assert client.post("/review/drafts", json=bad, headers=auth).status_code == 422
    missing = {**base, "question_id": 999999}
    assert client.post("/review/drafts", json=missing, headers=auth).status_code == 404


def fake_anthropic(monkeypatch: pytest.MonkeyPatch, handler) -> list[dict]:
    """Run the real SDK against a fake HTTP server; returns the request bodies sent."""
    sent: list[dict] = []

    def handle(request: httpx2.Request) -> httpx2.Response:
        sent.append(json.loads(request.content))
        return handler(request)

    def client(**kwargs):
        transport = httpx2.MockTransport(handle)
        return REAL_ANTHROPIC(
            api_key="test-key", http_client=httpx2.Client(transport=transport), max_retries=0
        )

    monkeypatch.setattr(drafts.anthropic, "Anthropic", client)
    return sent


def message(stop_reason: str, text_: str) -> dict:
    return {
        "id": "msg_test",
        "type": "message",
        "role": "assistant",
        "model": "claude-opus-5-5",
        "content": [{"type": "text", "text": text_}] if text_ else [],
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": {"input_tokens": 10, "output_tokens": 10},
    }


def test_call_model_sends_a_structured_request(monkeypatch: pytest.MonkeyPatch) -> None:
    expected = model_draft()
    sent = fake_anthropic(
        monkeypatch,
        lambda r: httpx2.Response(200, json=message("end_turn", expected.model_dump_json())),
    )
    draft, model = drafts.call_model("the prompt")
    assert draft == expected and model == "claude-opus-5-5"
    [body] = sent
    assert body["model"] == get_settings().draft_model
    assert body["messages"] == [{"role": "user", "content": "the prompt"}]
    assert body["system"] == drafts.SYSTEM_PROMPT
    assert body["output_config"]["effort"] == "high"
    assert body["output_config"]["format"]["type"] == "json_schema"
    assert body["fallbacks"] == "default"
    assert "thinking" not in body and "temperature" not in body


def test_call_model_reports_refusals_and_outages(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_anthropic(monkeypatch, lambda r: httpx2.Response(200, json=message("refusal", "")))
    with pytest.raises(DraftingError) as refused:
        drafts.call_model("prompt")
    assert refused.value.status == 502

    error = {"type": "error", "error": {"type": "authentication_error", "message": "bad key"}}
    fake_anthropic(monkeypatch, lambda r: httpx2.Response(401, json=error))
    with pytest.raises(DraftingError) as unauthorised:
        drafts.call_model("prompt")
    assert unauthorised.value.status == 503


def test_toml_strings_round_trip() -> None:
    tricky = 'Trích "nguyên văn" \\ có\tdấu tab, xuống\ndòng và ký tự \u0001'
    assert tomllib.loads(f"x = {toml_str(tricky)}")["x"] == tricky
