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
    notice_vi: str | None  # set when no rule applies: no warning does not mean safe


class QuestionCreate(BaseModel):
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5,
                                               max_length=2000)]  # fmt: skip
    product_ids: Annotated[list[int], Field(max_length=20)] = []
    group_codes: Annotated[list[str], Field(max_length=10)] = []


class QuestionCreated(BaseModel):
    id: int
    message_vi: str
