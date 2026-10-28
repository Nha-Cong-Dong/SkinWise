import { useState } from 'react'
import { ApiError, EXPORT_URL, api, type Me } from '../api'
import { SESSION_LABELS } from '../labels'
import { sessionEntries, type Routine } from '../routine'
import { syncLabel, type ServerCopy, type SyncState } from '../sync'
import { Dialog } from './Dialog'
import { DataNote } from './Notice'
import { PolicyText } from './PolicyText'

const primary = 'rounded-full bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-link disabled:opacity-40'
const secondary = 'rounded-full px-4 py-2 text-sm font-medium text-ink ring-1 ring-ink hover:bg-paper disabled:opacity-40'
const danger = 'rounded-full bg-avoid px-4 py-2 text-sm font-medium text-white hover:bg-avoid-ink disabled:opacity-40'

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : null)

/** The "Tài khoản" dialog: what SkinWise keeps, export, sign out, delete (plan/h-accounts.md §7). */
export function AccountPanel({
  me,
  sync,
  onSignOut,
  onDeleted,
}: {
  me: Me
  sync: SyncState
  onSignOut: (everywhere: boolean) => Promise<string | null> // null: signed out; else the error to show
  onDeleted: () => void
}) {
  const [policyOpen, setPolicyOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  const signOut = (everywhere: boolean) => {
    setSigningOut(true)
    setSignOutError(null)
    void onSignOut(everywhere).then((problem) => {
      setSigningOut(false)
      setSignOutError(problem)
    })
  }
  const synced = sync.kind === 'synced' ? when(sync.at) : when(me.routine_updated_at)
  const consent = me.consents.at(-1)

  const remove = () => {
    setBusy(true)
    setError(null)
    api.deleteAccount(confirm).then(onDeleted, (e) => {
      setBusy(false)
      setError(e instanceof ApiError && e.status === 422 ? 'Email nhập lại chưa khớp.' : 'Không xoá được tài khoản. Hãy thử lại.')
    })
  }

  return (
    <div className="space-y-6 text-sm leading-relaxed text-ink-soft">
      {me.dev_mode && (
        <p className="rounded-xl bg-caution-soft p-3 text-caution-ink">
          Chế độ thử: tài khoản chưa mở cho người dùng thật, SkinWise không gửi email thật (link xác thực và link đặt lại mật khẩu chỉ hiện trên màn hình).
        </p>
      )}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
        <dt className="text-ink-mute">Email</dt>
        <dd className="font-medium break-all text-ink">{me.email}</dd>
        <dt className="text-ink-mute">Tạo lúc</dt>
        <dd>{when(me.created_at)}</dd>
        <dt className="text-ink-mute">Routine</dt>
        <dd>{sync.kind === 'synced' || sync.kind === 'off' ? (synced ? `Đã lưu lúc ${synced}` : 'Chưa lưu lần nào') : syncLabel(sync)}</dd>
        {consent && (
          <>
            <dt className="text-ink-mute">Đã đồng ý</dt>
            <dd>
              <button onClick={() => setPolicyOpen(true)} className="text-link underline underline-offset-2">
                Chính sách quyền riêng tư
              </button>{' '}
              ({consent.policy_version}), lúc {when(consent.granted_at)}
            </dd>
          </>
        )}
      </dl>

      <section className="flex flex-wrap gap-2">
        <a href={EXPORT_URL} download className={secondary}>
          Tải toàn bộ dữ liệu
        </a>
        <button onClick={() => signOut(false)} disabled={signingOut} className={secondary}>
          Đăng xuất
        </button>
        <button onClick={() => signOut(true)} disabled={signingOut} className={secondary}>
          Đăng xuất mọi thiết bị
        </button>
        {signOutError && <p className="w-full text-avoid-ink">{signOutError}</p>}
      </section>

      <section className="border-t border-line pt-4">
        <h3 className="font-semibold text-ink">Xoá tài khoản</h3>
        <p className="mt-1">
          Xoá ngay email, routine đã lưu và mọi phiên đăng nhập. Routine trên thiết bị này cũng bị xoá; muốn giữ thì tải
          dữ liệu về trước.
        </p>
        {deleting ? (
          <div className="mt-2 space-y-2">
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Nhập lại email của bạn"
              aria-label="Nhập lại email để xác nhận"
              className="w-full rounded-xl border border-line bg-surface px-3.5 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <button onClick={remove} disabled={busy || !confirm.trim()} className={danger}>
                Xoá vĩnh viễn
              </button>
              <button onClick={() => setDeleting(false)} className={secondary}>
                Huỷ
              </button>
            </div>
            {error && <p className="text-avoid-ink">{error}</p>}
          </div>
        ) : (
          <button onClick={() => setDeleting(true)} className={`mt-2 ${secondary}`}>
            Xoá tài khoản…
          </button>
        )}
      </section>

      <Dialog
        open={policyOpen}
        onClose={() => setPolicyOpen(false)}
        title={<h2 className="text-xl font-bold">Chính sách quyền riêng tư</h2>}
      >
        <PolicyText />
      </Dialog>
    </div>
  )
}

const summary = (r: Routine) =>
  `${r.products.length} sản phẩm · ${(['AM', 'PM'] as const)
    .map((s) => `${SESSION_LABELS[s]}: ${sessionEntries(r, s).length} bước`)
    .join(' · ')}`

/** Both copies changed: the user picks one; nothing is overwritten silently (plan/h-accounts.md §6). */
export function SyncConflict({
  local,
  server,
  onKeepThisDevice,
  onUseSynced,
}: {
  local: Routine
  server: ServerCopy
  onKeepThisDevice: () => void
  onUseSynced: () => void
}) {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-ink-soft">
      <p>
        Routine đã được sửa trên thiết bị khác{server.updatedAt ? ` lúc ${when(server.updatedAt)}` : ''}, trong khi thiết
        bị này cũng có thay đổi chưa lưu. Chọn bản muốn giữ:
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl p-3 ring-1 ring-line">
          <p className="font-semibold text-ink">Trên thiết bị này</p>
          <p className="mt-1">{summary(local)}</p>
          <button onClick={onKeepThisDevice} className={`mt-3 ${primary}`}>
            Dùng bản này
          </button>
        </div>
        <div className="rounded-xl p-3 ring-1 ring-line">
          <p className="font-semibold text-ink">Bản đã đồng bộ</p>
          <p className="mt-1">{summary(server.routine)}</p>
          <button onClick={onUseSynced} className={`mt-3 ${primary}`}>
            Dùng bản này
          </button>
        </div>
      </div>
      <DataNote title="Bản không chọn sẽ mất">
        Muốn giữ cả hai thì dùng “Lưu & chia sẻ” để tải bản trên thiết bị này về trước khi chọn.
      </DataNote>
    </div>
  )
}
