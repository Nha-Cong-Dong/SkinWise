"""API routes. The frontend calls them under /api; the Vite dev proxy strips that prefix."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.concentration import OnePercentLine, one_percent_line
from app.db import get_session
from app.engine import (
    PAIR_KINDS,
    SEVERITY_ORDER,
    RoutineItem,
    Rule,
    check_routine,
    rule_matches,
)
from app.goals import load_goals
from app.inci import read_label_text
from app.ingredients import (
    ResolvedEntry,
    Suggestion,
    list_functions,
    list_groups,
    mark_allergens,
    product_groups,
    resolve,
    suggest,
    with_ancestors,
)
from app.products import (
    get_product,
    product_applications,
    search_products,
)
from app.rules import load_product_groups, load_published_rules
from app.schemas import (
    AnalyzedIngredient,
    FunctionOut,
    GoalItemOut,
    GoalOut,
    GoalsResponse,
    GroupOut,
    InciAnalysis,
    InciAnalyzeRequest,
    IngredientOut,
    OccurrenceOut,
    ProductDetail,
    ProductSummary,
    RoutineCheckRequest,
    RoutineCheckResponse,
    RoutineProductResult,
    RuleOut,
    RulesResponse,
    SuggestionOut,
    TextNotice,
    WarningOut,
)

# Silence is easy to read as "safe", so an empty result always says what it does not mean.
NO_ROUTINE_WARNING_VI = (
    "Chưa có luật đã kiểm chứng nào áp dụng cho routine này. Không có cảnh báo không có nghĩa "
    "là chắc chắn an toàn: SkinWise chỉ kiểm tra một số ít kết hợp đã có nguồn đáng tin cậy."
)
# Only "Lưu ý khi dùng" notes apply: about the combinations, the result is still empty.
NO_COMBINATION_WARNING_VI = (
    "Chưa có luật kết hợp đã kiểm chứng nào áp dụng cho routine này; các thẻ dưới đây chỉ là lưu ý "
    "khi dùng từng sản phẩm. Không có cảnh báo kết hợp không có nghĩa là chắc chắn an toàn: "
    "SkinWise chỉ kiểm tra một số ít kết hợp đã có nguồn đáng tin cậy."
)
NO_VERIFIED_INFO_VI = (
    "Chưa có thông tin đã kiểm chứng cho trường hợp này. Không có cảnh báo không có nghĩa là "
    "chắc chắn an toàn. Nếu chưa chắc, hãy hỏi bác sĩ da liễu hoặc dược sĩ."
)
TEXT_NOTICES_VI = {
    "drug_facts": (
        "Đây là nhãn thuốc kiểu Mỹ (Drug Facts). SkinWise chỉ đọc mục hoạt chất (Active "
        "ingredients) và thành phần khác (Inactive ingredients); thứ tự trên nhãn thuốc "
        "không theo hàm lượng."
    ),
    "highlight_list": (
        "Đây có vẻ là danh sách “thành phần nổi bật” do hãng chọn, không phải bảng thành phần "
        "đầy đủ. Hoạt chất có thể nằm ở phần không được liệt kê, nên kết quả kiểm tra routine "
        "có thể thiếu cảnh báo. Hãy dán bảng thành phần đầy đủ in trên bao bì (thường bắt đầu "
        "bằng “Ingredients:”)."
    ),
    "vietnamese_names": (
        "Nhiều tên thành phần là tên tiếng Việt thông dụng, không phải tên INCI chuẩn. SkinWise "
        "đối chiếu được một số tên thông dụng, nhưng một tên tiếng Việt có thể ứng với nhiều "
        "chất khác nhau; bảng INCI tiếng Anh trên bao bì cho kết quả chính xác hơn."
    ),
    "long_entries": (
        "Một số dòng quá dài để là tên thành phần: văn bản dán vào có thể kèm mô tả hoặc câu "
        "quảng cáo. Hãy chỉ dán phần bảng thành phần."
    ),
    "few_entries": (
        "Danh sách chỉ có vài thành phần. Nếu đây chưa phải toàn bộ bảng thành phần, kết quả "
        "kiểm tra có thể thiếu cảnh báo."
    ),
}
GOALS_NOTICE_VI = (
    "Đây là thông tin chung có nguồn, không thay cho tư vấn của bác sĩ da liễu. Mụn viêm nhiều, "
    "đau hoặc để lại sẹo, hay đốm da thay đổi bất thường, nên đi khám."
)
DbSession = Annotated[Session, Depends(get_session)]

router = APIRouter()


@router.get("/groups")
def groups(db: DbSession) -> list[GroupOut]:
    return [GroupOut.model_validate(g) for g in list_groups(db)]


@router.get("/goals")
def goals(db: DbSession) -> GoalsResponse:
    """Skin goals with their published, sourced items. Display only: the goals a user picks
    stay in the browser and never reach the warning engine."""
    all_goals = load_goals(db)
    return GoalsResponse(
        goals=[GoalOut.model_validate(g) for g in all_goals if not g.shared],
        shared_infos=[
            GoalItemOut.model_validate(i) for g in all_goals if g.shared for i in g.infos
        ],
        notice_vi=GOALS_NOTICE_VI,
    )


@router.get("/functions")
def functions(db: DbSession) -> list[FunctionOut]:
    return [FunctionOut.model_validate(f) for f in list_functions(db)]


def suggestions_for(db: Session, resolved: list[ResolvedEntry]) -> dict[int, list[Suggestion]]:
    """Close known names for each entry nothing recognised, by position."""
    return {r.entry.position: suggest(db, r.entry.candidates[0]) for r in resolved if not r.known}


def ingredient_fields(
    r: ResolvedEntry, line: OnePercentLine | None, suggestions: dict[int, list[Suggestion]]
) -> dict:
    return {
        "position": r.entry.position,
        "raw_name": r.entry.raw,
        "inci_name": r.inci_name,
        "groups": list(r.groups),
        "eu_name": r.eu_name,
        "functions": list(r.functions),
        "known": r.known,
        "common_name_of": list(r.common_name_of),
        "common_name_note": r.common_name_note,
        "declared_concentration": r.entry.declared,
        "at_most_one_percent": line is not None and r.entry.position in line.positions,
        "suggestions": [
            SuggestionOut.model_validate(s) for s in suggestions.get(r.entry.position, [])
        ],
        "fragrance_allergen": r.fragrance_allergen,
    }


@router.get("/products")
def products(
    db: DbSession,
    q: Annotated[str, Query(max_length=200)] = "",
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[ProductSummary]:
    rows = search_products(db, q, limit)
    groups_by_id = load_product_groups(db, [r.id for r in rows])
    return [
        ProductSummary.model_validate({**r.__dict__, "groups": sorted(groups_by_id[r.id])})
        for r in rows
    ]


@router.get("/products/{product_id}")
def product(db: DbSession, product_id: int) -> ProductDetail:
    row = get_product(db, product_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "product not found")
    resolved = mark_allergens(db, list(row.ingredients))
    line = one_percent_line(resolved)
    suggestions = suggestions_for(db, resolved)
    return ProductDetail.model_validate(
        {
            **row.__dict__,
            "groups": sorted(product_groups(resolved)),
            "ingredients": [
                IngredientOut(**ingredient_fields(r, line, suggestions)) for r in resolved
            ],
            "one_percent_marker": line.marker if line else None,
        }
    )


@router.post("/inci/analyze")
def analyze_inci(db: DbSession, body: InciAnalyzeRequest) -> InciAnalysis:
    label = read_label_text(body.text)
    resolved = mark_allergens(db, resolve(db, label.entries))
    # Key-ingredient lists and Drug Facts labels are not in order of weight.
    unordered = {"highlight_list", "drug_facts"} & set(label.notices)
    line = None if unordered else one_percent_line(resolved)
    suggestions = suggestions_for(db, resolved)
    return InciAnalysis(
        ingredients=[
            AnalyzedIngredient(
                **ingredient_fields(r, line, suggestions), may_contain=r.entry.may_contain
            )
            for r in resolved
        ],
        groups=sorted(product_groups(resolved)),
        unresolved_count=sum(1 for r in resolved if not r.known),
        notices=[TextNotice(code=c, message_vi=TEXT_NOTICES_VI[c]) for c in label.notices],
        one_percent_marker=line.marker if line else None,
    )


@router.post("/routine/check")
def check(db: DbSession, body: RoutineCheckRequest) -> RoutineCheckResponse:
    seeded_ids = [p.product_id for p in body.products if p.product_id is not None]
    applications = product_applications(db, seeded_ids)
    missing = set(seeded_ids) - applications.keys()
    if missing:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f"unknown product ids: {sorted(missing)}")  # fmt: skip
    seeded_groups = load_product_groups(db, seeded_ids)

    # The engine works on integer ids; client keys map to 1..n and back.
    ids = {p.key: n for n, p in enumerate(body.products, start=1)}
    keys = {n: key for key, n in ids.items()}
    groups_by_id: dict[int, set[str]] = {}
    possible_actives: dict[str, list[str]] = {}
    for p in body.products:
        if p.product_id is not None:
            groups_by_id[ids[p.key]] = seeded_groups[p.product_id]
            continue
        resolved = resolve(db, read_label_text(p.inci or "").entries)
        groups_by_id[ids[p.key]] = product_groups(resolved)
        names = [s.name for ss in suggestions_for(db, resolved).values() for s in ss if s.groups]
        possible_actives[p.key] = list(dict.fromkeys(names))
    items = [
        RoutineItem(ids[i.product_key], i.session, frozenset(i.days), i.step) for i in body.items
    ]
    warnings = check_routine(items, groups_by_id, load_published_rules(db))

    return RoutineCheckResponse(
        warnings=[
            WarningOut(
                rule=RuleOut.model_validate(w.rule),
                product_keys=[keys[i] for i in w.product_ids],
                occurrences=[OccurrenceOut.model_validate(o) for o in w.occurrences],
            )
            for w in warnings
        ],
        products=[
            RoutineProductResult(
                key=p.key,
                groups=sorted(groups_by_id[ids[p.key]]),
                possible_actives=possible_actives.get(p.key, []),
                application=applications.get(p.product_id) if p.product_id else None,
            )
            for p in body.products
        ],
        notice_vi=(
            None
            if any(w.rule.kind in PAIR_KINDS for w in warnings)
            else NO_COMBINATION_WARNING_VI
            if warnings
            else NO_ROUTINE_WARNING_VI
        ),
    )


@router.get("/rules")
def rules(
    db: DbSession,
    kind: Literal["conflict", "duplicate", "myth", "usage"] | None = None,
    groups: Annotated[list[str], Query(max_length=2)] = [],  # noqa: B006 (FastAPI copies it)
) -> RulesResponse:
    """Published rules, optionally of one kind. With one group: rules involving it. With two:
    the pair rules that would fire for one product of each group, whatever their kind, matched
    the way the routine engine matches (usage rules are about one group, not the pair). A group
    also counts as its umbrella groups (BHA is an EXFOLIANT_ACID), so a rule written for the
    umbrella answers a question about a member."""
    all_groups = list_groups(db)
    unknown = set(groups) - {g.code for g in all_groups}
    if unknown:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f"unknown group codes: {sorted(unknown)}")  # fmt: skip
    # The same group twice asks about two products of that group (a duplicate rule), not
    # about the group alone.
    expanded = [with_ancestors(code, all_groups) for code in groups]

    def wanted(rule: Rule) -> bool:
        if kind is not None and rule.kind != kind:
            return False
        if len(expanded) == 2:
            return rule.kind in PAIR_KINDS and rule_matches(rule, *expanded)
        if len(expanded) == 1:
            return bool(expanded[0] & {rule.group_a, rule.group_b})
        return True

    matched = [r for r in load_published_rules(db) if wanted(r)]
    matched.sort(key=lambda r: (SEVERITY_ORDER[r.severity], r.key))
    return RulesResponse(
        rules=[RuleOut.model_validate(r) for r in matched],
        notice_vi=None if matched else NO_VERIFIED_INFO_VI,
    )
