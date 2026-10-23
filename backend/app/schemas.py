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


class ProductSummary(FromAttributes):
    id: int
    slug: str | None
    brand: str
    name: str
    market: str | None
    verification_status: str
    groups: list[str]


class IngredientOut(FromAttributes):
    position: int
    raw_name: str  # as written on the label
    inci_name: str | None  # None: not in the dictionary
    groups: list[str]


class ProductDetail(ProductSummary):
    ingredients_source: str
    source_url: str | None
    source_retrieved_at: datetime | None
    ingredients: list[IngredientOut]


class InciAnalyzeRequest(BaseModel):
    text: InciText


class AnalyzedIngredient(IngredientOut):
    may_contain: bool  # listed after "May contain" / "+/-": only in some shades


class InciAnalysis(BaseModel):
    ingredients: list[AnalyzedIngredient]
    groups: list[str]
    unresolved_count: int


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


class OccurrenceOut(FromAttributes):
    day: int
    session: Literal["AM", "PM"] | None  # None for same_day rules


class WarningOut(BaseModel):
    rule: RuleOut
    product_keys: tuple[str, str]
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
