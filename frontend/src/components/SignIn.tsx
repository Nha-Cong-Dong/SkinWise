import { useState, type ReactNode } from 'react'
import { POLICY_VERSION, type EmailLink } from '../account'
import { ApiError, api, type EmailSent, type Me } from '../api'
import { Dialog } from './Dialog'
import { Mark } from './Icons'
import { PolicyText } from './PolicyText'

const field =
  'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[0.9375rem] placeholder:text-ink-mute/80 focus:border-link focus:outline-none focus:ring-2 focus:ring-link/20'
const primary = 'rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-link disabled:opacity-40'
const textLink = 'text-link underline underline-offset-2'

const PASSWORD_HINT = 'Ít nhất 8 ký tự. Nên dùng một cụm từ dễ nhớ, khó đoán.'
const LINK_USED = {
  'verify-email':
    'Link đã hết hạn hoặc đã được dùng. Nếu email đã được xác thực, hãy đăng nhập bằng mật khẩu; nếu chưa, hãy đăng nhập để gửi lại link xác thực.',
  'reset-password': 'Link đã hết hạn hoặc đã được dùng. Hãy yêu cầu link mới bằng Quên mật khẩu.',
} as const

/** The sentence for a 422 the route itself returns (its `detail`), or null for any other 422. */
function invalidInput(e: ApiError): string | null {
  switch (e.message) {
    case 'consent is required':
      return 'Hãy đánh dấu ô đồng ý với chính sách quyền riêng tư để tạo tài khoản.'
    case 'not an email address':
      return 'Email không hợp lệ.'
    case 'password must be 8 to 128 characters':
      return 'Mật khẩu cần từ 8 đến 128 ký tự.'
    case 'password must not be the email':
      return 'Mật khẩu không được trùng với email.'
    default:
      return null
  }
}

/** The request fields a Pydantic 422 points at (`detail[*].loc`, e.g. ["body", "token"]). */
function pydanticFields(e: ApiError): Set<string> {
  const detail = (e.body as { detail?: unknown } | null)?.detail
  if (!Array.isArray(detail)) return new Set()
  return new Set(
    detail.flatMap((d: { loc?: unknown }) => (Array.isArray(d?.loc) ? d.loc.filter((x) => typeof x === 'string') : [])),
  )
}

/** register, resend-verification, forgot-password: the requests that send an email. */
function emailRequestError(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Không kết nối được máy chủ SkinWise. Hãy thử lại sau.'
  if (e.status === 429) return 'Bạn đã yêu cầu quá nhiều email. Hãy thử lại sau.'
  if (e.status === 409) return 'Chính sách quyền riêng tư vừa đổi. Hãy tải lại trang để đọc bản mới.'
  // A 422 from Pydantic (e.g. a too short address) has no sentence of its own: the email is the field at fault.
  if (e.status === 422) return invalidInput(e) ?? 'Email không hợp lệ.'
  return 'Không gửi được email. Hãy thử lại sau.'
}

function Shell({ children }: { children: ReactNode }) {
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
        {children}
      </main>
    </div>
  )
}

type Mode = 'sign-in' | 'register' | 'forgot'

/** The door of the app: sign in, create an account, or ask for a password reset link. */
export function SignIn({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('') // kept when switching between the forms
  const [sent, setSent] = useState<EmailSent | null>(null)

  const go = (next: Mode) => {
    setSent(null)
    setMode(next)
  }

  return (
    <Shell>
      {sent ? (
        <Sent sent={sent} onBack={() => go('sign-in')} />
      ) : mode === 'sign-in' ? (
        <SignInForm email={email} setEmail={setEmail} onSignedIn={onSignedIn} onSent={setSent} go={go} />
      ) : mode === 'register' ? (
        <RegisterForm email={email} setEmail={setEmail} onSent={setSent} go={go} />
      ) : (
        <ForgotForm email={email} setEmail={setEmail} onSent={setSent} go={go} />
      )}
    </Shell>
  )
}

/** After a request that sends an email. In dev mode no email is sent: the link is shown here. */
function Sent({ sent, onBack }: { sent: EmailSent; onBack: () => void }) {
  return (
    <div className="mt-6 space-y-4 text-sm leading-relaxed text-ink-soft">
      <h1 className="text-xl font-bold text-ink">Kiểm tra email của bạn</h1>
      <p>{sent.message_vi}</p>
      {sent.dev_link && (
        <a href={sent.dev_link} className={`inline-block ${primary}`}>
          Mở link
        </a>
      )}
      <button onClick={onBack} className={`block ${textLink}`}>
        Quay lại đăng nhập
      </button>
    </div>
  )
}

type FormProps = {
  email: string
  setEmail: (email: string) => void
  onSent: (sent: EmailSent) => void
  go: (mode: Mode) => void
}

function EmailField({ email, setEmail }: Pick<FormProps, 'email' | 'setEmail'>) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      <span>Email</span>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="ban@example.com"
        autoComplete="email"
        className={field}
        data-autofocus
      />
    </label>
  )
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  hint?: boolean
}) {
  const [shown, setShown] = useState(false)
  return (
    <div className="space-y-1.5">
      <label className="block space-y-1.5 text-sm font-medium">
        <span>{label}</span>
        <input
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className={field}
        />
      </label>
      {hint && <p className="text-xs leading-relaxed text-ink-mute">{PASSWORD_HINT}</p>}
      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input type="checkbox" checked={shown} onChange={(e) => setShown(e.target.checked)} className="size-4 accent-ink" />
        Hiện mật khẩu
      </label>
    </div>
  )
}

function SignInForm({ email, setEmail, onSignedIn, onSent, go }: FormProps & { onSignedIn: (me: Me) => void }) {
  const [password, setPassword] = useState('')
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'busy' }
    | { kind: 'error'; message: string }
    | { kind: 'not-verified'; error: string | null } // right password, email not verified yet
  >({ kind: 'idle' })

  const signIn = () => {
    setState({ kind: 'busy' })
    api.signIn({ email, password }).then(onSignedIn, (e) => {
      if (e instanceof ApiError && e.status === 403) return setState({ kind: 'not-verified', error: null })
      setState({
        kind: 'error',
        message:
          e instanceof ApiError && e.status === 401
            ? 'Email hoặc mật khẩu không đúng.'
            : e instanceof ApiError && e.status === 429
              ? 'Đăng nhập sai quá nhiều lần. Hãy thử lại sau ít phút, hoặc đặt lại mật khẩu.'
              : e instanceof ApiError && e.status === 422
                ? 'Email không hợp lệ.'
                : 'Không đăng nhập được. Hãy thử lại sau.',
      })
    })
  }

  const resend = () => {
    setState({ kind: 'busy' })
    // The email and password just typed: the server sends a link only if they match an unverified account.
    api.resendVerification({ email, password }).then(onSent, (e) => setState({ kind: 'not-verified', error: emailRequestError(e) }))
  }

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (email.trim() && password) signIn()
      }}
    >
      <h1 className="text-xl font-bold">Đăng nhập</h1>
      <EmailField email={email} setEmail={setEmail} />
      <PasswordField label="Mật khẩu" value={password} onChange={setPassword} autoComplete="current-password" />
      {state.kind === 'error' && <p className="text-sm text-avoid-ink">{state.message}</p>}
      {state.kind === 'not-verified' && (
        <div className="space-y-2 text-sm">
          <p className="text-avoid-ink">Email này chưa được xác thực. Mở link trong email để xác thực, hoặc gửi lại link.</p>
          <button type="button" onClick={resend} className={textLink}>
            Gửi lại link xác thực
          </button>
          {state.error && <p className="text-avoid-ink">{state.error}</p>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <button type="submit" disabled={!email.trim() || !password || state.kind === 'busy'} className={primary}>
          {state.kind === 'busy' ? 'Đang xử lý…' : 'Đăng nhập'}
        </button>
        <button type="button" onClick={() => go('forgot')} className={`text-sm ${textLink}`}>
          Quên mật khẩu?
        </button>
      </div>
      <p className="border-t border-line pt-4 text-sm text-ink-soft">
        Chưa có tài khoản?{' '}
        <button type="button" onClick={() => go('register')} className={`font-medium ${textLink}`}>
          Tạo tài khoản
        </button>
      </p>
    </form>
  )
}

function RegisterForm({ email, setEmail, onSent, go }: FormProps) {
  const [password, setPassword] = useState('')
  const [consent, setConsent] = useState(false) // never ticked in advance
  const [policyOpen, setPolicyOpen] = useState(false)
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string }>({
    kind: 'idle',
  })

  const register = () => {
    setState({ kind: 'busy' })
    api
      .register({ email, password, consent, policy_version: POLICY_VERSION })
      .then(onSent, (e) => setState({ kind: 'error', message: emailRequestError(e) }))
  }

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (consent && email.trim() && password) register()
      }}
    >
      <h1 className="text-xl font-bold">Tạo tài khoản</h1>
      <p className="text-sm leading-relaxed text-ink-soft">
        SkinWise gửi một link tới email để xác thực. Bạn đăng nhập được sau khi bấm link đó.
      </p>
      <EmailField email={email} setEmail={setEmail} />
      <PasswordField label="Mật khẩu" value={password} onChange={setPassword} autoComplete="new-password" hint />
      <label className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-soft">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 size-4 shrink-0 accent-ink"
        />
        <span>
          Tôi đồng ý để SkinWise lưu email và routine của tôi, để đăng nhập và dùng routine trên nhiều thiết bị, theo{' '}
          <button type="button" onClick={() => setPolicyOpen(true)} className={`font-medium ${textLink}`}>
            chính sách quyền riêng tư
          </button>
          .
        </span>
      </label>
      {state.kind === 'error' && <p className="text-sm text-avoid-ink">{state.message}</p>}
      <button
        type="submit"
        disabled={!consent || !email.trim() || !password || state.kind === 'busy'}
        className={primary}
      >
        {state.kind === 'busy' ? 'Đang gửi…' : 'Tạo tài khoản'}
      </button>
      <p className="border-t border-line pt-4 text-sm text-ink-soft">
        Đã có tài khoản?{' '}
        <button type="button" onClick={() => go('sign-in')} className={`font-medium ${textLink}`}>
          Đăng nhập
        </button>
      </p>
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

function ForgotForm({ email, setEmail, onSent, go }: FormProps) {
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string }>({
    kind: 'idle',
  })

  const send = () => {
    setState({ kind: 'busy' })
    api.forgotPassword(email).then(onSent, (e) => setState({ kind: 'error', message: emailRequestError(e) }))
  }

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (email.trim()) send()
      }}
    >
      <h1 className="text-xl font-bold">Quên mật khẩu?</h1>
      <p className="text-sm leading-relaxed text-ink-soft">
        Nhập email của tài khoản, SkinWise gửi cho bạn một link để đặt mật khẩu mới.
      </p>
      <EmailField email={email} setEmail={setEmail} />
      {state.kind === 'error' && <p className="text-sm text-avoid-ink">{state.message}</p>}
      <button type="submit" disabled={!email.trim() || state.kind === 'busy'} className={primary}>
        {state.kind === 'busy' ? 'Đang gửi…' : 'Gửi link đặt lại mật khẩu'}
      </button>
      <button type="button" onClick={() => go('sign-in')} className={`block text-sm ${textLink}`}>
        Quay lại đăng nhập
      </button>
    </form>
  )
}

/**
 * A verification or reset link opened in this tab. Nothing is sent until the user clicks: mail
 * scanners that open links by themselves would otherwise use up the single-use token.
 */
export function EmailLinkPage({
  link,
  signedInAs,
  beforeSignIn,
  onSignedIn,
  onLeave,
}: {
  link: EmailLink
  signedInAs: string | null // this tab is already signed in with that email
  beforeSignIn: () => Promise<boolean> // e.g. send the current account's unsaved routine; false: stop
  onSignedIn: (me: Me) => void
  onLeave: () => void
}) {
  const reset = link.kind === 'reset-password'
  const [password, setPassword] = useState('')
  const [state, setState] = useState<
    { kind: 'idle' } | { kind: 'busy' } | { kind: 'used' } | { kind: 'error'; message: string }
  >({ kind: 'idle' })

  const submit = async () => {
    setState({ kind: 'busy' })
    if (!(await beforeSignIn().catch(() => false))) return setState({ kind: 'idle' })
    const body = { token: link.token, password }
    const call = reset ? api.resetPassword(body) : api.verifyEmail(body)
    call.then(onSignedIn, (e) => {
      if (e instanceof ApiError && e.status === 400) return setState({ kind: 'used' })
      // A Pydantic 422 on the token (e.g. a cut-off link) means the link is broken, not the password.
      if (e instanceof ApiError && e.status === 422 && !invalidInput(e) && pydanticFields(e).has('token')) {
        return setState({ kind: 'used' })
      }
      // 401 (verification only): the link is still unused and can be tried again with the right password.
      setState({
        kind: 'error',
        message:
          e instanceof ApiError && e.status === 401
            ? 'Mật khẩu không khớp với lần tạo tài khoản của link này. Nếu bạn đã tạo tài khoản lại, hãy dùng link trong email mới nhất của lần đó.'
            : e instanceof ApiError && e.status === 429
              ? 'Đăng nhập sai quá nhiều lần. Hãy thử lại sau ít phút, hoặc đặt lại mật khẩu.'
              : e instanceof ApiError && e.status === 422
            ? (invalidInput(e) ?? 'Mật khẩu cần từ 8 đến 128 ký tự.')
            : reset
              ? 'Không đặt được mật khẩu mới. Hãy thử lại sau.'
              : 'Không xác thực được email. Hãy thử lại sau.',
      })
    })
  }

  return (
    <Shell>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-ink-soft">
        <h1 className="text-xl font-bold text-ink">{reset ? 'Đặt mật khẩu mới' : 'Xác thực email'}</h1>
        {state.kind === 'used' ? (
          <>
            <p className="text-avoid-ink">{LINK_USED[link.kind]}</p>
            <button onClick={onLeave} className={primary}>
              {signedInAs ? 'Quay lại SkinWise' : 'Quay lại đăng nhập'}
            </button>
          </>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (password) void submit()
            }}
          >
            {signedInAs && (
              <p>
                Bạn đang đăng nhập bằng <span className="font-medium break-all text-ink">{signedInAs}</span>. Tiếp tục
                sẽ đăng nhập bằng tài khoản của link này.
              </p>
            )}
            {reset ? (
              <PasswordField label="Mật khẩu mới" value={password} onChange={setPassword} autoComplete="new-password" hint />
            ) : (
              <>
                <p>Bấm nút bên dưới để xác thực email và đăng nhập trên thiết bị này.</p>
                <PasswordField
                  label="Mật khẩu bạn vừa đặt khi tạo tài khoản"
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                />
              </>
            )}
            {state.kind === 'error' && <p className="text-avoid-ink">{state.message}</p>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <button type="submit" disabled={state.kind === 'busy' || !password} className={primary}>
                {state.kind === 'busy' ? 'Đang xử lý…' : reset ? 'Đặt mật khẩu mới' : 'Xác thực email'}
              </button>
              <button type="button" onClick={onLeave} className={textLink}>
                {signedInAs ? 'Huỷ' : 'Quay lại đăng nhập'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Shell>
  )
}
