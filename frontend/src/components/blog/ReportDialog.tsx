import { useState, type FormEvent } from 'react'
import { ApiError, api, type ReportIn, type ReportReason } from '../../api'
import { REPORT_NOTE_MAX, SESSION_EXPIRED, TOO_MANY } from '../../blog'
import { REPORT_REASON_LABELS } from '../../labels'
import { Dialog } from '../Dialog'
import { field, primary, secondary } from './parts'

export type ReportTarget = { kind: ReportIn['target_kind']; id: number }

export function ReportDialog({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title={<h2 className="text-xl font-bold">{target?.kind === 'comment' ? 'Báo cáo bình luận' : 'Báo cáo bài viết'}</h2>}
    >
      {target && <ReportForm key={`${target.kind}:${target.id}`} target={target} onClose={onClose} />}
    </Dialog>
  )
}

function ReportForm({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [note, setNote] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'own' | 'gone' | 'signed-out' | 'too-many' | 'error'>('idle')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!reason) return
    setState('sending')
    api.report({ target_kind: target.kind, target_id: target.id, reason, note: note.trim() || null }).then(
      () => setState('sent'),
      (err) => {
        const status = err instanceof ApiError ? err.status : 0
        setState(status === 400 ? 'own' : status === 404 ? 'gone' : status === 401 ? 'signed-out' : status === 429 ? 'too-many' : 'error')
      },
    )
  }

  if (state === 'sent') {
    return (
      <div className="space-y-4 text-sm text-ink-soft">
        <p>Cảm ơn bạn. Người duyệt sẽ xem lại.</p>
        <button onClick={onClose} className={primary} data-autofocus>
          Đóng
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4 text-sm leading-relaxed text-ink-soft">
      <fieldset>
        <legend className="font-medium text-ink">Lý do</legend>
        <div className="mt-2 space-y-1.5">
          {(Object.keys(REPORT_REASON_LABELS) as ReportReason[]).map((r) => (
            <label key={r} className="flex items-start gap-2.5">
              <input
                type="radio"
                name="reason"
                checked={reason === r}
                onChange={() => setReason(r)}
                className="mt-1 size-4 shrink-0 accent-ink"
              />
              {REPORT_REASON_LABELS[r]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="font-medium text-ink">Ghi chú cho người duyệt (không bắt buộc)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={REPORT_NOTE_MAX}
          rows={3}
          className={`mt-1 ${field}`}
        />
        <span className="mt-1 block text-right text-xs text-ink-mute">
          {note.length}/{REPORT_NOTE_MAX}
        </span>
      </label>
      <div aria-live="polite">
        {state === 'own' && <p className="text-avoid-ink">Bạn không thể báo cáo nội dung của chính mình.</p>}
        {state === 'gone' && <p className="text-avoid-ink">Nội dung này không còn nữa.</p>}
        {state === 'signed-out' && <p className="text-avoid-ink">{SESSION_EXPIRED}</p>}
        {state === 'error' && <p className="text-avoid-ink">Không gửi được báo cáo. Hãy thử lại.</p>}
        {state === 'too-many' && <p className="text-avoid-ink">{TOO_MANY}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={!reason || state === 'sending'} className={primary}>
          {state === 'sending' ? 'Đang gửi…' : 'Gửi báo cáo'}
        </button>
        <button type="button" onClick={onClose} className={secondary}>
          Huỷ
        </button>
      </div>
    </form>
  )
}
