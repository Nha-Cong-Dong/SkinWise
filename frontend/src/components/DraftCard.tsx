import { useContext, useState, type FormEvent } from 'react'
import type { Draft, ReviewApi } from '../api'
import { GroupsContext } from '../groups'
import { EVIDENCE_LABELS, SCOPE_LABELS, SEVERITY } from '../labels'
import { GroupChips } from './GroupChips'

type Guard = <T>(promise: Promise<T>) => Promise<T>

const MAX_SOURCES = 5

/** Ask the AI for a myth card draft from pages the reviewer chose. */
export function DraftForm({
  client,
  guard,
  onCreated,
}: {
  client: ReviewApi
  guard: Guard
  onCreated: (draft: Draft) => void
}) {
  const groups = useContext(GroupsContext)
  const [groupA, setGroupA] = useState('')
  const [groupB, setGroupB] = useState('')
  const [urls, setUrls] = useState('')
  const [instructions, setInstructions] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | { error: string }>('idle')

  const sourceUrls = urls
    .split(/\s+/)
    .map((u) => u.trim())
    .filter(Boolean)
  const badUrl = sourceUrls.find((u) => !/^https?:\/\/\S+$/.test(u))
  const ready = groupA && groupB && sourceUrls.length > 0 && sourceUrls.length <= MAX_SOURCES && !badUrl

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setState('sending')
    guard(
      client.createDraft({
        group_a: groupA,
        group_b: groupB,
        source_urls: sourceUrls,
        instructions: instructions.trim(),
      }),
    ).then(
      (draft) => {
        setState('idle')
        setUrls('')
        setInstructions('')
        onCreated(draft)
      },
      (err) => setState({ error: err.message }),
    )
  }

  const select = (value: string, onChange: (v: string) => void, label: string) => (
    <label className="flex-1 text-sm">
      <span className="text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
      >
        <option value="">— Chọn nhóm hoạt chất —</option>
        {[...groups.values()].map((g) => (
          <option key={g.code} value={g.code}>
            {g.name_vi}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200">
      <h3 className="font-semibold text-slate-900">
        AI soạn nháp thẻ myth
      </h3>
      <p className="text-sm text-slate-600">
        AI chỉ đọc các trang bạn đưa và phải trích nguyên văn; máy chủ tìm lại từng đoạn trích trên trang. Chọn nguồn uy
        tín (AAD, DermNet, bài bình duyệt trên PubMed/PMC, CIR, CosIng, FDA, Hiệp định mỹ phẩm ASEAN). Bản nháp không bao
        giờ hiện cho người dùng.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {select(groupA, setGroupA, 'Nhóm thứ nhất')}
        {select(groupB, setGroupB, 'Nhóm thứ hai')}
      </div>
      <label className="block text-sm">
        <span className="text-slate-600">Link nguồn (mỗi dòng một link, tối đa {MAX_SOURCES})</span>
        <textarea
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          rows={3}
          placeholder="https://pmc.ncbi.nlm.nih.gov/articles/PMC..."
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
        />
      </label>
      {badUrl && <p className="text-xs text-red-700">Link không hợp lệ: {badUrl}</p>}
      {sourceUrls.length > MAX_SOURCES && <p className="text-xs text-red-700">Tối đa {MAX_SOURCES} link.</p>}
      <label className="block text-sm">
        <span className="text-slate-600">Dặn thêm cho AI (không bắt buộc)</span>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Ví dụ: chú ý nghiên cứu dùng sản phẩm phối hợp, không phải hai sản phẩm riêng."
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!ready || state === 'sending'}
          className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-500"
        >
          {state === 'sending' ? 'AI đang đọc nguồn và soạn nháp…' : 'Soạn nháp'}
        </button>
        {state === 'sending' && <span className="text-xs text-slate-500">Thường mất 1–2 phút.</span>}
        {typeof state === 'object' && <span className="text-sm text-red-700">Không soạn được ({state.error}).</span>}
      </div>
    </form>
  )
}

/** An AI draft, clearly marked unreviewed, with the quote check and the TOML to paste. */
export function DraftCard({
  draft: d,
  client,
  guard,
  onChanged,
}: {
  draft: Draft
  client: ReviewApi
  guard: Guard
  onChanged: (draft: Draft) => void
}) {
  const [copied, setCopied] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const severity = SEVERITY[d.severity]
  const found = d.quotes.filter((q) => q.found).length

  const copy = () => {
    navigator.clipboard.writeText(d.toml).then(
      () => setCopied(true),
      () => setCopied(false),
    )
  }

  const setStatus = (status: Draft['status']) => {
    setError(null)
    guard(client.setDraftStatus(d.id, status)).then(onChanged, (err) => setError(err.message))
  }

  return (
    <article className="space-y-3 rounded-lg border-l-4 border-amber-400 bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">Bản nháp AI · chưa kiểm duyệt</span>
        <span className={`rounded px-2 py-0.5 font-semibold ${severity.badge}`}>{severity.label}</span>
        <span className="text-slate-500">
          #{d.id} · {d.created_by} · {new Date(d.created_at).toLocaleString('vi-VN')} · {d.model}
          {d.status === 'discarded' && ' · đã bỏ'}
        </span>
      </div>
      {!d.answerable && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
          AI đánh giá: các nguồn đã chọn chưa trả lời được câu hỏi. Xem ghi chú bên dưới.
        </p>
      )}
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <GroupChips codes={[d.group_a, d.group_b]} />
        <span className="text-xs">
          {SCOPE_LABELS[d.scope]} · bằng chứng {EVIDENCE_LABELS[d.evidence_level]}
        </span>
      </div>
      <h3 className="font-semibold text-slate-900">{d.title_vi}</h3>
      <p className="text-sm leading-relaxed text-slate-700">{d.explanation_vi}</p>

      <div className="text-sm">
        <p className={found === d.quotes.length && found > 0 ? 'text-emerald-800' : 'text-red-800'}>
          Đoạn trích: {found}/{d.quotes.length} có nguyên văn trên trang nguồn.
        </p>
        <ul className="mt-2 space-y-2">
          {d.quotes.map((q, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className={q.found ? 'text-emerald-600' : 'text-red-600'}>
                {q.found ? '✓' : '✗'}
              </span>
              <div>
                <blockquote className="text-slate-600 italic">“{q.quote}”</blockquote>
                <a href={q.url} target="_blank" rel="noreferrer" className="text-xs break-all text-slate-500 hover:underline">
                  {q.url}
                </a>
                {!q.found && <p className="text-xs text-red-700">Không thấy trên trang: đã để thành chú thích trong TOML.</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {d.reviewer_notes_vi && (
        <div className="rounded-md bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
          <p className="font-medium text-slate-700">AI ghi chú cho người duyệt</p>
          <p className="mt-1 whitespace-pre-wrap text-slate-600">{d.reviewer_notes_vi}</p>
        </div>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-rose-700 hover:underline">TOML để dán vào rules.toml và cách bật</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-600">
          <li>
            Dán vào <code>backend/data/rules.toml</code> (luật vẫn tắt: <code>published = false</code>).
          </li>
          <li>Tự đọc từng nguồn; sửa tiêu đề, lời giải thích, mức độ nếu cần.</li>
          <li>
            Đặt <code>published = true</code>, điền <code>reviewed_by</code>, <code>reviewed_at</code>.
          </li>
          <li>
            Chạy <code>uv run python -m scripts.verify_quotes {d.key}</code> rồi <code>uv run python -m scripts.seed</code>.
          </li>
        </ol>
        <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-slate-900 p-3 text-xs whitespace-pre-wrap text-slate-100">
          {d.toml}
        </pre>
        <button onClick={copy} className="mt-2 rounded-md px-3 py-1 text-sm text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50">
          Chép TOML
        </button>
        {copied === true && <span className="ml-2 text-xs text-emerald-700">Đã chép.</span>}
        {copied === false && <span className="ml-2 text-xs text-red-700">Trình duyệt chặn chép; hãy chọn và chép tay.</span>}
      </details>

      <div className="flex items-center gap-3 text-sm">
        {d.status === 'draft' ? (
          <button onClick={() => setStatus('discarded')} className="text-slate-500 hover:text-red-700 hover:underline">
            Bỏ bản nháp
          </button>
        ) : (
          <button onClick={() => setStatus('draft')} className="text-slate-500 hover:underline">
            Khôi phục
          </button>
        )}
        {error && <span className="text-xs text-red-700">Không lưu được ({error}).</span>}
      </div>
    </article>
  )
}
