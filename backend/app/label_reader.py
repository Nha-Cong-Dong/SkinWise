"""Read the ingredient list off a photo of a label (direction G).

The model only copies what it can see: it writes [?] where it cannot read and never completes
a list from what it knows about the product (CLAUDE.md: the AI never "remembers" a product's
ingredients). Nothing is analysed here. The text goes into the paste box, where the user
compares it with the package and corrects it before analysing it like any pasted list. The
photo is neither stored nor logged.
"""

import base64
import binascii
from dataclasses import dataclass
from typing import Any

import anthropic
from pydantic import BaseModel

from app.config import get_settings
from app.drafts import FALLBACK_MODELS

# Per-image limit of the Claude API (base64). The frontend downscales well below it.
MAX_IMAGE_BASE64 = 10_000_000
MEDIA_TYPES = ("image/jpeg", "image/png", "image/webp", "image/gif")
UNREADABLE = "[?]"

SYSTEM_PROMPT = f"""\
You transcribe the ingredient list printed on a cosmetic product label from a photo, for \
SkinWise, a Vietnamese app that checks skincare routines. A user will compare your text with \
the package and correct it before the app reads it, so a visible gap is far better than a \
plausible guess: one wrong active ingredient name can hide a warning.

- Copy exactly what is printed, in the printed order: names, commas, parentheses, slashes, \
percentages, and headings such as "Ingredients:", "Active ingredients", "Inactive \
ingredients", "May contain". Keep the label's spelling, even if a name looks misspelled.
- Transcribe only text you can actually read in this photo. Never add, complete, correct or \
reorder names from your knowledge of this product, similar products or usual formulas, even \
when the list looks cut off.
- Where a name or part of a name cannot be read with confidence (blur, glare, a fold, cut off \
at the edge of the photo), write {UNREADABLE} in its place: one {UNREADABLE} per unreadable \
ingredient.
- If the list is printed in several languages, transcribe only the one in Latin-script INCI \
names (usually English). If there is only one list, transcribe it, whatever the language.
- Leave out everything else: marketing text, directions, warnings, addresses, batch numbers.
- If no ingredient list is visible, set found to false and text to an empty string.
"""


class LabelReadingError(Exception):
    """Reading failed for a reason the user can act on. `status` is the HTTP status."""

    def __init__(self, message: str, status: int) -> None:
        super().__init__(message)
        self.status = status


class ModelLabel(BaseModel):
    found: bool  # an ingredient list is visible in the photo
    text: str  # the list as printed, with [?] for what cannot be read


@dataclass(frozen=True)
class LabelReading:
    found: bool
    text: str
    unreadable_count: int


def decode_image(data: str) -> bytes:
    """The image bytes, or LabelReadingError (422) when `data` is not base64."""
    try:
        return base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError) as e:
        raise LabelReadingError("the image is not valid base64", 422) from e


def call_model(media_type: str, data: str) -> ModelLabel:
    """What the model read. Tests replace this function."""
    settings = get_settings()
    extra: dict[str, Any] = {}
    if settings.label_model in FALLBACK_MODELS:
        extra = {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}
    image = {"type": "base64", "media_type": media_type, "data": data}
    try:
        # The user is waiting with the dialog open: one try of at most a minute and a half
        # instead of the SDK's ten minutes per try, and an error they can act on (try again).
        client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key,
            base_url=settings.anthropic_base_url,
            timeout=90.0,
            max_retries=0,
        )
        response = client.beta.messages.parse(
            model=settings.label_model,
            max_tokens=16000,
            output_config={"effort": "medium"},
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "source": image},
                        {"type": "text", "text": "Transcribe the ingredient list."},
                    ],
                }
            ],
            output_format=ModelLabel,
            **extra,
        )
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as e:
        raise LabelReadingError(f"reading photos is not set up: {e.message}", 503) from e
    except anthropic.RateLimitError as e:
        raise LabelReadingError("the AI service is busy; try again in a minute", 503) from e
    except anthropic.BadRequestError as e:
        # Mostly an image the API cannot open (corrupt, or not the declared type).
        raise LabelReadingError(f"the AI service could not read the image: {e.message}", 422) from e
    except anthropic.APIStatusError as e:
        raise LabelReadingError(f"the AI service failed ({e.status_code}): {e.message}", 502) from e
    except anthropic.APIConnectionError as e:
        raise LabelReadingError("cannot reach the AI service", 502) from e
    except anthropic.AnthropicError as e:
        raise LabelReadingError(f"the AI request failed: {e}", 502) from e
    except TypeError as e:
        # How the SDK reports that it found no API key, auth token or profile at all.
        if "authentication" not in str(e):
            raise
        raise LabelReadingError("reading photos is not set up: no Anthropic API key", 503) from e
    if response.stop_reason == "refusal":
        raise LabelReadingError("the model declined to read this photo", 502)
    if response.stop_reason == "max_tokens" or response.parsed_output is None:
        raise LabelReadingError("the model's answer was cut off; try again", 502)
    return response.parsed_output


def read_label(media_type: str, data: str) -> LabelReading:
    decode_image(data)
    label = call_model(media_type, data)
    text = label.text.strip() if label.found else ""
    return LabelReading(found=bool(text), text=text, unreadable_count=text.count(UNREADABLE))
