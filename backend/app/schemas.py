"""Request and response models for the API."""

import re
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_serializer,
    model_validator,
)

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


class ProductImageOut(BaseModel):
    """A checked image of a catalogue product (Open Beauty Facts, CC BY-SA). Display only."""

    url: str  # /product-images/<slug>.webp?v=<hash>
    credit_vi: str  # shown under the image: "Ảnh: Open Beauty Facts (CC BY-SA 3.0)"
    source_url: str  # the product's page on Open Beauty Facts
    license_url: str  # the licence text (creativecommons.org, CC BY-SA 3.0)


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
    # Label names of the ingredient lines that matched a /products search query (at most 5,
    # in label order); [] otherwise. Display only.
    matched_ingredients: list[str] = []
    image: ProductImageOut | None = None  # None: no checked image (show the initial instead)


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
    # Some unrecognised lines got no suggestion lookup because the budget ran out.
    suggestions_truncated: bool = False


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
    reviewed_at: date | None  # when a reviewer read the sources and published the rule
    # Reviewer-approved plain-language version of explanation_vi; null when there is none.
    # explanation_vi stays the verbatim, source-faithful text.
    plain_vi: str | None


class GoalItemOut(FromAttributes):
    key: str
    kind: Literal["active", "info"]
    group: str | None  # functional group code, active items only
    title_vi: str
    body_vi: str
    sources: list[SourceOut]


class GoalOut(FromAttributes):
    code: str
    name_vi: str
    description_vi: str
    actives: list[GoalItemOut]
    infos: list[GoalItemOut]
    has_article: bool  # true only when the goal has a published article (/goals/{code}/article)


class GoalsResponse(BaseModel):
    goals: list[GoalOut]  # without the shared goal "all"
    shared_infos: list[GoalItemOut]  # items of "all", shown with every goal
    notice_vi: str  # always set: general sourced information, not a doctor's advice


class ArticleParagraphOut(FromAttributes):
    text_vi: str
    refs: list[int]  # 1-based numbers into GoalArticleOut.sources, unique, ascending


class ArticleSectionOut(FromAttributes):
    anchor: str  # "phan-1", "phan-2"... in section order
    heading_vi: str
    paragraphs: list[ArticleParagraphOut]


class ArticleSourceOut(FromAttributes):
    n: int  # 1-based, numbered by first appearance in the article
    title: str
    publisher: str
    url: str
    quotes: list[str]  # every quote of this source in the article, in order, without repeats


class GoalArticleOut(FromAttributes):
    goal: str
    goal_name_vi: str
    title_vi: str
    reviewed_by: str
    reviewed_at: date
    sections: list[ArticleSectionOut]
    sources: list[ArticleSourceOut]
    notice_vi: str  # same notice as /goals: general sourced information, not a doctor's advice


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


class GroupIngredient(FromAttributes):
    group: str
    name: str  # as written on the label
    position: int  # 1-based order in the list as read


class RoutineProductResult(BaseModel):
    key: str
    groups: list[str]
    # Pasted lists only: actives that unrecognised (likely misspelled) names may be. They
    # are not checked, so the routine may be missing warnings for them.
    possible_actives: list[str]
    # Pasted lists only: some unrecognised lines were not looked up for suggestions because
    # the request's budget ran out, so `possible_actives` may be incomplete.
    suggestions_truncated: bool = False
    application: Literal["rinse_off", "leave_on"] | None  # seeded products only
    # Shown only: which label entries put the product in each group, where they stand, and
    # whether the list is in order of weight (key-ingredient lists and Drug Facts are not).
    group_ingredients: list[GroupIngredient]
    ingredient_count: int
    ordered: bool


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


class StoredOrigin(BaseModel):
    """The list was copied off a label photo; `confirmed`: the user checked it on the package."""

    kind: Literal["photo"]
    confirmed: bool


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
    # Where a pasted list came from (frontend ProductOrigin). Shown only; absent in routines
    # saved before it existed, and left out of the output when absent (never `null`).
    origin: StoredOrigin | None = Field(default=None, exclude_if=lambda v: v is None)
    # The user's own photo of a typed-in product (POST /me/product-photos). Absent when none,
    # and left out of the output then. Never part of a shared routine or of a blog post.
    photo_id: Annotated[int, Field(gt=0)] | None = Field(
        default=None, alias="photoId", exclude_if=lambda v: v is None
    )


class ProductPhotoOut(BaseModel):
    id: int
    url: str  # /me/product-photos/{id}; served to its owner only


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


# --- Community reviews (app/blog_api.py; demo with made-up data, not open to the public) ---


SkinType = Literal["oily", "dry", "combination", "normal", "sensitive"]
Disclosure = Literal["none", "gifted", "sponsored"]
ContentStatus = Literal["visible", "pending", "hidden", "removed"]
ReportReason = Literal["medical_claim", "personal_info", "advertising", "offensive", "other"]
HANDLE_PATTERN = r"^[a-z0-9_.]+$"


class ProfileIn(BaseModel):
    handle: str  # 2-30 of a-z 0-9 _ . after trimming and lower-casing
    skin_type: SkinType | None = None

    @field_validator("handle")
    @classmethod
    def _handle(cls, value: str) -> str:
        handle = value.strip().lower()
        if not 2 <= len(handle) <= 30 or not re.match(HANDLE_PATTERN, handle):
            raise ValueError("2 to 30 characters: a-z, 0-9, '_' or '.'")
        return handle


class ProfileOut(BaseModel):
    handle: str | None  # None: not set yet, so the user cannot post or comment
    skin_type: SkinType | None


class SharedProduct(BaseModel):
    """A product of a routine file (frontend share.ts PortableRoutine), camelCase on the wire.
    Absent fields stay absent in responses: the frontend tells the two kinds apart by them."""

    model_config = ConfigDict(populate_by_name=True)

    key: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    name: Annotated[str, StringConstraints(max_length=200)] = ""
    product_id: Annotated[int, Field(gt=0)] | None = Field(default=None, alias="productId")
    # Trimmed; a blank list counts as none, as in share.ts parsePortable.
    inci: Annotated[str, StringConstraints(strip_whitespace=True,
                                           max_length=MAX_INCI_LENGTH)] | None = None  # fmt: skip

    @model_validator(mode="after")
    def _one_source(self) -> "SharedProduct":
        if not self.inci:
            self.inci = None
        if (self.product_id is None) == (self.inci is None):
            raise ValueError("give exactly one of productId or inci")
        return self

    @model_serializer(mode="wrap")
    def _drop_none(self, handler):  # noqa: ANN001, ANN202
        return {k: v for k, v in handler(self).items() if v is not None}


class SharedEntry(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    product_key: Annotated[str, StringConstraints(min_length=1, max_length=100)] = Field(
        alias="productKey"
    )
    session: Literal["AM", "PM"]
    days: Annotated[list[Annotated[int, Field(ge=0, le=6)]], Field(max_length=7)]


class SharedRoutine(BaseModel):
    """A routine attached to a post, in the shape of a routine file (share.ts). Checked for
    shape and limits only; nothing else is derived from it on the server."""

    format: Literal["skinwise-routine"]
    version: Literal[1]
    products: Annotated[list[SharedProduct], Field(max_length=50)]
    entries: Annotated[list[SharedEntry], Field(max_length=200)]

    @model_validator(mode="after")
    def _entries_point_to_products(self) -> "SharedRoutine":
        keys = [p.key for p in self.products]
        if len(keys) != len(set(keys)):
            raise ValueError("product keys must be unique")
        if any(e.product_key not in set(keys) for e in self.entries):
            raise ValueError("a step refers to a product that is not in the routine")
        return self


class PostProductIn(BaseModel):
    """Exactly one source: a catalogue product, or a name with a pasted ingredient list."""

    product_id: int | None = None
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1,
                                           max_length=120)] | None = None  # fmt: skip
    inci: InciText | None = None

    @model_validator(mode="after")
    def _one_source(self) -> "PostProductIn":
        pasted = self.name is not None or self.inci is not None
        if self.product_id is not None and pasted:
            raise ValueError("give either product_id or name and inci, not both")
        if self.product_id is None and (self.name is None or self.inci is None):
            raise ValueError("give product_id, or both name and inci")
        return self


class PostIn(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=120)]
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=20,
                                           max_length=10_000)]  # fmt: skip
    rating: Annotated[int, Field(ge=1, le=5)] | None = None
    skin_type: SkinType | None = None
    disclosure: Disclosure = "none"
    products: Annotated[list[PostProductIn], Field(min_length=1, max_length=10)]
    image_ids: Annotated[list[int], Field(max_length=4)] = []
    routine: SharedRoutine | None = None

    @field_validator("image_ids")
    @classmethod
    def _distinct(cls, ids: list[int]) -> list[int]:
        if len(ids) != len(set(ids)):
            raise ValueError("an image is listed twice")
        return ids


class PostProductOut(BaseModel):
    position: int
    product_id: int | None
    name: str  # from the catalogue when product_id is set
    brand: str | None  # None for a pasted list
    inci: str | None  # pasted lists only


class AuthorRef(BaseModel):
    handle: str
    skin_type: SkinType | None


class ImageOut(BaseModel):
    id: int
    url: str  # /blog/images/{id}
    width: int
    height: int
    caption: str | None


class PostSummary(BaseModel):
    cover: ImageOut | None  # the first image
    id: int
    title: str
    excerpt: str  # the first 200 characters of the body at most
    rating: int | None
    skin_type: SkinType | None
    disclosure: Disclosure
    author: AuthorRef
    products: list[PostProductOut]
    like_count: int
    comment_count: int  # visible comments
    has_routine: bool
    status: ContentStatus
    created_at: datetime


class PostDetail(PostSummary):
    body: str
    images: list[ImageOut]
    routine: SharedRoutine | None
    flags: list[str]  # why it waits for review; the author's own posts only, else []
    liked: bool
    saved: bool
    is_mine: bool
    updated_at: datetime


class PostList(BaseModel):
    items: list[PostSummary]
    total: int  # every matching post, not just this page
    # Over every matching post that has a rating (not just this page); None when none has.
    rating_avg: float | None
    rating_count: int


class LikeOut(BaseModel):
    liked: bool
    like_count: int


class SaveOut(BaseModel):
    saved: bool


class CommentIn(BaseModel):
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    # Reply to this comment of the same post. A reply to a reply is attached to the same
    # top-level comment (one level of replies).
    parent_id: int | None = None


class CommentOut(BaseModel):
    id: int
    post_id: int
    parent_id: int | None  # the top-level comment of a reply; None for a top-level comment
    # A reply that answered another reply: that reply's author, shown as "@handle"; None
    # otherwise, or once that reply is gone or not visible to the user.
    reply_to_handle: str | None
    # None when deleted: a top-level comment deleted (or not visible to the user) is kept as
    # an empty frame while it has replies the user sees: author None, body "".
    author: AuthorRef | None
    body: str
    status: ContentStatus  # "visible" for an empty frame
    flags: list[str]  # the user's own comments only, else []
    is_mine: bool
    deleted: bool
    like_count: int
    liked_by_me: bool
    created_at: datetime
    replies: list["CommentOut"]  # top-level comments only, oldest first; [] for a reply


class TrendingItem(BaseModel):
    kind: Literal["product", "group"]
    product_id: int | None  # kind "product"
    group: str | None  # kind "group": an active group code
    label_vi: str  # the catalogue product name, or the group's Vietnamese name
    post_count: int  # visible posts in the window, at least 2


NoticeKind = Literal[
    "post_liked",
    "post_commented",
    "comment_replied",
    "comment_liked",
    "post_pending",
    "post_visible",
    "post_hidden",
    "post_removed",
]


class ActivityItem(BaseModel):
    id: int
    kind: NoticeKind
    created_at: datetime
    read: bool
    actor_handle: str | None  # None for status notices (post_pending ... post_removed)
    post_id: int
    post_title: str
    comment_id: int | None  # the new comment / reply, or the liked comment
    excerpt_vi: str | None  # the first 80 characters of that comment, only while visible


class ActivityOut(BaseModel):
    unread_count: int
    items: list[ActivityItem]  # newest first


class ActivityReadIn(BaseModel):
    ids: Annotated[list[int], Field(max_length=200)] | None = None  # None: all


class ActivityReadOut(BaseModel):
    unread_count: int


class ReportIn(BaseModel):
    target_kind: Literal["post", "comment"]
    target_id: int
    reason: ReportReason
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None = None


class AuthorOut(BaseModel):
    handle: str
    skin_type: SkinType | None
    post_count: int  # visible posts
    posts: list[PostSummary]  # visible only, newest first


class ModerationImage(BaseModel):
    id: int  # GET /review/blog/images/{id} with the reviewer token
    caption: str | None


class ModerationItem(BaseModel):
    kind: Literal["post", "comment"]
    id: int
    post_id: int
    title: str | None  # None for a comment
    body: str
    author: str  # handle
    status: ContentStatus
    flags: list[str]
    report_count: int  # distinct people since the last reviewer decision
    report_reasons: list[str]
    report_notes: list[str]  # notes of the reports counted in report_count
    images: list[ModerationImage]  # the post's images; [] for a comment
    created_at: datetime


class ModerationAction(BaseModel):
    action: Literal["approve", "remove"]
