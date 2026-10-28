import { useCallback, useContext, useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, ApiError, reviewApi, type Draft, type ReviewApi } from '../api'
import { GroupsContext } from '../groups'
import { DraftCard, DraftForm } from './DraftCard'

type ReviewSession = { token: string; name: string }

// sessionStorage: closing the tab signs the reviewer out of this browser.
const STORAGE_KEY = 'skinwise.review-session'

function loadSession(): ReviewSession | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null')
    if (typeof parsed?.token === 'string' && typeof parsed?.name === 'string') return parsed
  } catch {
    // Storage blocked or corrupt: sign in again.
  }
  return null
}

function saveSession(session: ReviewSession | null) {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked: the session lasts until the page is reloaded.
  }
}

/** Review page (#review): AI drafts of myth cards. Sign-in required. */
export function ReviewPage() {
  const [session, setSession] = useState<ReviewSession | null>(loadSession)

  const signOut = useCallback(() => {
    saveSession(null)
    setSession(null)
  }, [])

  if (!session) {
    return (
      <LoginForm
        onSignedIn={(s) => {
          saveSession(s)
          setSession(s)
        }}
      />
    )
  }
  return <ReviewBoard session={session} onSignOut={signOut} />
}

function LoginForm({ onSignedIn }: { onSignedIn: (session: ReviewSession) => void }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'wrong' | 'error'>('idle')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setState('sending')
    api.login(name.trim(), password).then(
      (r) => onSignedIn({ token: r.token, name: r.name }),
      (err) => setState(err instanceof ApiError && err.status === 401 ? 'wrong' : 'error'),
    )
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-3 rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-lg font-semibold text-slate-900">Đăng nhập người duyệt</h2>
      <p className="text-sm text-slate-500">
        Tài khoản người duyệt do quản trị tạo bằng <code className="text-xs">scripts.reviewers</code>.
      </p>
      <label className="block text-sm">
        <span className="text-slate-600">Tên</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="username"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-slate-600">Mật khẩu</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={!name.trim() || !password || state === 'sending'}
        className="w-full rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-500"
      >
        {state === 'sending' ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </button>
      {state === 'wrong' && <p className="text-sm text-red-700">Sai tên hoặc mật khẩu.</p>}
      {state === 'error' && <p className="text-sm text-red-700">Không kết nối được máy chủ.</p>}
    </form>
  )
}

function ReviewBoard({ session, onSignOut }: { session: ReviewSession; onSignOut: () => void }) {
  // Every call goes through here: an expired session sends the reviewer back to sign in.
  const client = useMemo(() => reviewApi(session.token), [session.token])
  const guard = useCallback(
    <T,>(promise: Promise<T>): Promise<T> =>
      promise.catch((err) => {
        if (err instanceof ApiError && err.status === 401) onSignOut()
        throw err
      }),
    [onSignOut],
  )

  const signOut = () => {
    client.logout().finally(onSignOut)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Duyệt bản nháp thẻ myth</h2>
          <p className="text-sm text-slate-500">
            Luật và thẻ myth chỉ được bật trong <code className="text-xs">backend/data/rules.toml</code> sau khi người
            duyệt đọc nguồn; trang này không bật được luật nào.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-600">{session.name}</span>
          <button onClick={signOut} className="text-rose-700 hover:underline">
            Đăng xuất
          </button>
        </div>
      </div>
      <DraftsTab client={client} guard={guard} />
    </div>
  )
}

type Guard = <T>(promise: Promise<T>) => Promise<T>

function DraftsTab({ client, guard }: { client: ReviewApi; guard: Guard }) {
  const groups = useContext(GroupsContext)
  const [status, setStatus] = useState<Draft['status']>('draft')
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    guard(client.drafts(status)).then(
      (list) => {
        setDrafts(list)
        setError(false)
      },
      () => setError(true),
    )
  }, [client, guard, status])

  // A draft moved to the other status leaves this list.
  const replace = (updated: Draft) =>
    setDrafts((list) => list?.map((d) => (d.id === updated.id ? updated : d)).filter((d) => d.status === status) ?? null)

  return (
    <section className="space-y-4">
      {groups.size > 0 && (
        <DraftForm
          client={client}
          guard={guard}
          onCreated={(d) => status === 'draft' && setDrafts((list) => [d, ...(list ?? [])])}
        />
      )}
      <div className="flex gap-1 text-sm">
        {(
          [
            ['draft', 'Đang chờ duyệt'],
            ['discarded', 'Đã bỏ'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setStatus(value)}
            aria-pressed={status === value}
            className={`rounded-full px-3 py-1 ring-1 ${status === value ? 'bg-slate-800 text-white ring-slate-800' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-700">Không tải được bản nháp.</p>}
      {drafts?.length === 0 && <p className="text-sm text-slate-500">Không có bản nháp nào.</p>}
      {drafts?.map((d) => (
        <DraftCard key={d.id} draft={d} client={client} guard={guard} onChanged={replace} />
      ))}
    </section>
  )
}
