# Luồng nội dung: nội dung có nguồn không phải luật (mục tiêu da, thẻ thông tin)

**Chế độ:** Workflow. Dùng cho nội dung hiển thị nguyên văn kèm nguồn nhưng **không tạo cảnh báo**:
- mục "hoạt chất thường dùng cho mục tiêu" (`kind = "active"`, gắn một mã nhóm);
- thẻ thông tin (`kind = "info"`).

Cả hai nằm trong `backend/data/goals.toml`. Luật, thẻ myth và lưu ý khi dùng vẫn đi theo `flow-rules.md`.

Khác với luồng luật:
- **gom theo mục tiêu:** mỗi agent tìm nguồn soạn mọi mục của một mục tiêu, vì các mục thường dùng chung vài trang. Như vậy ít agent hơn và đỡ phải tải lại cùng một trang;
- **phản biện theo từng mục:** mỗi mục nhận một phán quyết riêng;
- **chỉ sửa các mục chưa đạt**, tối đa 1 vòng.

Cách viết `title_vi` / `body_vi` và tiêu chí phản biện: mục 9 của skill `rule-source-research`.

## Bước 1: Chuẩn bị (phiên chính)
1. Bước 0 trong SKILL.md, thư mục `_workspace/goals/` (`00_git.txt`).
2. Viết `_workspace/goals/00_candidates.json` dạng
   `[{ goal, name_vi, items: [{ key, kind, group?, claim, urls: [...] }] }]`.
   - `group` phải có trong `functional_groups.toml`. Chất chưa có nhóm (ceramide, kem chống nắng…) thì làm thẻ `info`, không tự thêm nhóm.
   - Grep `goals.toml` để tránh `key` trùng.
   - `goal = "all"` dùng cho thẻ hiện ở mọi mục tiêu.
   - URL gợi ý phải do người dùng chọn hoặc duyệt, hoặc lấy từ một lần tìm đã báo cho người dùng.

## Bước 2: Workflow
Gọi Workflow với script dưới đây, `args = { ws: "_workspace/goals", today: "YYYY-MM-DD", candidates }`. Ghi `runId` vào `_workspace/goals/run_meta.json`. Kết quả mỗi mục có `outcome` là một trong: `passed` / `unresolved` / `refuted` / `no_source` / `unverified`.

```javascript
export const meta = {
  name: 'skinwise-goal-sources',
  description: 'Tìm và phản biện đoạn trích nguồn cho tính năng mục tiêu da của SkinWise (5 nhóm mục tiêu)',
  phases: [
    { title: 'Tìm nguồn', detail: 'source-researcher trích nguyên văn cho từng mục của một mục tiêu' },
    { title: 'Phản biện', detail: 'evidence-critic kiểm nguyên văn, ngữ cảnh, lời văn' },
    { title: 'Sửa', detail: 'sửa các mục chưa đạt, phản biện lại' },
  ],
}

const STRINGS = { type: 'array', items: { type: 'string' } }
const ITEM = {
  type: 'object',
  required: ['status', 'key', 'kind', 'title_vi', 'body_vi', 'sources', 'notes_for_reviewer'],
  properties: {
    status: { type: 'string', enum: ['draft', 'no_source'] },
    key: { type: 'string' }, kind: { type: 'string', enum: ['active', 'info'] },
    group: { type: ['string', 'null'] },
    title_vi: { type: 'string' }, body_vi: { type: 'string' },
    sources: { type: 'array', items: { type: 'object', required: ['url', 'quote'], properties: {
      url: { type: 'string' }, quote: { type: 'string' }, context: { type: 'string' } } } },
    notes_for_reviewer: STRINGS, problems: STRINGS,
  },
}
const BATCH = {
  type: 'object',
  required: ['goal', 'items', 'new_source_blocks'],
  properties: {
    goal: { type: 'string' },
    description_vi: { type: 'string' },
    items: { type: 'array', items: ITEM },
    new_source_blocks: { type: 'array', items: { type: 'object', required: ['url', 'title', 'publisher'],
      properties: { url: { type: 'string' }, title: { type: 'string' }, publisher: { type: 'string' } } } },
    page_files: STRINGS, searched: STRINGS,
  },
}
const VERDICT = {
  type: 'object',
  required: ['items'],
  properties: {
    items: { type: 'array', items: { type: 'object', required: ['key', 'status', 'issues'], properties: {
      key: { type: 'string' },
      status: { type: 'string', enum: ['confirmed', 'needs_revision', 'refuted'] },
      issues: { type: 'array', items: { type: 'object', required: ['field', 'problem'], properties: {
        field: { type: 'string' }, problem: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } } } },
      notes_for_reviewer: STRINGS,
    } } },
  },
}

const ws = args.ws
const today = args.today
const batches = args.candidates

const RULES = `Bối cảnh: tính năng "mục tiêu da" của SkinWise. Người dùng chọn mục tiêu, app hiện (a) mục "active": nhóm hoạt chất thường dùng cho mục tiêu, kèm lý do ngắn; (b) mục "info": thẻ thông tin bấm để đọc. Nội dung hiển thị nguyên văn title_vi/body_vi kèm nguồn và đoạn trích, giống thẻ luật.
Quy tắc:
- Dùng skill page-evidence (fetch trang về ${ws}/pages/, cắt đoạn trích bằng script, kiểm bằng check_text.py). Mọi quote phải NGUYÊN VĂN trên trang, đủ ngắn (1–3 câu) và tự nó đỡ được khẳng định. Không lấy gì từ trí nhớ.
- Dùng URL được gợi ý; được thêm nguồn uy tín khác (AAD, DermNet, NHS, Mayo, StatPearls, bài tổng quan PMC) nếu trang gợi ý không đỡ đủ. Trang không tải được: ghi vào problems; không tải được nguồn nào thì status = no_source.
- Viết title_vi / body_vi theo mục 9 của skill rule-source-research.
- Mục "active" chỉ dùng mã nhóm có trong backend/data/functional_groups.toml.
- Không ghi vào backend/ hay frontend/. Chỉ ghi trong ${ws}.
- URL đã có khối [[source]] trong backend/data/rules.toml hoặc goals.toml thì không cần new_source_blocks cho nó.
Hôm nay: ${today}.`

const researchPrompt = b => `${RULES}
Mục tiêu: ${b.goal} (${b.name_vi}). Soạn mỗi mục dưới đây; thêm description_vi (1–2 câu mô tả mục tiêu, không cần nguồn, không nói quá).
Các mục: ${JSON.stringify(b.items)}
Trả JSON đúng schema.`

const critiquePrompt = (b, d) => `${RULES}
Bạn là evidence-critic. Dùng tiêu chí phản biện của skill rule-source-research (mục 8 tiêu chí 1–3 và 8, cộng mục 9) áp cho từng mục dưới đây. Tự chạy lại check_text.py trên file trang (tải lại nếu thiếu); không tin dòng "đã kiểm" trong bản nháp. Mỗi mục trả confirmed / needs_revision / refuted kèm issues (field, problem, evidence, fix).
Mục tiêu: ${b.goal}. Ứng viên gốc: ${JSON.stringify(b.items)}
Bản nháp: ${JSON.stringify(d.items)}`

const revisePrompt = (b, items, verdicts) => `${RULES}
Sửa các mục dưới đây theo phản biện. Chỉ sửa đúng điểm được nêu; điểm không đồng ý thì giữ và giải thích trong notes_for_reviewer kèm căn cứ trên trang. Kiểm lại mọi quote bằng check_text.py. Trả JSON đúng schema (goal = ${b.goal}, items chỉ gồm các mục này, new_source_blocks cho URL mới nếu có).
Bản nháp: ${JSON.stringify(items)}
Phản biện: ${JSON.stringify(verdicts)}`

const results = await pipeline(
  batches,
  b => agent(researchPrompt(b), { agentType: 'source-researcher', model: 'opus', phase: 'Tìm nguồn', label: `nguồn:${b.goal}`, schema: BATCH })
    .then(draft => ({ b, draft })),
  async ({ b, draft }) => {
    if (!draft) return { goal: b.goal, failed: true }
    const drafts = draft.items.filter(i => i.status === 'draft')
    const noSource = draft.items.filter(i => i.status !== 'draft')
    let v = await agent(critiquePrompt(b, { items: drafts }), { agentType: 'evidence-critic', phase: 'Phản biện', label: `phản biện:${b.goal}`, schema: VERDICT })
    const byKey = new Map((v?.items ?? []).map(x => [x.key, x]))
    const final = []
    const toFix = []
    for (const it of drafts) {
      const vv = byKey.get(it.key)
      if (vv?.status === 'confirmed') final.push({ item: it, outcome: 'passed', verdict: vv })
      else if (vv?.status === 'refuted') final.push({ item: it, outcome: 'refuted', verdict: vv })
      else if (!vv) final.push({ item: it, outcome: 'unverified' })
      else toFix.push({ item: it, verdict: vv })
    }
    let extraSources = []
    if (toFix.length) {
      const rev = await agent(revisePrompt(b, toFix.map(x => x.item), toFix.map(x => x.verdict)), { agentType: 'source-researcher', model: 'opus', phase: 'Sửa', label: `sửa:${b.goal}`, schema: BATCH })
      const revItems = (rev?.items ?? []).filter(i => i.status === 'draft')
      extraSources = rev?.new_source_blocks ?? []
      for (const i of (rev?.items ?? []).filter(i => i.status !== 'draft')) noSource.push(i)
      if (revItems.length) {
        const v2 = await agent(critiquePrompt(b, { items: revItems }), { agentType: 'evidence-critic', phase: 'Sửa', label: `phản biện lại:${b.goal}`, schema: VERDICT })
        const k2 = new Map((v2?.items ?? []).map(x => [x.key, x]))
        for (const it of revItems) {
          const vv = k2.get(it.key)
          final.push({ item: it, outcome: !vv ? 'unverified' : vv.status === 'confirmed' ? 'passed' : vv.status === 'refuted' ? 'refuted' : 'unresolved', verdict: vv })
        }
      }
      const done = new Set(revItems.map(i => i.key))
      for (const x of toFix) if (!done.has(x.item.key) && !noSource.some(n => n.key === x.item.key)) final.push({ item: x.item, outcome: 'unresolved', verdict: x.verdict })
    }
    for (const i of noSource) final.push({ item: i, outcome: 'no_source' })
    return { goal: b.goal, description_vi: draft.description_vi, new_source_blocks: [...draft.new_source_blocks, ...extraSources], results: final }
  },
)
const done = results.filter(Boolean)
const all = done.flatMap(r => r.results ?? [])
const c = k => all.filter(x => x.outcome === k).length
log(`${all.length} mục: ${c('passed')} qua, ${c('unresolved')} chưa qua, ${c('refuted')} bác, ${c('no_source')} không nguồn, ${c('unverified')} chưa kiểm; ${done.filter(r => r.failed).length} mục tiêu lỗi.`)
return { results: done }
```

## Bước 3: Ghi kết quả (phiên chính)
Lưu kết quả vào `_workspace/goals/01_results.json`, rồi:
1. **Chỉ ghi mục `passed`** vào `backend/data/goals.toml`, mỗi mục là một khối `[[item]]` với `published = false`, theo thứ tự trong ứng viên.
   - Ngay trên mỗi khối, ghi một dòng comment `# Lưu ý người duyệt:` gộp lưu ý của người soạn và người phản biện.
   - URL mới thì thêm khối `[[source]]`. URL đã có trong `goals.toml` hoặc `rules.toml` thì không thêm lại.
   - `description_vi` của `[[goal]]` lấy từ kết quả của agent tìm nguồn.
2. Mục `unresolved` / `refuted` / `no_source` **không** ghi vào file. Đưa vào báo cáo kèm `issues`.
3. Chạy trong `backend/`:
   - `uv run python -m scripts.verify_quotes <key ...>`: phải đạt hết. Câu nào trượt thì gỡ mục đó ra, không sửa tay;
   - `uv run pytest tests/test_goals.py`;
   - `uv run python -m scripts.seed`.

## Bước 4: Báo cáo
Theo mẫu trong SKILL.md. Liệt kê theo mục tiêu: mục chờ duyệt kèm URL cần đọc và tối đa 3 lưu ý mỗi mục, rồi các mục bị loại kèm lý do. Nhắc người dùng: bật một mục nghĩa là đặt `published = true`, `reviewed_by`, `reviewed_at`, rồi chạy `verify_quotes` và `seed`. Việc này do người dùng làm.
