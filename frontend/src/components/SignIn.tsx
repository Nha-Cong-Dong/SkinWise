import { useEffect, useState } from 'react'
import { POLICY_VERSION, signInToken } from '../account'
import { ApiError, api, type Me } from '../api'
import { Dialog } from './Dialog'
import { Mark } from './Icons'
import { PolicyText } from './PolicyText'

const field =
  'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[0.9375rem] placeholder:text-ink-mute/80 focus:border-link focus:outline-none focus:ring-2 focus:ring-link/20'
const primary = 'rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-link disabled:opacity-40'

/** The door of the app: ask for a sign-in link, or use the one opened in this tab. */
export function SignIn({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const [token, setToken] = useState(() => signInToken(location.hash))

  useEffect(() => {
    const onHash = () => setToken(signInToken(location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="flex min-h-screen items-start justify-center px-4 py-10 sm:items-center">
      <main className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-line sm:p-8">
        <div className="flex items-center gap-2.5">
          <Mark className="size-9" />
          <span className="text-2xl leading-none font-bold tracking-tight">SkinWise</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Xếp lịch dùng sản phẩm, phát hiện trùng hoạt chất và kết hợp cần thận trọng, kèm nguồn tham khảo.
        </p>
        {token ? (
          <UseLink token={token} onSignedIn={onSignedIn} onRestart={() => setToken(null)} />
        ) : (
          <AskLink />
        )}
      </main>
    </div>
  )
}

function AskLink() {
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [policyOpen, setPolicyOpen] = useState(false)
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'sending' }
    | { kind: 'sent'; message: string; devLink: string | null }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' })

  const send = () => {
    setState({ kind: 'sending' })
    api.requestSignInLink(email, POLICY_VERSION).then(
      (r) => setState({ kind: 'sent', message: r.message_vi, devLink: r.dev_link }),
      (e) =>
        setState({
          kind: 'error',
          message:
            e instanceof ApiError && e.status === 429
              ? 'Bạn đã yêu cầu nhiều link quá. Hãy đợi một lúc rồi thử lại.'
              : e instanceof ApiError && e.status === 422
                ? 'Địa chỉ email chưa đúng.'
                : e instanceof ApiError && e.status === 409
                  ? 'Chính sách quyền riêng tư vừa đổi. Hãy tải lại trang để đọc bản mới.'
                  : 'Không gửi được link đăng nhập. Hãy thử lại sau.',
        }),
    )
  }

  if (state.kind === 'sent') {
    return (
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-ink-soft">
        <h1 className="text-xl font-bold text-ink">Kiểm tra email của bạn</h1>
        <p>{state.message}</p>
        {state.devLink && (
          <a href={state.devLink} className={`inline-block ${primary}`}>
            Mở link đăng nhập
          </a>
        )}
        <button
          onClick={() => setState({ kind: 'idle' })}
          className="block text-link underline underline-offset-2"
        >
          Dùng email khác
        </button>
      </div>
    )
  }

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (consent && email.trim()) send()
      }}
    >
      <h1 className="text-xl font-bold">Đăng nhập</h1>
      <p className="text-sm leading-relaxed text-ink-soft">
        Nhập email, SkinWise gửi cho bạn một link đăng nhập. Không cần mật khẩu.
      </p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="ban@example.com"
        aria-label="Email"
        autoComplete="email"
        className={field}
        data-autofocus
      />
      <label className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-soft">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 size-4 shrink-0 accent-ink"
        />
        <span>
          Tôi đồng ý để SkinWise lưu email và routine của tôi, để đăng nhập và dùng routine trên nhiều thiết bị, theo{' '}
          <button
            type="button"
            onClick={() => setPolicyOpen(true)}
            className="font-medium text-link underline underline-offset-2"
          >
            chính sách quyền riêng tư
          </button>
          .
        </span>
      </label>
      {state.kind === 'error' && <p className="text-sm text-avoid-ink">{state.message}</p>}
      <button type="submit" disabled={!consent || !email.trim() || state.kind === 'sending'} className={primary}>
        {state.kind === 'sending' ? 'Đang gửi…' : 'Gửi link đăng nhập'}
      </button>
      <Dialog
        open={policyOpen}
        onClose={() => setPolicyOpen(false)}
        title={<h2 className="text-xl font-bold">Chính sách quyền riêng tư</h2>}
      >
        <PolicyText />
      </Dialog>
    </form>
  )
}

/**
 * A sign-in link opened in this tab. It signs in only on a click: mail scanners that open links
 * by themselves would otherwise use up the single-use token.
 */
function UseLink({ token, onSignedIn, onRestart }: { token: string; onSignedIn: (me: Me) => void; onRestart: () => void }) {
  const [state, setState] = useState<'idle' | 'signing-in' | 'failed'>('idle')

  const signIn = () => {
    setState('signing-in')
    api.signIn(token).then(
      (me) => {
        history.replaceState(null, '', location.pathname) // the token must not stay in the address
        onSignedIn(me)
      },
      () => setState('failed'),
    )
  }

  const restart = () => {
    history.replaceState(null, '', location.pathname)
    onRestart()
  }

  return (
    <div className="mt-6 space-y-4 text-sm leading-relaxed text-ink-soft">
      <h1 className="text-xl font-bold text-ink">Đăng nhập vào SkinWise</h1>
      {state === 'failed' ? (
        <>
          <p className="text-avoid-ink">Link đăng nhập đã hết hạn hoặc đã được dùng.</p>
          <button onClick={restart} className={primary}>
            Gửi link mới
          </button>
        </>
      ) : (
        <>
          <p>Bấm nút bên dưới để đăng nhập trên thiết bị này.</p>
          <button onClick={signIn} disabled={state === 'signing-in'} className={primary}>
            {state === 'signing-in' ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </>
      )}
    </div>
  )
}
