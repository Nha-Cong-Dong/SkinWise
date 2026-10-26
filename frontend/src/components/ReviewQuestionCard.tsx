import { useState } from 'react'
import type { Draft, QuestionStatus, ReviewApi, ReviewQuestion, ReviewRule } from '../api'
import { QUESTION_STATUS_LABELS } from '../labels'
import { DraftCard, DraftForm } from './DraftCard'
import { GroupChips } from './GroupChips'

type Props = {
  question: ReviewQuestion
  rules: ReviewRule[]
  client: ReviewApi
  guard: <T>(promise: Promise<T>) => Promise<T>
  onSaved: (question: ReviewQuestion) => void
}

const STATUS_BADGE: Record<QuestionStatus, string> = {
  new: 'bg-sky-100 text-sky-800',
  accepted: 'bg-amber-100 text-amber-800',
  answered: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-slate-200 text-slate-700',
}

const formatTime = (iso: string) => new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })

export function ReviewQuestionCard({ question: q, rules, client, guard, onSaved }: Props) {
  const [status, setStatus] = useState<QuestionStatus>(q.status)
  const [ruleKey, setRuleKey] = useState(q.rule_key ?? '')
  // Starts from the user's text; the reviewer removes anything personal before answering.
  const [publicQuestion, setPublicQuestion] = useState(q.public_question ?? q.question)
  const [note, setNote] = useState(q.reviewer_note ?? '')
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | { error: string }>('idle')
  const [drafting, setDrafting] = useState(false)
  const [newDrafts, setNewDrafts] = useState<Draft[]>([])

  const answered = status === 'answered'
  const rule = rules.find((r) => r.key === ruleKey)
  const incomplete = answered && (!ruleKey || !publicQuestion.trim())

  const save = () => {
    setSaving('saving')
    guard(
      client.updateQuestion(q.id, {
        status,
        rule_key: ruleKey || null,
        public_question: answered ? publicQuestion.trim() : q.public_question,
        reviewer_note: note.trim() || null,
      }),
    ).then(
      (updated) => {
        setSaving('saved')
        onSaved(updated)
      },
      (err) => setSaving({ error: err.message }),
    )
  }

  return (
    <article className="space-y-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-mono">#{q.id}</span>
        <span className={`rounded px-2 py-0.5 font-semibold ${STATUS_BADGE[q.status]}`}>
          {QUESTION_STATUS_LABELS[q.status]}
        </span>
        <span>gửi lúc {formatTime(q.created_at)}</span>
        {q.updated_by && q.updated_at && (
          <span>
            · {q.updated_by} sửa lúc {formatTime(q.updated_at)}
          </span>
        )}
        {q.public && (
          <span className="rounded bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 ring-1 ring-emerald-200">
            Đang hiện cho người dùng
          </span>
        )}
      </div>
      <p className="text-sm whitespace-pre-wrap text-slate-900">{q.question}</p>
      {(q.group_codes.length > 0 || q.products.length > 0) && (
        <div className="space-y-1 text-sm text-slate-600">
          {q.group_codes.length > 0 && (
            <div className="flex items-center gap-2">
              Nhóm đã tra: <GroupChips codes={q.group_codes} />
            </div>
          )}
          {q.products.length > 0 && <div>Sản phẩm: {q.products.map((p) => p.label).join('; ')}</div>}
        </div>
      )}

      <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-slate-600">Trạng thái</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as QuestionStatus)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
          >
            {(Object.keys(QUESTION_STATUS_LABELS) as QuestionStatus[]).map((s) => (
              <option key={s} value={s}>
                {QUESTION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-slate-600">Luật / thẻ trả lời câu hỏi</span>
          <select
            value={ruleKey}
            onChange={(e) => setRuleKey(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
          >
            <option value="">— Chưa gắn —</option>
            {rules.map((r) => (
              <option key={r.key} value={r.key}>
                {r.published ? '' : '[chưa bật] '}
                {r.title_vi}
              </option>
            ))}
          </select>
        </label>
      </div>
      {rule && !rule.published && (
        <p className="text-xs text-amber-800">
          Luật <code>{rule.key}</code> chưa bật, nên câu hỏi chưa hiện cho người dùng dù đã trả lời.
        </p>
      )}
      {answered && (
        <label className="block text-sm">
          <span className="text-slate-600">Câu hỏi hiện công khai (bên dưới thẻ trả lời)</span>
          <textarea
            value={publicQuestion}
            onChange={(e) => setPublicQuestion(e.target.value)}
            rows={2}
            maxLength={2000}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
          <span className="text-xs text-slate-500">
            Hiện đúng như ô này. Bỏ tên, số điện thoại, tình trạng sức khoẻ và mọi thông tin cá nhân khác.
          </span>
        </label>
      )}
      <label className="block text-sm">
        <span className="text-slate-600">Ghi chú nội bộ (không hiện cho người dùng)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={1}
          maxLength={2000}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={incomplete || saving === 'saving'}
          className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-500"
        >
          {saving === 'saving' ? 'Đang lưu…' : 'Lưu'}
        </button>
        <button onClick={() => setDrafting((d) => !d)} className="text-sm text-rose-700 hover:underline">
          {drafting ? 'Đóng form soạn nháp' : 'AI soạn nháp thẻ myth'}
        </button>
        {incomplete && <span className="text-xs text-slate-500">Câu đã trả lời cần gắn luật và câu hỏi công khai.</span>}
        {saving === 'saved' && <span className="text-xs text-emerald-700">Đã lưu.</span>}
        {typeof saving === 'object' && <span className="text-xs text-red-700">Không lưu được ({saving.error}).</span>}
        {q.draft_ids.length > 0 && (
          <span className="text-xs text-slate-500">
            Bản nháp AI: {q.draft_ids.map((id) => `#${id}`).join(', ')} (xem ở tab Bản nháp)
          </span>
        )}
      </div>
      {drafting && (
        <DraftForm
          client={client}
          guard={guard}
          questionId={q.id}
          initialGroups={q.group_codes}
          onCreated={(d) => setNewDrafts((list) => [d, ...list])}
        />
      )}
      {newDrafts.map((d) => (
        <DraftCard
          key={d.id}
          draft={d}
          client={client}
          guard={guard}
          onChanged={(u) => setNewDrafts((list) => list.map((x) => (x.id === u.id ? u : x)))}
        />
      ))}
    </article>
  )
}
