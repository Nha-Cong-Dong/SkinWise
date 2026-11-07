import { useId, useState, type ReactNode } from 'react'
import { POLICY_VERSION, type EmailLink } from '../account'
import { ApiError, api, type EmailSent, type Me } from '../api'
import { Dialog, DialogTitle } from './Dialog'
import { Logo, SeverityBadge } from './Icons'
import { PolicyText } from './PolicyText'
import { ThemeSwitch } from './ThemeSwitch'
import { btnPrimary, field, segBox, segOption } from './ui'
import { stagger } from './motion'

const primary = `${btnPrimary} w-full min-h-12`
const textLink = 'font-semibold text-link underline-offset-2 hover:underline'
const title = 'font-brand text-[1.875rem] leading-tight font-semibold tracking-[-0.01em] text-primary'

const PASSWORD_HINT = 'Ít nhất 8 ký tự. Nên dùng một cụm từ dễ nhớ, khó đoán.'
const LINK_USED = {
  'verify-email':
    'Link đã hết hạn hoặc đã được dùng. Nếu email đã được xác thực, hãy đăng nhập bằng mật khẩu; nếu chưa, hãy đăng nhập để gửi lại link xác thực.',
  'reset-password': 'Link đã hết hạn hoặc đã được dùng. Hãy yêu cầu link mới bằng Quên mật khẩu.',
} as const

/** Why the submit button is still disabled ("Còn thiếu: email, mật khẩu."), or null when nothing is missing. */
function Missing({ items }: { items: [boolean, string][] }) {
  const missing = items.filter(([ok]) => !ok).map(([, label]) => label)
  if (missing.length === 0) return null
  return <p className="text-center text-xs text-ink-mute">Còn thiếu: {missing.join(', ')}.</p>
}

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

function Shell({ children, aside, onBack }: { children: ReactNode; aside?: ReactNode; onBack?: () => void }) {
  return (
    <div data-motion="enter" className="flex min-h-screen flex-col items-center px-4 py-4 lg:py-6">
      <div className="flex w-full max-w-5xl items-center justify-between gap-3">
        {onBack ? (
          <button onClick={onBack} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">
            ← Giới thiệu SkinWise
          </button>
        ) : (
          <span />
        )}
        <ThemeSwitch />
      </div>
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-10 py-6 lg:flex-row lg:items-start lg:gap-16 lg:py-14">
        <main className="motion-enter w-full max-w-md rounded-md bg-surface p-6 sm:p-8">
          <Logo className="h-12 w-auto" />
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Xếp lịch dùng sản phẩm, phát hiện trùng hoạt chất và kết hợp cần thận trọng, kèm nguồn tham khảo.
          </p>
          {children}
        </main>
        {aside}
      </div>
    </div>
  )
}

/** Sign in or create an account: the two tabs above the form. */
function DoorTabs({ mode, go }: { mode: Mode; go: (mode: Mode) => void }) {
  return (
    <div className={`${segBox} mt-6 rounded-full! border-0 bg-neutral`}>
      {(
        [
          ['sign-in', 'Đăng nhập'],
          ['register', 'Đăng ký'],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => go(value)}
          className={`${segOption(mode === value)} rounded-full!`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/**
 * What the app does, for someone who has not signed in yet (sign-in is required, decisions.md
 * 26/10). Static: the example quotes a published rule's title word for word.
 */
function Intro() {
  return (
    <section aria-labelledby="intro-title" style={stagger(1)} className="motion-enter w-full max-w-md text-sm leading-relaxed text-ink-soft lg:max-w-lg">
      <p className="font-script text-[2.875rem] leading-[1.05] font-semibold tracking-[-0.015em] [word-spacing:-0.1em] text-primary lg:text-[3.375rem]" aria-hidden="true">
        Biến sự hỗn loạn
        <br />
        thành sự rõ ràng.
      </p>
      <h2 id="intro-title" className="mt-8 font-sans text-[1.0625rem] font-bold text-ink">
        SkinWise làm gì?
      </h2>
      <ul className="mt-3 space-y-3">
        {(
          [
            ['✚', 'bg-dawn text-dawn-ink', 'Chọn sản phẩm bạn đang dùng (khoảng 30 sản phẩm có sẵn) hoặc dán bảng thành phần in trên bao bì.'],
            ['☾', 'bg-wash-strong text-primary', 'Xếp lịch sáng / tối theo từng ngày trong tuần, theo thứ tự các bước.'],
            [
              '✓',
              'bg-wash-strong text-primary',
              'SkinWise nhận ra hoạt chất và báo khi sản phẩm trùng hoạt chất hoặc kết hợp cần thận trọng. Mỗi cảnh báo kèm giải thích tiếng Việt và đoạn trích nguyên văn từ nguồn đáng tin cậy.',
            ],
          ] as const
        ).map(([icon, tone, text]) => (
          <li key={icon} className="flex items-start gap-3">
            <span aria-hidden="true" className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm ${tone}`}>
              {icon}
            </span>
            <span className="pt-1">{text}</span>
          </li>
        ))}
      </ul>
      <figure className="relative mt-6 overflow-hidden rounded-md bg-surface py-4 pr-5 pl-7">
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-caution" />
        <figcaption className="text-xs text-ink-mute">Ví dụ kết quả kiểm tra</figcaption>
        <div className="mt-2">
          <SeverityBadge severity="caution" />
        </div>
        <p className="mt-2 font-semibold text-ink">Retinoid và acid tẩy tế bào chết trong cùng một buổi</p>
        <p className="mt-1 text-xs text-ink-mute">Serum retinol + toner BHA · Tối: mỗi ngày · Có nguồn và đoạn trích</p>
      </figure>
      <p className="mt-4 text-xs text-ink-mute">
        Bản demo cho hackathon, chưa mở cho người dùng thật.
      </p>
    </section>
  )
}

type Mode = 'sign-in' | 'register' | 'forgot'

/** The door of the app: sign in, create an account, or ask for a password reset link. */
export function SignIn({
  onSignedIn,
  initialMode = 'sign-in',
  onBack,
}: {
  onSignedIn: (me: Me) => void
  initialMode?: 'sign-in' | 'register'
  /** Back to the landing page; left out where there is none (a shared routine link). */
  onBack?: () => void
}) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('') // kept when switching between the forms
  const [sent, setSent] = useState<EmailSent | null>(null)

  const go = (next: Mode) => {
    setSent(null)
    setMode(next)
  }

  return (
    <Shell aside={<Intro />} onBack={onBack}>
      {!sent && mode !== 'forgot' && <DoorTabs mode={mode} go={go} />}
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
      <h1 className={title}>Kiểm tra email của bạn</h1>
      <p>{sent.message_vi}</p>
      {sent.dev_link && (
        <a href={sent.dev_link} className={primary}>
          Mở link
        </a>
      )}
      <button onClick={onBack} className={`inline-flex min-h-11 items-center ${textLink}`}>
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
    <label className="block text-xs font-semibold text-ink">
      Email
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="ban@example.com"
        autoComplete="email"
        className={`${field} mt-1 font-normal`}
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
  const id = useId()
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold text-ink">
        {label}
      </label>
      {/* The toggle sits outside the label: a button inside a label would also focus the field. */}
      <div className="relative">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className={`${field} pr-16`}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-controls={id}
          className="absolute inset-y-0 right-0 min-w-14 rounded-r-sm px-3 text-xs font-semibold text-primary hover:bg-thistle/25"
        >
          Hiện
        </button>
      </div>
      {hint && <p className="text-xs leading-relaxed text-ink-mute">{PASSWORD_HINT}</p>}
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
      <h1 className={title}>Đăng nhập</h1>
      <EmailField email={email} setEmail={setEmail} />
      <PasswordField label="Mật khẩu" value={password} onChange={setPassword} autoComplete="current-password" />
      {state.kind === 'error' && <p className="text-sm text-avoid-ink">{state.message}</p>}
      {state.kind === 'not-verified' && (
        <div className="space-y-2 text-sm">
          <p className="text-avoid-ink">Email này chưa được xác thực. Mở link trong email để xác thực, hoặc gửi lại link.</p>
          <button type="button" onClick={resend} className={`inline-flex min-h-11 items-center ${textLink}`}>
            Gửi lại link xác thực
          </button>
          {state.error && <p className="text-avoid-ink">{state.error}</p>}
        </div>
      )}
      <div className="flex justify-end">
        <button type="button" onClick={() => go('forgot')} className={`inline-flex min-h-11 items-center text-sm ${textLink}`}>
          Quên mật khẩu?
        </button>
      </div>
      <button type="submit" disabled={!email.trim() || !password || state.kind === 'busy'} className={primary}>
        {state.kind === 'busy' ? 'Đang xử lý…' : 'Đăng nhập'}
      </button>
      <Missing items={[[!!email.trim(), 'email'], [!!password, 'mật khẩu']]} />
      <p className="border-t border-line pt-4 text-center text-sm text-ink-soft">
        Chưa có tài khoản?{' '}
        <button type="button" onClick={() => go('register')} className={textLink}>
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
      <h1 className={title}>Tạo tài khoản</h1>
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
          className="mt-1 size-5 shrink-0 accent-primary"
        />
        <span>
          Tôi đồng ý để SkinWise lưu email và routine của tôi, để đăng nhập và dùng routine trên nhiều thiết bị, theo{' '}
          <button type="button" onClick={() => setPolicyOpen(true)} className={textLink}>
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
      <Missing
        items={[
          [!!email.trim(), 'email'],
          [!!password, 'mật khẩu'],
          [consent, 'tích ô đồng ý'],
        ]}
      />
      <p className="border-t border-line pt-4 text-center text-sm text-ink-soft">
        Đã có tài khoản?{' '}
        <button type="button" onClick={() => go('sign-in')} className={textLink}>
          Đăng nhập
        </button>
      </p>
      <Dialog
        open={policyOpen}
        onClose={() => setPolicyOpen(false)}
        title={<DialogTitle>Chính sách quyền riêng tư</DialogTitle>}
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
      <h1 className={title}>Quên mật khẩu?</h1>
      <p className="text-sm leading-relaxed text-ink-soft">
        Nhập email của tài khoản, SkinWise gửi cho bạn một link để đặt mật khẩu mới.
      </p>
      <EmailField email={email} setEmail={setEmail} />
      {state.kind === 'error' && <p className="text-sm text-avoid-ink">{state.message}</p>}
      <button type="submit" disabled={!email.trim() || state.kind === 'busy'} className={primary}>
        {state.kind === 'busy' ? 'Đang gửi…' : 'Gửi link đặt lại mật khẩu'}
      </button>
      <Missing items={[[!!email.trim(), 'email']]} />
      <button type="button" onClick={() => go('sign-in')} className={`inline-flex min-h-11 items-center text-sm ${textLink}`}>
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
        <h1 className={title}>{reset ? 'Đặt mật khẩu mới' : 'Xác thực email'}</h1>
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
            <button type="submit" disabled={state.kind === 'busy' || !password} className={primary}>
              {state.kind === 'busy' ? 'Đang xử lý…' : reset ? 'Đặt mật khẩu mới' : 'Xác thực email'}
            </button>
            <button type="button" onClick={onLeave} className={`inline-flex min-h-11 items-center ${textLink}`}>
              {signedInAs ? 'Huỷ' : 'Quay lại đăng nhập'}
            </button>
            <Missing items={[[!!password, 'mật khẩu']]} />
          </form>
        )}
      </div>
    </Shell>
  )
}
