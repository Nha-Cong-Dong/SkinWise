"""Request and response models for the API."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

MAX_INCI_LENGTH = 10_000

InciText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1,
                                            max_length=MAX_INCI_LENGTH)]  # fmt: skip


class FromAttributes(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class GroupOut(FromAttributes):
    code: str
    name_vi: str
    description_vi: str | None
    parent_code: str | None  # umbrella group, e.g. AHA -> EXFOLIANT_ACID


class ProductSummary(FromAttributes):
    id: int
    slug: str | None
    brand: str
    name: str
    market: str | None
    verification_status: str
    # Rinse-off (cleanser) or leave-on (serum, cream), as EU law defines them. Shown only.
    application: Literal["rinse_off", "leave_on"] | None
    groups: list[str]


class SuggestionOut(FromAttributes):
    name: str
    groups: list[str]  # non-empty when the suggested name is a tracked active


class IngredientOut(BaseModel):
    position: int
    raw_name: str  # as written on the label
    inci_name: str | None  # None: not in the actives dictionary
    groups: list[str]
    eu_name: str | None  # the name in the EU lists; None: unknown to them
    functions: list[str]  # usual functions (codes of /functions), from the 2006 EU inventory
    known: bool  # recognised by the actives dictionary or the EU lists
    # The label used an everyday name ("Rau má"): the EU names it may stand for, first one used.
    common_name_of: list[str]
    common_name_note: str | None
    declared_concentration: str | None  # printed with the entry, e.g. "10%", "4,000 ppm"
    # Listed after an ingredient the EU caps at 1% (see one_percent_marker): at most 1%.
    at_most_one_percent: bool
    # For an unrecognised name: close known names ("Salicilic Acid" -> Salicylic Acid).
    # Offered to the user only; never used to find actives.
    suggestions: list[SuggestionOut]
    # Named in the EU fragrance allergen list (Annex III, Regulation 1223/2009). Shown only.
    fragrance_allergen: bool


class FunctionOut(FromAttributes):
    code: str
    name_vi: str
    description_vi: str
    definition_en: str | None  # official EU definition


class ProductDetail(ProductSummary):
    ingredients_source: str
    source_url: str | None
    source_retrieved_at: datetime | None
    ingredients: list[IngredientOut]
    one_percent_marker: str | None  # the capped ingredient that marks the 1% line


class InciAnalyzeRequest(BaseModel):
    text: InciText


class AnalyzedIngredient(IngredientOut):
    may_contain: bool  # listed after "May contain" / "+/-": only in some shades


class TextNotice(BaseModel):
    code: Literal["drug_facts", "highlight_list", "vietnamese_names", "long_entries", "few_entries"]
    message_vi: str


class InciAnalysis(BaseModel):
    ingredients: list[AnalyzedIngredient]
    groups: list[str]
    unresolved_count: int
    # Signs the text is not a full INCI list; a routine check on it may miss warnings.
    notices: list[TextNotice]
    one_percent_marker: str | None  # the capped ingredient that marks the 1% line


class LabelImage(BaseModel):
    """A photo of a label, downscaled by the browser. Not stored."""

    media_type: Literal["image/jpeg", "image/png", "image/webp", "image/gif"]
    data: Annotated[str, StringConstraints(min_length=1, max_length=10_000_000)]  # base64


class LabelReadingOut(BaseModel):
    """The ingredient list as read off the photo, for the user to check before analysing."""

    found: bool  # an ingredient list was visible
    text: str  # as printed; "[?]" where the model could not read
    unreadable_count: int


class SourceOut(FromAttributes):
    title: str
    publisher: str
    url: str
    quote: str


class RuleOut(FromAttributes):
    key: str
    kind: str
    severity: str
    scope: str
    evidence_level: str
    group_a: str
    group_b: str | None
    title_vi: str
    explanation_vi: str
    sources: list[SourceOut]


class RulesResponse(BaseModel):
    rules: list[RuleOut]
    notice_vi: str | None  # set when nothing matched: no rule does not mean safe


class RoutineProduct(BaseModel):
    """A product in the routine: a seeded one by id, or one the user pasted the INCI list for.

    `key` is chosen by the client and stays the same wherever the product appears.
    """

    key: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    product_id: int | None = None
    inci: InciText | None = None

    @model_validator(mode="after")
    def _one_source(self) -> "RoutineProduct":
        if (self.product_id is None) == (self.inci is None):
            raise ValueError("give exactly one of product_id or inci")
        return self


class RoutineEntry(BaseModel):
    product_key: str
    session: Literal["AM", "PM"]
    days: Annotated[set[Annotated[int, Field(ge=0, le=6)]], Field(min_length=1)]  # 0 = Monday
    step: Annotated[int, Field(ge=1, le=50)]


class RoutineCheckRequest(BaseModel):
    products: Annotated[list[RoutineProduct], Field(max_length=50)]
    items: Annotated[list[RoutineEntry], Field(max_length=200)]

    @model_validator(mode="after")
    def _keys_match(self) -> "RoutineCheckRequest":
        keys = [p.key for p in self.products]
        if len(keys) != len(set(keys)):
            raise ValueError("product keys must be unique")
        unknown = sorted({i.product_key for i in self.items} - set(keys))
        if unknown:
            raise ValueError(f"items refer to unknown product keys: {unknown}")
        return self


class RoutineProductResult(BaseModel):
    key: str
    groups: list[str]
    # Pasted lists only: actives that unrecognised (likely misspelled) names may be. They
    # are not checked, so the routine may be missing warnings for them.
    possible_actives: list[str]
    application: Literal["rinse_off", "leave_on"] | None  # seeded products only


class OccurrenceOut(FromAttributes):
    day: int
    session: Literal["AM", "PM"] | None  # None for same_day rules


class WarningOut(BaseModel):
    rule: RuleOut
    product_keys: list[str]  # two for a pair rule; every product it is about for a usage rule
    occurrences: list[OccurrenceOut]


class RoutineCheckResponse(BaseModel):
    warnings: list[WarningOut]
    products: list[RoutineProductResult]
    # Set when no combination rule applies (usage notes alone do not count): no warning does
    # not mean safe.
    notice_vi: str | None


# Review page (sign-in required).
ReviewText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class ReviewerLoginRequest(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    password: Annotated[str, StringConstraints(min_length=1, max_length=200)]


class SignInOut(FromAttributes):
    token: str
    name: str
    expires_at: datetime


class ReviewerOut(BaseModel):
    name: str


SourceUrl = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000,
                                             pattern=r"^https?://\S+$")]  # fmt: skip


class DraftCreate(BaseModel):
    group_a: str
    group_b: str
    source_urls: Annotated[list[SourceUrl], Field(min_length=1, max_length=5)]
    instructions: ReviewText = ""


class QuoteCheckOut(BaseModel):
    url: str
    quote: str
    found: bool  # verbatim on the page the model read


class DraftSourceOut(BaseModel):
    url: str
    title: str
    publisher: str


class DraftOut(FromAttributes):
    id: int
    key: str
    kind: str
    severity: str
    scope: str
    evidence_level: str
    group_a: str
    group_b: str
    title_vi: str
    explanation_vi: str
    answerable: bool
    reviewer_notes_vi: str
    sources: list[DraftSourceOut]
    quotes: list[QuoteCheckOut]
    model: str
    status: Literal["draft", "discarded"]
    created_by: str
    created_at: datetime
    toml: str  # blocks to paste into data/rules.toml, published = false


class DraftStatusUpdate(BaseModel):
    status: Literal["draft", "discarded"]


# --- User accounts (plan/h-accounts.md) ---


Email = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254)]
# A new password is checked by the route (8 to 128 characters, not the email) so the page gets
# a `detail` it can show; never stripped.
NewPassword = Annotated[str, StringConstraints(max_length=1000)]
LinkToken = Annotated[str, StringConstraints(min_length=10, max_length=200)]


class RegisterRequest(BaseModel):
    email: Email
    password: NewPassword
    consent: bool  # the separate, unticked consent box of the sign-up form (Law 91/2025 Art. 9)
    policy_version: Annotated[str, StringConstraints(max_length=50)]


class EmailRequest(BaseModel):
    email: Email


class ResendVerificationRequest(BaseModel):
    email: Email
    password: Annotated[str, StringConstraints(min_length=1, max_length=1000)]


class VerifyEmailRequest(BaseModel):
    token: LinkToken
    # The password set when registering: a verify link only activates its own registration.
    password: Annotated[str, StringConstraints(min_length=1, max_length=1000)]


class LoginRequest(BaseModel):
    email: Email
    password: Annotated[str, StringConstraints(min_length=1, max_length=1000)]


class ResetPasswordRequest(BaseModel):
    token: LinkToken
    password: NewPassword


class EmailSent(BaseModel):
    message_vi: str
    # Dev mode only: no email was sent, the page shows the link instead. None when there is no
    # link (e.g. the address already has an account).
    dev_link: str | None


class ConsentOut(FromAttributes):
    purpose: str
    policy_version: str
    granted_at: datetime


class MeOut(BaseModel):
    email: str
    created_at: datetime
    consents: list[ConsentOut]
    routine_updated_at: datetime | None
    dev_mode: bool  # account emails are not sent, links are shown on the page instead (smtp: false)


class StoredNotice(BaseModel):
    code: Annotated[str, StringConstraints(max_length=40)]
    message_vi: Annotated[str, StringConstraints(max_length=2000)]


Key = Annotated[str, StringConstraints(min_length=1, max_length=100)]


class StoredProduct(BaseModel):
    """A product as frontend/src/routine.ts keeps it (camelCase on the wire)."""

    model_config = ConfigDict(populate_by_name=True)

    key: Key
    name: Annotated[str, StringConstraints(max_length=200)]
    brand: Annotated[str, StringConstraints(max_length=200)] | None
    product_id: int | None = Field(alias="productId")
    inci: Annotated[str, StringConstraints(max_length=MAX_INCI_LENGTH)] | None
    groups: Annotated[list[Annotated[str, StringConstraints(max_length=40)]], Field(max_length=20)]
    notices: Annotated[list[StoredNotice], Field(max_length=10)] = []


class StoredEntry(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: Key
    product_key: Key = Field(alias="productKey")
    session: Literal["AM", "PM"]
    days: Annotated[list[Annotated[int, Field(ge=0, le=6)]], Field(max_length=7)]


class StoredRoutineData(BaseModel):
    """The routine kept for sync: the limits of /routine/check, steps pointing to products."""

    products: Annotated[list[StoredProduct], Field(max_length=50)]
    entries: Annotated[list[StoredEntry], Field(max_length=200)]

    @model_validator(mode="after")
    def _entries_point_to_products(self) -> "StoredRoutineData":
        keys = [p.key for p in self.products]
        if len(keys) != len(set(keys)):
            raise ValueError("product keys must be unique")
        if any(e.product_key not in set(keys) for e in self.entries):
            raise ValueError("a step refers to a product that is not in the routine")
        return self


class RoutineOut(BaseModel):
    data: StoredRoutineData | None  # None: nothing stored yet
    version: int  # 0 when nothing is stored
    updated_at: datetime | None


class RoutinePut(BaseModel):
    data: StoredRoutineData
    base_version: Annotated[int, Field(ge=0)]  # the version this device last saw


class DeleteAccount(BaseModel):
    confirm_email: Annotated[str, StringConstraints(strip_whitespace=True, max_length=254)]
