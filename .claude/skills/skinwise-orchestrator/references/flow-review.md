# Luồng review: review thay đổi trước PR

**Chế độ:** Workflow. Các góc nhìn biết trước, và mỗi phát hiện được xác minh theo một quy tắc cố định (quá nửa người xác minh `confirmed`).

## Bước 1: Xác định phạm vi (phiên chính)

1. Bước 0 trong SKILL.md, thư mục `_workspace/review-<nhánh>/` (đổi `/` trong tên nhánh thành `-`).
2. Làm theo mục 1 của skill `pr-review` để có `BASE`, danh sách file và các lệnh diff. Khi được gọi từ luồng tính năng, phạm vi là các file của tính năng đó, không gồm thay đổi chưa commit có từ trước (`00_git.txt` của luồng tính năng).
3. Chọn góc nhìn (mục 2 của `pr-review`). Mặc định: `correctness`, `security-privacy`, `source-principle`, `ui-vi`, `tests`. Bỏ góc không liên quan và ghi lại lý do.
4. Ghi `_workspace/review-<nhánh>/00_scope.json`:
   ```json
   { "branch": "feat/accounts", "base": "<sha>", "files": ["backend/app/accounts.py", "..."],
     "commands": ["git diff <base>...HEAD -- <files>", "git diff -- <files>"],
     "untracked": ["..."], "dimensions": ["correctness", "security-privacy", "..."], "skipped_dimensions": {} }
   ```

## Bước 2: Workflow

`args`: `{ scope: <nội dung 00_scope.json>, dimensions, verifiers: 1 }`. Chế độ "kỹ": `verifiers: 3`. Ghi `runId` vào `run_meta.json`.

```javascript
export const meta = {
  name: 'skinwise-pr-review',
  description: 'Review thay đổi của SkinWise theo từng góc nhìn, rồi xác minh từng phát hiện',
  phases: [
    { title: 'Review', detail: 'code-reviewer soi thay đổi theo từng góc nhìn' },
    { title: 'Xác minh', detail: 'qa-inspector cố bác bỏ từng phát hiện' },
  ],
}

const FINDINGS = {
  type: 'object',
  required: ['findings'],
  properties: { findings: { type: 'array', items: { type: 'object',
    required: ['title', 'dimension', 'severity', 'file', 'scenario', 'evidence'],
    properties: {
      title: { type: 'string' }, dimension: { type: 'string' },
      severity: { type: 'string', enum: ['high', 'medium', 'low'] },
      file: { type: 'string' }, line: { type: ['integer', 'null'] },
      scenario: { type: 'string' }, evidence: { type: 'string' }, suggested_fix: { type: 'string' },
    } } } },
}
const VERDICT = {
  type: 'object',
  required: ['status', 'reason'],
  properties: {
    status: { type: 'string', enum: ['confirmed', 'refuted', 'uncertain'] },
    reason: { type: 'string' },
    reproduction: { type: 'string' },
  },
}

const scope = args.scope
const dimensions = args.dimensions ?? []
const verifiers = args.verifiers ?? 1
if (!scope || !dimensions.length) return { error: 'Thiếu phạm vi hoặc góc nhìn.', confirmed: [] }

const reviewPrompt = d => `Dùng skill pr-review. Góc nhìn của bạn: ${d} (mục 2 của skill).
Phạm vi review (tự chạy các lệnh git để xem diff, đọc thêm file liên quan khi cần): ${JSON.stringify(scope)}
Trả về findings theo schema; không có lỗi thật thì trả findings rỗng.`

const verifyPrompt = f => `Chế độ B của qa-inspector: xác minh phát hiện review dưới đây trong repo SkinWise. Cố bác bỏ trước; chỉ confirmed khi có bằng chứng cụ thể (test / lệnh / đường đi của code). Script hay test tạm chỉ ghi trong _workspace/.
Phạm vi: ${JSON.stringify({ base: scope.base, files: scope.files })}
Phát hiện: ${JSON.stringify(f)}`

const verify = f =>
  parallel(Array.from({ length: verifiers }, (_, j) => () =>
    agent(verifyPrompt(f), {
      agentType: 'qa-inspector', phase: 'Xác minh',
      label: `xác minh:${f.file}:${f.line ?? '?'}:${j + 1}`, schema: VERDICT,
    }))).then(vs => {
      const verdicts = vs.filter(Boolean)
      const yes = verdicts.filter(v => v.status === 'confirmed').length
      return { ...f, verdicts, confirmed: yes * 2 > verifiers }
    })

const perDimension = await pipeline(
  dimensions,
  d => agent(reviewPrompt(d), {
    agentType: 'code-reviewer', phase: 'Review', label: `review:${d}`, schema: FINDINGS,
  }).then(r => ({ dimension: d, ok: Boolean(r), findings: r ? r.findings : [] })),
  r => parallel(r.findings.map(f => () => verify(f)))
    .then(vs => ({ dimension: r.dimension, ok: r.ok, findings: vs.filter(Boolean) })),
)

const reviewed = perDimension.filter(Boolean)
const failedDimensions = dimensions.filter(d => !reviewed.some(r => r.dimension === d && r.ok))
const all = reviewed.flatMap(r => r.findings)
const confirmed = all.filter(f => f.confirmed)
const unconfirmed = all.filter(f => !f.confirmed).map(f => ({
  title: f.title, file: f.file, line: f.line, severity: f.severity,
  statuses: f.verdicts.map(v => v.status), reasons: f.verdicts.map(v => v.reason),
}))
log(`${dimensions.length - failedDimensions.length}/${dimensions.length} góc nhìn đã review; `
  + `${all.length} phát hiện, ${confirmed.length} được xác nhận, ${unconfirmed.length} bị bác hoặc chưa chắc.`)
if (failedDimensions.length) log(`Chưa review được: ${failedDimensions.join(', ')}`)
return { confirmed, unconfirmed, failedDimensions }
```

## Bước 3: Báo cáo (phiên chính)

1. Lưu kết quả vào `_workspace/review-<nhánh>/01_results.json`.
2. Gộp phát hiện trùng (cùng file, dòng gần nhau, cùng nguyên nhân) giữa các góc nhìn.
3. Grep diff của `backend/data/rules.toml` tìm luật vừa được bật (`published = true` mới xuất hiện) để điền mục "Luật được bật trong diff".
4. Viết `_workspace/review-<nhánh>/report.md` theo mục 5 của skill `pr-review`, rồi tóm tắt cho người dùng. Mục "chưa chắc" chỉ ghi một dòng mỗi mục, gồm cả `refuted` lẫn `uncertain`, để người dùng biết đã soi mà không thành lỗi.
5. Góc nhìn trong `failedDimensions`: ghi "chưa review được", **không** ghi "không có lỗi".

## Bước 4 (tuỳ chọn): Sửa

Chỉ làm khi người dùng yêu cầu. Chuyển từng lỗi đã xác nhận cho backend-dev / frontend-dev, kèm `file:dòng`, tình huống và cách sửa. Khi dev xong, cho qa-inspector (chế độ A) kiểm lại phần đã sửa và chạy lại toàn bộ lệnh kiểm. Không chạy lại cả luồng review, trừ khi bản sửa lớn.
