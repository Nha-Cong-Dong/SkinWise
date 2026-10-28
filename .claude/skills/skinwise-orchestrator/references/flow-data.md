# Luồng dữ liệu: sản phẩm mẫu và tên thông dụng

**Chế độ:** Workflow. Danh sách mục biết trước, và vòng "thu thập → phản biện → sửa" viết được thành code.

## Bước 1: Chuẩn bị danh sách (phiên chính)

1. Bước 0 trong SKILL.md (thư mục `_workspace/data/`, `00_git.txt`).
2. Chuyển yêu cầu thành danh sách mục:
   ```json
   [
     { "id": "p1", "kind": "product", "request": "La Roche-Posay Effaclar Duo+M, trang tiếng Việt", "hint_url": null,
       "existing_slugs_note": "đã kiểm: chưa có trong products.toml" },
     { "id": "n1", "kind": "name", "request": "tên tiếng Việt trên nhãn Cocoon cho niacinamide", "hint_url": "https://..." }
   ]
   ```
   - Grep `backend/data/products.toml` / `common_names.toml` trước để không thêm trùng.
   - Người dùng chỉ nói chung ("thêm sản phẩm cho demo") thì xem nhóm hoạt chất nào ít sản phẩm (đếm theo `backend/data/functional_groups.toml` và luật đã bật), đề xuất danh sách cụ thể rồi hỏi người dùng.
   - Tối đa khoảng 10 mục mỗi lần chạy, vì tải nhiều trang hãng liên tiếp hay bị chặn.
3. Ghi `_workspace/data/00_items.json`.

## Bước 2: Workflow

`args`: `{ items, today: "YYYY-MM-DD", ws: "_workspace/data", critics: 1, maxRevisions: 1 }`. Ghi `runId` vào `_workspace/data/run_meta.json`.

```javascript
export const meta = {
  name: 'skinwise-sample-data',
  description: 'Lấy sản phẩm mẫu / tên thông dụng từ trang chính hãng của SkinWise, phản biện, sửa theo phản biện',
  phases: [
    { title: 'Thu thập', detail: 'source-researcher cắt bảng thành phần / câu trích nguyên văn từ trang hãng' },
    { title: 'Phản biện', detail: 'evidence-critic kiểm nguyên văn, thứ tự, đúng sản phẩm' },
    { title: 'Sửa', detail: 'source-researcher sửa theo phản biện, rồi phản biện lại' },
  ],
}

const STRINGS = { type: 'array', items: { type: 'string' } }
const ENTRY = {
  type: 'object',
  required: ['kind', 'status', 'checks'],
  properties: {
    kind: { type: 'string', enum: ['product', 'name'] },
    status: { type: 'string', enum: ['ok', 'skipped'] },
    product: { type: ['object', 'null'], properties: {
      slug: { type: 'string' }, brand: { type: 'string' }, name: { type: 'string' },
      market: { type: 'string' }, application: { type: 'string', enum: ['rinse_off', 'leave_on'] },
      source_url: { type: 'string' }, ingredients: { type: 'string' } } },
    name_entry: { type: ['object', 'null'], properties: {
      name: { type: 'string' }, lang: { type: 'string' }, inci: STRINGS, note: { type: ['string', 'null'] },
      sources: { type: 'array', items: { type: 'object', required: ['url', 'quote'], properties: {
        url: { type: 'string' }, quote: { type: 'string' } } } },
      evidence: { type: 'string', enum: ['strong', 'medium'] },
      points_to_active: { type: 'boolean' } } },
    checks: STRINGS,
    skipped: { type: ['string', 'null'] },
    page_files: STRINGS, problems: STRINGS, open_questions: STRINGS,
  },
}
const VERDICT = {
  type: 'object',
  required: ['status', 'issues', 'checked'],
  properties: {
    status: { type: 'string', enum: ['confirmed', 'needs_revision', 'refuted'] },
    issues: { type: 'array', items: { type: 'object', required: ['field', 'problem'], properties: {
      field: { type: 'string' }, problem: { type: 'string' },
      evidence: { type: 'string' }, fix: { type: 'string' } } } },
    checked: STRINGS,
    notes_for_reviewer: STRINGS,
  },
}

const items = args.items ?? []
const ws = args.ws ?? '_workspace/data'
const critics = args.critics ?? 1
const maxRevisions = args.maxRevisions ?? 1
if (!items.length) return { error: 'Không có mục nào.', results: [] }

const collectPrompt = it => `Dùng skill sample-data-entry (cùng page-evidence) để lấy mục dữ liệu mẫu SkinWise dưới đây từ trang chính hãng.
Hôm nay: ${args.today}. Thư mục làm việc: ${ws} (file trang ở ${ws}/pages/, bảng thành phần cắt ra ở ${ws}/ingr-<slug>.txt). Không ghi vào backend/data/.
Mục: ${JSON.stringify(it)}
Trả về đúng schema ở mục C của skill.`

const critiquePrompt = (it, e) => `Dùng skill sample-data-entry (mục D: tiêu chí phản biện) và page-evidence để phản biện mục dữ liệu mẫu SkinWise dưới đây.
Tự chạy lại check_text.py trên file trang (tải lại nếu thiếu). Thư mục làm việc: ${ws}.
Yêu cầu gốc: ${JSON.stringify(it)}
Bản nháp: ${JSON.stringify(e)}`

const revisePrompt = (it, e, vs) => `Sửa mục dữ liệu mẫu SkinWise theo phản biện (skill sample-data-entry). Chỉ sửa đúng điểm được nêu; nếu phải đổi sang sản phẩm khác cùng nhóm thì nói rõ trong problems. Kiểm lại bằng check_text.py. Trả về đúng schema như lần trước.
Yêu cầu gốc: ${JSON.stringify(it)}
Bản nháp trước: ${JSON.stringify(e)}
Phản biện: ${JSON.stringify(vs.map(v => ({ status: v.status, issues: v.issues })))}`

const passes = vs => vs.filter(v => v.status === 'confirmed').length * 2 > critics
const refuted = vs => vs.filter(v => v.status === 'refuted').length * 2 > critics
const critique = (it, e, round) =>
  parallel(Array.from({ length: critics }, (_, i) => () =>
    agent(critiquePrompt(it, e), {
      agentType: 'evidence-critic',
      phase: round === 0 ? 'Phản biện' : 'Sửa',
      label: `phản biện:${it.id}:v${round}:${i + 1}`,
      schema: VERDICT,
    }))).then(vs => vs.filter(Boolean))

const results = await pipeline(
  items,
  it => agent(collectPrompt(it), {
    agentType: 'source-researcher', phase: 'Thu thập', label: `thu thập:${it.id}`, schema: ENTRY,
  }).then(entry => ({ item: it, entry })),
  async ({ item: it, entry }) => {
    if (!entry) return { item: it, outcome: 'failed', reason: 'source-researcher không trả kết quả' }
    if (entry.status === 'skipped') return { item: it, outcome: 'skipped', entry }
    let current = entry
    let verdicts = await critique(it, current, 0)
    let round = 0
    while (verdicts.length && round < maxRevisions && !passes(verdicts) && !refuted(verdicts)) {
      round += 1
      const revised = await agent(revisePrompt(it, current, verdicts), {
        agentType: 'source-researcher', phase: 'Sửa', label: `sửa:${it.id}:v${round}`, schema: ENTRY,
      })
      if (!revised) break
      current = revised
      if (current.status === 'skipped') return { item: it, outcome: 'skipped', entry: current, verdicts, rounds: round }
      verdicts = await critique(it, current, round)
    }
    const outcome = !verdicts.length ? 'unverified'
      : passes(verdicts) ? 'passed'
      : refuted(verdicts) ? 'refuted'
      : 'unresolved'
    return { item: it, outcome, entry: current, verdicts, rounds: round }
  },
)

const done = results.filter(Boolean)
const count = k => done.filter(r => r.outcome === k).length
log(`${items.length} mục: ${count('passed')} qua phản biện, ${count('skipped')} bỏ trang, ${count('unresolved')} chưa qua, `
  + `${count('refuted')} bị bác, ${count('failed') + count('unverified')} lỗi / chưa kiểm được, ${items.length - done.length} không có kết quả.`)
return { results: done }
```

## Bước 3: Ghi kết quả (phiên chính)

Lưu kết quả vào `_workspace/data/01_results.json`, rồi:

1. **Sản phẩm `passed`**: thêm vào `backend/data/products.toml` dưới mục nhóm hoạt chất phù hợp (`# --- BHA ---`…), theo mẫu ở skill `sample-data-entry`, với `retrieved_at = <hôm nay>` và `verification_status = "unverified"`.
   - `ingredients` lấy từ **file** `_workspace/data/ingr-<slug>.txt` (đọc file rồi dán), không lấy từ chuỗi JSON đã qua tay mô hình.
   - Trang bị bỏ (`skipped`): thêm một dòng comment như các dòng "dropped, its page ..." đã có.
2. **Tên thông dụng `passed`** có `evidence = "strong"` và `points_to_active = false`: thêm vào `backend/data/common_names.toml` dưới tiêu đề mới `# --- Thêm dd/mm từ ... CHƯA DUYỆT. ---`.
3. **Tên trỏ tới hoạt chất hoặc bằng chứng vừa**: KHÔNG ghi vào TOML. Ghi vào `plan/vn-names-<YYYY-MM-DD>.md` (theo cấu trúc mục A / B2 của `plan/vn-names-2026-10-26.md`) để người dùng duyệt.
4. Chạy trong `backend/`:
   - `uv run python -m scripts.verify_products <slug ...>`: sản phẩm nào trượt thì gỡ ra và báo lại.
   - `uv run python -m scripts.seed`, rồi `uv run python -m scripts.unresolved`: nêu trong báo cáo những tên chưa nhận ra trông như hoạt chất.
   - `uv run pytest tests/test_ingredients.py tests/test_rules.py`
   - Có thêm tên thông dụng: `uv run python -m scripts.verify_quotes` (kiểm mọi nguồn, mất vài phút).
5. Cập nhật `plan/after-mvp.md` / `plan/README.md` nếu có mục đếm số sản phẩm mẫu.

## Bước 4: Báo cáo

Theo mẫu trong SKILL.md. Nêu rõ:
- số sản phẩm / tên đã thêm (đều `unverified` / "CHƯA DUYỆT")
- trang bị bỏ và lý do
- tên chờ duyệt ở file `plan/vn-names-*.md`
- kết quả `unresolved`
