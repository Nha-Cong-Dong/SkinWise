# Luồng luật: tìm nguồn cho luật / thẻ myth / lưu ý khi dùng

**Chế độ:** Workflow. Danh sách ứng viên biết trước, và vòng "tìm → phản biện → sửa" viết được thành code.

## Bước 1: Chuẩn bị danh sách ứng viên (phiên chính)

1. Bước 0 trong SKILL.md (thư mục `_workspace/rules/`, `00_git.txt`).
2. Chuyển yêu cầu thành danh sách ứng viên:
   ```json
   [{ "key": "azelaic-acid-niacinamide-myth", "claim": "Azelaic acid và niacinamide dùng chung được",
      "kind": "myth", "group_a": "AZELAIC_ACID", "group_b": "NIACINAMIDE", "scope_hint": "same_session",
      "context": "từng bỏ 25/10: không tìm được nghiên cứu đã công bố; chỉ đề xuất lại nếu có bằng chứng mới" }]
   ```
   - Mã nhóm phải có trong `backend/data/functional_groups.toml`. Không có thì hỏi người dùng (thêm nhóm là việc lớn hơn thêm luật).
   - Grep `backend/data/rules.toml` xem `key` hoặc cặp nhóm đã có chưa. Đọc bảng luật ứng viên trong `plan/README.md` và đưa lý do "❌ Bỏ" cũ vào `context`.
   - Người dùng chỉ nói chung chung ("tìm thêm luật cho retinoid") thì đề xuất 2–5 ứng viên cụ thể và hỏi chọn cái nào.
3. Ghi `_workspace/rules/00_candidates.json`.

## Bước 2: Workflow

Gọi Workflow với `script` dưới đây và `args`:
`{ candidates, today: "YYYY-MM-DD", ws: "_workspace/rules", critics: 1, maxRevisions: 1 }`.
Chế độ "kỹ": `critics: 3, maxRevisions: 2`. Ghi `runId` vào `_workspace/rules/run_meta.json`.

```javascript
export const meta = {
  name: 'skinwise-rule-sources',
  description: 'Tìm nguồn cho từng luật / thẻ myth ứng viên của SkinWise, phản biện, sửa theo phản biện',
  phases: [
    { title: 'Tìm nguồn', detail: 'source-researcher tìm nguồn và trích nguyên văn cho từng ứng viên' },
    { title: 'Phản biện', detail: 'evidence-critic kiểm nguyên văn, ngữ cảnh, mức độ' },
    { title: 'Sửa', detail: 'source-researcher sửa theo phản biện, rồi phản biện lại' },
  ],
}

const STRINGS = { type: 'array', items: { type: 'string' } }
const DRAFT = {
  type: 'object',
  required: ['status', 'key', 'kind', 'sources', 'notes_for_reviewer', 'searched'],
  properties: {
    status: { type: 'string', enum: ['draft', 'no_source'] },
    key: { type: 'string' }, kind: { type: 'string' }, severity: { type: 'string' },
    scope: { type: 'string' }, evidence_level: { type: 'string' },
    group_a: { type: 'string' }, group_b: { type: ['string', 'null'] },
    title_vi: { type: 'string' }, explanation_vi: { type: 'string' },
    sources: { type: 'array', items: { type: 'object', required: ['url', 'quote'], properties: {
      url: { type: 'string' }, quote: { type: 'string' }, context: { type: 'string' } } } },
    new_source_blocks: { type: 'array', items: { type: 'object', required: ['url', 'title', 'publisher'],
      properties: { url: { type: 'string' }, title: { type: 'string' }, publisher: { type: 'string' } } } },
    source_summary: { type: 'string' },
    notes_for_reviewer: STRINGS, searched: STRINGS, page_files: STRINGS,
    problems: STRINGS, open_questions: STRINGS,
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

const candidates = args.candidates ?? []
const ws = args.ws ?? '_workspace/rules'
const critics = args.critics ?? 1
const maxRevisions = args.maxRevisions ?? 1
if (!candidates.length) return { error: 'Không có ứng viên nào.', results: [] }

const researchPrompt = c => `Dùng skill rule-source-research (cùng page-evidence) để tìm nguồn cho ứng viên luật SkinWise dưới đây.
Hôm nay: ${args.today}. Thư mục làm việc: ${ws} (file trang lưu ở ${ws}/pages/). Không ghi vào backend/data/.
Ứng viên: ${JSON.stringify(c)}
Trả về đúng schema ở mục 7 của skill.`

const critiquePrompt = (c, d) => `Dùng skill rule-source-research (mục 8: tiêu chí phản biện) và page-evidence để phản biện bản nháp luật SkinWise dưới đây.
Tự chạy lại phép kiểm trên file trang (tải lại nếu thiếu), không tin dòng "đã kiểm" trong bản nháp. Thư mục làm việc: ${ws}.
Ứng viên gốc: ${JSON.stringify(c)}
Bản nháp: ${JSON.stringify(d)}`

const revisePrompt = (c, d, vs) => `Sửa bản nháp luật SkinWise theo phản biện (skill rule-source-research). Chỉ sửa đúng điểm được nêu; điểm không đồng ý thì giữ và giải thích trong notes_for_reviewer kèm căn cứ trên trang. Kiểm lại mọi câu trích bằng check_text.py. Trả về đúng schema như lần trước.
Ứng viên: ${JSON.stringify(c)}
Bản nháp trước: ${JSON.stringify(d)}
Phản biện: ${JSON.stringify(vs.map(v => ({ status: v.status, issues: v.issues })))}`

// A draft passes only when more than half of the critics asked for confirm it; a failed critic counts as no.
const confirmedBy = vs => vs.filter(v => v.status === 'confirmed').length
const refutedBy = vs => vs.filter(v => v.status === 'refuted').length
const passes = vs => confirmedBy(vs) * 2 > critics
const refuted = vs => refutedBy(vs) * 2 > critics

const critique = (c, d, round) =>
  parallel(Array.from({ length: critics }, (_, i) => () =>
    agent(critiquePrompt(c, d), {
      agentType: 'evidence-critic',
      phase: round === 0 ? 'Phản biện' : 'Sửa',
      label: `phản biện:${c.key}:v${round}:${i + 1}`,
      schema: VERDICT,
    }))).then(vs => vs.filter(Boolean))

const results = await pipeline(
  candidates,
  c => agent(researchPrompt(c), {
    agentType: 'source-researcher', model: 'opus', phase: 'Tìm nguồn',
    label: `nguồn:${c.key}`, schema: DRAFT,
  }).then(draft => ({ candidate: c, draft })),
  async ({ candidate: c, draft }) => {
    if (!draft) return { candidate: c, outcome: 'failed', reason: 'source-researcher không trả kết quả' }
    if (draft.status === 'no_source') return { candidate: c, outcome: 'no_source', draft }
    let current = draft
    let verdicts = await critique(c, current, 0)
    let round = 0
    while (verdicts.length && round < maxRevisions && !passes(verdicts) && !refuted(verdicts)) {
      round += 1
      const revised = await agent(revisePrompt(c, current, verdicts), {
        agentType: 'source-researcher', model: 'opus', phase: 'Sửa',
        label: `sửa:${c.key}:v${round}`, schema: DRAFT,
      })
      if (!revised) break
      current = revised
      if (current.status === 'no_source') return { candidate: c, outcome: 'no_source', draft: current, verdicts, rounds: round }
      verdicts = await critique(c, current, round)
    }
    const outcome = !verdicts.length ? 'unverified'
      : passes(verdicts) ? 'passed'
      : refuted(verdicts) ? 'refuted'
      : 'unresolved'
    return { candidate: c, outcome, draft: current, verdicts, rounds: round }
  },
)

const done = results.filter(Boolean)
const count = k => done.filter(r => r.outcome === k).length
log(`${candidates.length} ứng viên: ${count('passed')} qua phản biện, ${count('unresolved')} chưa qua, `
  + `${count('refuted')} nên bỏ, ${count('no_source')} không đủ nguồn, `
  + `${count('failed') + count('unverified')} lỗi / chưa kiểm được, ${candidates.length - done.length} không có kết quả.`)
return { results: done }
```

`outcome`:
- `passed`: quá nửa người phản biện xác nhận.
- `unresolved`: hết vòng sửa mà vẫn còn vấn đề.
- `refuted`: quá nửa người phản biện bác.
- `no_source`: không đủ nguồn.
- `failed` / `unverified`: agent không trả kết quả.

## Bước 3: Ghi kết quả (phiên chính)

Lưu kết quả Workflow vào `_workspace/rules/01_results.json`, rồi:

1. **Chỉ ghi các mục `passed` vào `backend/data/rules.toml`.** Đặt chúng dưới một khối tiêu đề mới, ngay **trước** khối `# Nguồn` ở cuối file:
   ```toml
   # ======================================================================================
   # Ứng viên mới (dd/mm). Nguồn do Claude tìm, đoạn trích đã kiểm nguyên văn trên trang; lời giải thích là bản nháp
   # do Claude soạn. CHƯA BẬT: người duyệt phải tự đọc nguồn trước khi đặt published = true.
   # ======================================================================================
   ```
   - Mỗi luật: dòng `# Nguồn:` (từ `source_summary`), rồi `# Lưu ý người duyệt:` (gộp `notes_for_reviewer` của bản nháp và của người phản biện, bỏ trùng), rồi khối `[[rule]]` với `published = false`.
   - URL mới: thêm khối `[[source]]` vào cuối file với `accessed_at = <hôm nay>`. URL đã có thì không thêm lại.
   - Comment theo đúng văn phong các khối đã có trong file.
2. Mục `unresolved` / `refuted` **không** ghi vào TOML. Đưa vào báo cáo kèm `issues` của người phản biện.
3. Chạy trong `backend/`:
   - `uv run python -m scripts.verify_quotes <key ...>`: phải đạt hết. Câu nào trượt thì gỡ luật đó ra khỏi TOML, báo lại; đừng sửa câu trích bằng tay.
   - `uv run pytest tests/test_rules.py`
   - `uv run python -m scripts.seed`: kiểm seed nhận luật mới. Luật chưa bật nên engine không dùng.
4. Cập nhật bảng luật ứng viên trong `plan/README.md`:
   - `passed`: "⏳ Chờ duyệt (<nguồn chính>)"
   - `no_source` / `refuted`: "❌ Bỏ: <lý do>"
   - `unresolved`: không thêm dòng, chỉ nêu trong báo cáo

## Bước 4: Báo cáo

Theo mẫu trong SKILL.md. Với mỗi luật chờ duyệt, liệt kê **các URL người dùng cần tự đọc**, đoạn trích, và các lưu ý quan trọng nhất (tối đa 3). Nhắc rằng bật luật nghĩa là đặt `published = true`, `reviewed_by`, `reviewed_at`, rồi chạy `verify_quotes` và `seed`. Việc đó do người dùng làm.
