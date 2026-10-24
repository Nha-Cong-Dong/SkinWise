"""API routes. The frontend calls them under /api; the Vite dev proxy strips that prefix."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_session
from app.engine import (
    CHECKED_KINDS,
    SEVERITY_ORDER,
    RoutineItem,
    Rule,
    check_routine,
    rule_matches,
)
from app.inci import read_label_text
from app.ingredients import (
    ResolvedEntry,
    list_functions,
    list_groups,
    product_groups,
    resolve,
    with_ancestors,
)
from app.products import existing_product_ids, get_product, search_products
from app.questions import add_question
from app.rules import load_product_groups, load_published_rules
from app.schemas import (
    AnalyzedIngredient,
    FunctionOut,
    GroupOut,
    InciAnalysis,
    InciAnalyzeRequest,
    IngredientOut,
    OccurrenceOut,
    ProductDetail,
    ProductSummary,
    QuestionCreate,
    QuestionCreated,
    RoutineCheckRequest,
    RoutineCheckResponse,
    RoutineProductResult,
    RuleOut,
    RulesResponse,
    TextNotice,
    WarningOut,
)

# Silence is easy to read as "safe", so an empty result always says what it does not mean.
NO_ROUTINE_WARNING_VI = (
    "Chưa có luật đã kiểm chứng nào áp dụng cho routine này. Không có cảnh báo không có nghĩa "
    "là chắc chắn an toàn: SkinWise chỉ kiểm tra một số ít kết hợp đã có nguồn đáng tin cậy."
)
NO_VERIFIED_INFO_VI = (
    "Chưa có thông tin đã kiểm chứng cho trường hợp này. Không có cảnh báo không có nghĩa là "
    "chắc chắn an toàn. Bạn có thể gửi câu hỏi để chúng tôi tìm nguồn."
)
TEXT_NOTICES_VI = {
    "highlight_list": (
        "Đây có vẻ là danh sách “thành phần nổi bật” do hãng chọn, không phải bảng thành phần "
        "đầy đủ. Hoạt chất có thể nằm ở phần không được liệt kê, nên kết quả kiểm tra routine "
        "có thể thiếu cảnh báo. Hãy dán bảng thành phần đầy đủ in trên bao bì (thường bắt đầu "
        "bằng “Ingredients:”)."
    ),
    "vietnamese_names": (
        "Nhiều tên thành phần là tên tiếng Việt thông dụng, không phải tên INCI chuẩn. SkinWise "
        "chỉ nhận ra một phần trong số đó; bảng INCI tiếng Anh trên bao bì cho kết quả chính "
        "xác hơn."
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
QUESTION_RECEIVED_VI = (
    "Đã nhận câu hỏi của bạn. Người duyệt sẽ xem câu hỏi; nếu tìm được nguồn đáng tin cậy, "
    "câu trả lời sẽ được làm thành thẻ thông tin mới."
)

DbSession = Annotated[Session, Depends(get_session)]

router = APIRouter()


@router.get("/groups")
def groups(db: DbSession) -> list[GroupOut]:
    return [GroupOut.model_validate(g) for g in list_groups(db)]


@router.get("/functions")
def functions(db: DbSession) -> list[FunctionOut]:
    return [FunctionOut.model_validate(f) for f in list_functions(db)]


def ingredient_fields(r: ResolvedEntry) -> dict:
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
    return ProductDetail.model_validate(
        {
            **row.__dict__,
            "groups": sorted(product_groups(list(row.ingredients))),
            "ingredients": [IngredientOut(**ingredient_fields(r)) for r in row.ingredients],
        }
    )


@router.post("/inci/analyze")
def analyze_inci(db: DbSession, body: InciAnalyzeRequest) -> InciAnalysis:
    label = read_label_text(body.text)
    resolved = resolve(db, label.entries)
    return InciAnalysis(
        ingredients=[
            AnalyzedIngredient(**ingredient_fields(r), may_contain=r.entry.may_contain)
            for r in resolved
        ],
        groups=sorted(product_groups(resolved)),
        unresolved_count=sum(1 for r in resolved if not r.known),
        notices=[TextNotice(code=c, message_vi=TEXT_NOTICES_VI[c]) for c in label.notices],
    )


@router.post("/routine/check")
def check(db: DbSession, body: RoutineCheckRequest) -> RoutineCheckResponse:
    seeded_ids = [p.product_id for p in body.products if p.product_id is not None]
    missing = set(seeded_ids) - existing_product_ids(db, seeded_ids)
    if missing:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f"unknown product ids: {sorted(missing)}")  # fmt: skip
    seeded_groups = load_product_groups(db, seeded_ids)

    # The engine works on integer ids; client keys map to 1..n and back.
    ids = {p.key: n for n, p in enumerate(body.products, start=1)}
    keys = {n: key for key, n in ids.items()}
    groups_by_id = {
        ids[p.key]: (
            seeded_groups[p.product_id]
            if p.product_id is not None
            else product_groups(resolve(db, read_label_text(p.inci or "").entries))
        )
        for p in body.products
    }
    items = [
        RoutineItem(ids[i.product_key], i.session, frozenset(i.days), i.step) for i in body.items
    ]
    warnings = check_routine(items, groups_by_id, load_published_rules(db))

    return RoutineCheckResponse(
        warnings=[
            WarningOut(
                rule=RuleOut.model_validate(w.rule),
                product_keys=(keys[w.product_ids[0]], keys[w.product_ids[1]]),
                occurrences=[OccurrenceOut.model_validate(o) for o in w.occurrences],
            )
            for w in warnings
        ],
        products=[
            RoutineProductResult(key=p.key, groups=sorted(groups_by_id[ids[p.key]]))
            for p in body.products
        ],
        notice_vi=None if warnings else NO_ROUTINE_WARNING_VI,
    )


@router.get("/rules")
def rules(
    db: DbSession,
    kind: Literal["conflict", "duplicate", "myth"] | None = None,
    groups: Annotated[list[str], Query(max_length=2)] = [],  # noqa: B006 (FastAPI copies it)
) -> RulesResponse:
    """Published rules, optionally of one kind. With one group: rules involving it. With two:
    the rules that would fire for one product of each group, whatever their kind, matched the
    way the routine engine matches. A group also counts as its umbrella groups (BHA is an
    EXFOLIANT_ACID), so a rule written for the umbrella answers a question about a member."""
    all_groups = list_groups(db)
    unknown = set(groups) - {g.code for g in all_groups}
    if unknown:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f"unknown group codes: {sorted(unknown)}")  # fmt: skip
    expanded = [with_ancestors(code, all_groups) for code in dict.fromkeys(groups)]

    def wanted(rule: Rule) -> bool:
        if kind is not None and rule.kind != kind:
            return False
        if len(expanded) == 2:
            return rule.kind in CHECKED_KINDS and rule_matches(rule, *expanded)
        if len(expanded) == 1:
            return bool(expanded[0] & {rule.group_a, rule.group_b})
        return True

    matched = [r for r in load_published_rules(db) if wanted(r)]
    matched.sort(key=lambda r: (SEVERITY_ORDER[r.severity], r.key))
    return RulesResponse(
        rules=[RuleOut.model_validate(r) for r in matched],
        notice_vi=None if matched else NO_VERIFIED_INFO_VI,
    )


@router.post("/questions", status_code=status.HTTP_201_CREATED)
def ask(db: DbSession, body: QuestionCreate) -> QuestionCreated:
    product_ids = sorted(set(body.product_ids))
    group_codes = sorted(set(body.group_codes))
    problems = []
    if missing := set(product_ids) - existing_product_ids(db, product_ids):
        problems.append(f"unknown product ids: {sorted(missing)}")
    if unknown := set(group_codes) - {g.code for g in list_groups(db)}:
        problems.append(f"unknown group codes: {sorted(unknown)}")
    if problems:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "; ".join(problems))
    question_id = add_question(db, body.question, product_ids, group_codes)
    db.commit()
    return QuestionCreated(id=question_id, message_vi=QUESTION_RECEIVED_VI)
