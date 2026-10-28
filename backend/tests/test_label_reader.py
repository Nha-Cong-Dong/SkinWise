import base64
import json
import uuid

import anthropic
import httpx2
import pytest
from fastapi.testclient import TestClient

from app import label_reader
from app.accounts import POLICY_VERSION, reset_rate_limits
from app.config import get_settings
from app.label_reader import LabelReadingError, ModelLabel

REAL_ANTHROPIC = anthropic.Anthropic
# A 1x1 PNG: the route only checks that the data is base64; the model is replaced.
PIXEL = base64.b64encode(
    bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de"
        "0000000c4944415408d763f8cfc000000301010018dd8db40000000049454e44ae426082"
    )
).decode()


def photo(data: str = PIXEL, media_type: str = "image/png") -> dict:
    return {"media_type": media_type, "data": data}


@pytest.fixture
def signed_in(client: TestClient) -> TestClient:
    """The client with a fresh verified account signed in: each photo is a billed call."""
    reset_rate_limits()
    email, password = f"label-{uuid.uuid4().hex[:8]}@example.com", "mot cum tu de nho"
    registered = client.post(
        "/auth/register",
        json={"email": email, "password": password, "consent": True,
              "policy_version": POLICY_VERSION},
    )  # fmt: skip
    token = registered.json()["dev_link"].split("token=")[1]
    verified = client.post("/auth/verify-email", json={"token": token, "password": password})
    assert verified.status_code == 200, verified.text
    return client


def test_read_label_needs_sign_in(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def must_not_run(media_type: str, data: str) -> ModelLabel:
        raise AssertionError("the model was called")

    monkeypatch.setattr(label_reader, "call_model", must_not_run)
    assert client.post("/label/read", json=photo()).status_code == 401


def test_read_label_returns_the_text_for_checking(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    seen = []

    def model(media_type: str, data: str) -> ModelLabel:
        seen.append((media_type, data))
        return ModelLabel(found=True, text=" Ingredients: Aqua, [?], Niacinamide, Sali[?] \n")

    monkeypatch.setattr(label_reader, "call_model", model)
    response = signed_in.post("/label/read", json=photo())
    assert response.status_code == 200
    assert response.json() == {
        "found": True,
        "text": "Ingredients: Aqua, [?], Niacinamide, Sali[?]",
        "unreadable_count": 2,
    }
    assert seen == [("image/png", PIXEL)]


def test_read_label_without_a_list(signed_in: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    # Text the model returns despite found=false is dropped, never shown as a list.
    monkeypatch.setattr(
        label_reader, "call_model", lambda m, d: ModelLabel(found=False, text="SPF 50")
    )
    body = signed_in.post("/label/read", json=photo()).json()
    assert body == {"found": False, "text": "", "unreadable_count": 0}


def test_read_label_refuses_bad_input_before_calling_the_model(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def must_not_run(media_type: str, data: str) -> ModelLabel:
        raise AssertionError("the model was called")

    monkeypatch.setattr(label_reader, "call_model", must_not_run)
    assert signed_in.post("/label/read", json=photo(data="not base64!")).status_code == 422
    assert signed_in.post("/label/read", json=photo(media_type="image/heic")).status_code == 422
    assert signed_in.post("/label/read", json=photo(data="")).status_code == 422


def test_read_label_passes_on_model_errors(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def not_set_up(media_type: str, data: str) -> ModelLabel:
        raise LabelReadingError("reading photos is not set up: no Anthropic API key", 503)

    monkeypatch.setattr(label_reader, "call_model", not_set_up)
    response = signed_in.post("/label/read", json=photo())
    assert response.status_code == 503
    assert "not set up" in response.json()["detail"]


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

    monkeypatch.setattr(label_reader.anthropic, "Anthropic", client)
    return sent


def message(stop_reason: str, text: str) -> dict:
    return {
        "id": "msg_test",
        "type": "message",
        "role": "assistant",
        "model": "claude-opus-5-5",
        "content": [{"type": "text", "text": text}] if text else [],
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": {"input_tokens": 10, "output_tokens": 10},
    }


def test_call_model_sends_the_photo_with_a_transcription_prompt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A model that takes fallbacks, whatever the developer's .env chose.
    monkeypatch.setattr(get_settings(), "label_model", "claude-opus-5-5")
    expected = ModelLabel(found=True, text="Aqua, Glycerin")
    sent = fake_anthropic(
        monkeypatch,
        lambda r: httpx2.Response(200, json=message("end_turn", expected.model_dump_json())),
    )
    assert label_reader.call_model("image/png", PIXEL) == expected
    [body] = sent
    assert body["model"] == get_settings().label_model
    assert body["system"] == label_reader.SYSTEM_PROMPT
    [user] = body["messages"]
    image, instruction = user["content"]
    assert image == {
        "type": "image",
        "source": {"type": "base64", "media_type": "image/png", "data": PIXEL},
    }
    assert instruction["type"] == "text"
    assert body["output_config"]["effort"] == "medium"
    assert body["output_config"]["format"]["type"] == "json_schema"
    assert body["fallbacks"] == "default"
    assert "thinking" not in body and "temperature" not in body


def test_call_model_reports_refusals_bad_images_and_outages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def status_of(response: httpx2.Response) -> int:
        fake_anthropic(monkeypatch, lambda r: response)
        with pytest.raises(LabelReadingError) as error:
            label_reader.call_model("image/png", PIXEL)
        return error.value.status

    def api_error(kind: str) -> dict:
        return {"type": "error", "error": {"type": kind, "message": "x"}}

    assert status_of(httpx2.Response(200, json=message("refusal", ""))) == 502
    assert status_of(httpx2.Response(401, json=api_error("authentication_error"))) == 503
    assert status_of(httpx2.Response(400, json=api_error("invalid_request_error"))) == 422
    assert status_of(httpx2.Response(500, json=api_error("api_error"))) == 502
