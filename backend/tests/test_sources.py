import pytest

from app import sources
from app.sources import BlockedError, first_out_of_order, missing_on_page


def test_missing_on_page_ignores_case_whitespace_and_dash_variants() -> None:
    page = "Benzoyl  peroxide may\noxidize a retinoid – such as tretinoin."
    assert (
        missing_on_page(page, ["benzoyl peroxide may oxidize a retinoid - such as tretinoin"]) == []
    )
    assert missing_on_page(page, ["adapalene"]) == ["adapalene"]


def test_first_out_of_order() -> None:
    page = "Aqua, Glycerin, Niacinamide"
    assert first_out_of_order(page, ["Aqua", "Glycerin", "Niacinamide"]) is None
    assert first_out_of_order(page, ["Niacinamide", "Aqua"]) == "Aqua"


class FakeResponse:
    def __init__(self, body: str) -> None:
        self.body = body.encode()
        self.headers = self

    def get_content_charset(self) -> str:
        return "utf-8"

    def read(self) -> bytes:
        return self.body

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *args: object) -> None:
        pass


def test_bot_challenge_page_raises_instead_of_reporting_missing_quotes(monkeypatch) -> None:
    challenge = "<script>grecaptcha.enterprise.execute('x')</script>"
    monkeypatch.setattr(sources.urllib.request, "urlopen", lambda *a, **k: FakeResponse(challenge))
    with pytest.raises(BlockedError):
        sources.fetch_text("https://example.org")


@pytest.mark.parametrize(
    "marker",
    [
        '<input type="hidden" class="g-recaptcha-response" name="newsletter">',
        "<script>a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js'</script>",
    ],
)
def test_real_page_with_challenge_marker_is_not_blocked(monkeypatch, marker: str) -> None:
    page = f"<p>Ingredients: Aqua, Glycerin, Niacinamide. {'Product details. ' * 200}</p>{marker}"
    monkeypatch.setattr(sources.urllib.request, "urlopen", lambda *a, **k: FakeResponse(page))
    assert "Aqua, Glycerin, Niacinamide" in sources.fetch_text("https://example.org")


def test_readable_text_drops_scripts_and_styles(monkeypatch) -> None:
    page = (
        '<p>Visible text.</p><script type="application/ld+json">{"ingredients": "Aqua"}'
        "</script><style>p { color: red }</style><p>More text.</p>"
    )
    monkeypatch.setattr(sources.urllib.request, "urlopen", lambda *a, **k: FakeResponse(page))
    assert "Aqua" in sources.fetch_text("https://example.org")
    readable = sources.fetch_text("https://example.org", keep_scripts=False)
    assert "Aqua" not in readable and "color" not in readable
    assert " ".join(readable.split()) == "Visible text. More text."
