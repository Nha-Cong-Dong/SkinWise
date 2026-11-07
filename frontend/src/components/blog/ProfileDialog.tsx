import { useState, type FormEvent } from 'react'
import { ApiError, api, type Profile, type SkinType } from '../../api'
import { HANDLE_PATTERN, normalizeHandle } from '../../blog'
import { SKIN_TYPE_LABELS } from '../../labels'
import { useProfile } from '../../profile'
import { Dialog, DialogTitle } from '../Dialog'
import { field, primary, secondary, selectField } from './styles'

type Props = {
  open: boolean
  profile: Profile | null
  onSaved: (profile: Profile) => void
  onClose: () => void
}

/** Nickname + skin type; opens the first time the user posts or comments, and from "Tài khoản". */
export function ProfileDialog({ open, profile, onSaved, onClose }: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={<DialogTitle>{profile?.handle ? 'Hồ sơ người viết' : 'Đặt biệt danh để viết bài'}</DialogTitle>}
    >
      <ProfileForm profile={profile} onSaved={onSaved} onCancel={onClose} />
    </Dialog>
  )
}

function ProfileForm({
  profile,
  onSaved,
  onCancel,
}: {
  profile: Profile | null
  onSaved: (profile: Profile) => void
  onCancel: () => void
}) {
  const [handle, setHandle] = useState(profile?.handle ?? '')
  const [skin, setSkin] = useState<SkinType | ''>(profile?.skin_type ?? '')
  const [state, setState] = useState<'idle' | 'saving' | 'taken' | 'invalid' | 'error'>('idle')
  const normalized = normalizeHandle(handle)
  const valid = HANDLE_PATTERN.test(normalized)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) {
      setState('invalid')
      return
    }
    setState('saving')
    api.saveProfile({ handle: normalized, skin_type: skin || null }).then(onSaved, (err) =>
      setState(err instanceof ApiError && err.status === 409 ? 'taken' : err instanceof ApiError && err.status === 422 ? 'invalid' : 'error'),
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4 text-sm leading-relaxed text-ink-soft">
      <p>Biệt danh hiện cạnh bài viết và bình luận của bạn. Email của bạn không bao giờ hiện ra.</p>
      <label className="block">
        <span className="font-medium text-ink">Biệt danh</span>
        <span className="mt-1 flex items-center gap-1">
          <span className="text-ink-soft">@</span>
          <input
            value={handle}
            onChange={(e) => {
              setHandle(e.target.value)
              setState('idle')
            }}
            maxLength={40}
            autoComplete="off"
            spellCheck={false}
            data-autofocus
            className={field}
          />
        </span>
        <span className="mt-1 block text-xs text-ink-soft">
          2–30 ký tự: chữ thường không dấu, số, dấu chấm hoặc dấu gạch dưới.
        </span>
      </label>
      <label className="block">
        <span className="font-medium text-ink">Loại da (không bắt buộc)</span>
        <select value={skin} onChange={(e) => setSkin(e.target.value as SkinType | '')} className={`mt-1 ${selectField}`}>
          <option value="">Không ghi</option>
          {(Object.keys(SKIN_TYPE_LABELS) as SkinType[]).map((s) => (
            <option key={s} value={s}>
              {SKIN_TYPE_LABELS[s]}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-ink-soft">Dùng làm loại da mặc định khi bạn viết bài; ai đọc bài cũng thấy.</span>
      </label>
      <div aria-live="polite">
        {state === 'taken' && <p className="text-avoid-ink">Biệt danh này đã có người dùng.</p>}
        {state === 'invalid' && (
          <p className="text-avoid-ink">
            Biệt danh chỉ gồm 2–30 ký tự: chữ thường không dấu, số, dấu chấm hoặc dấu gạch dưới.
          </p>
        )}
        {state === 'error' && <p className="text-avoid-ink">Không lưu được hồ sơ. Hãy thử lại.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={state === 'saving' || !handle.trim()} className={primary}>
          {state === 'saving' ? 'Đang lưu…' : 'Lưu'}
        </button>
        <button type="button" onClick={onCancel} className={secondary}>
          Huỷ
        </button>
      </div>
    </form>
  )
}

/** The profile lines of the "Tài khoản" dialog. */
export function ProfileSummary() {
  const { state, edit, reload } = useProfile()
  return (
    <section className="border-t border-line pt-4">
      <h3 className="font-semibold text-ink">Hồ sơ review cộng đồng</h3>
      {state.kind === 'loading' && <p className="mt-1 text-ink-soft">Đang tải…</p>}
      {state.kind === 'error' && (
        <p className="mt-1 text-avoid-ink">
          Không tải được hồ sơ, hãy thử lại.{' '}
          <button onClick={reload} className="text-link underline underline-offset-2">
            Thử lại
          </button>
        </p>
      )}
      {state.kind === 'ready' && (
        <p className="mt-1">
          {state.profile.handle ? (
            <>
              Biệt danh <span className="font-medium text-ink">@{state.profile.handle}</span>
              {state.profile.skin_type && ` · ${SKIN_TYPE_LABELS[state.profile.skin_type]}`}
            </>
          ) : (
            'Chưa đặt biệt danh. Cần biệt danh để viết bài hoặc bình luận.'
          )}
        </p>
      )}
      {state.kind === 'ready' && (
        <button onClick={edit} className={`mt-2 ${secondary}`}>
          {state.profile.handle ? 'Sửa hồ sơ' : 'Đặt biệt danh'}
        </button>
      )}
    </section>
  )
}
