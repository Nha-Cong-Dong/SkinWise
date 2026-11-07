import { useEffect, useState, type ReactNode } from 'react'
import { api, requestProblem, TOO_FAST, type RoutineCheckResponse, type Session } from '../api'
import { ALL_DAYS, DAY_LABELS, DAY_NAMES, FEEDBACK_URL, SESSION_LABELS } from '../labels'
import { sampleRoutine, sessionEntries, toCheckRequest, type CheckState, type Routine } from '../routine'
import { GroupChips } from './GroupChips'
import { Logo } from './Icons'
import { stagger } from './motion'
import { SessionShell } from './RoutineBoard'
import { TONE } from './sessionTone'
import { ThemeSwitch } from './ThemeSwitch'
import { btn, btnPrimary } from './ui'
import { WarningsPanel } from './WarningsPanel'

/**
 * The texts of "Vấn đề · Giải pháp · Cách hoạt động · Bắt đầu" come from
 * _workspace/feature-landing-theme/landing_copy.md, a draft the user has not approved yet. While
 * this is false every such section shows "[CHỜ DUYỆT]"; set it to true once approved.
 */
const COPY_APPROVED = false

type Props = {
  /** "Bắt đầu lập kế hoạch", "Tạo tài khoản": the register form. */
  onStart: () => void
  /** "Đăng nhập": the sign-in form. */
  onSignIn: () => void
}

/** Same-page anchors: the router owns the hash, so scroll instead of `href="#…"`. */
function jump(id: string) {
  const target = document.getElementById(id)
  if (!target) return
  target.scrollIntoView({ block: 'start' })
  target.focus({ preventScroll: true })
}

/**
 * The first page for someone not signed in: what SkinWise does, a demo on the real engine
 * (POST /demo/check, sample products only) and the way to an account. It suggests no product
 * and promises nothing; the demo's warnings are the rules' own words.
 */
export function LandingPage({ onStart, onSignIn }: Props) {
  return (
    <div data-motion="enter" className="min-h-screen">
      <header className="mx-auto flex max-w-[75rem] items-center gap-6 px-4 py-4 sm:px-6 lg:px-10">
        <button
          onClick={() => window.scrollTo(0, 0)}
          className="inline-flex min-h-11 shrink-0 items-center rounded-sm"
          aria-label="Lên đầu trang"
        >
          <Logo className="h-10 w-auto lg:h-12" />
        </button>
        <nav aria-label="Trong trang" className="hidden items-center gap-6 text-xs font-semibold md:flex">
          {(
            [
              ['lp-problem', 'Vấn đề'],
              ['lp-solution', 'Giải pháp'],
              ['lp-how', 'Cách hoạt động'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} onClick={() => jump(id)} className="min-h-11 text-ink-soft hover:text-ink">
              {label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden sm:block">
            <ThemeSwitch />
          </div>
          <button onClick={onSignIn} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-primary">
            Đăng nhập
          </button>
          <div className="hidden sm:block">
            <button onClick={onStart} className={btnPrimary}>
              Bắt đầu
            </button>
          </div>
        </div>
      </header>

      <main>
        <Hero onStart={onStart} />
        <div className="flex justify-center px-4 pb-6 sm:hidden">
          <ThemeSwitch />
        </div>

        <Problem />
        <Solution />
        <How />
        <Start onStart={onStart} onSignIn={onSignIn} />
      </main>

      <footer className="mx-auto max-w-[75rem] border-t border-line px-4 py-6 text-xs leading-relaxed text-ink-mute sm:px-6 lg:px-10">
        <p>
          SkinWise là dự án tham gia hackathon Nhà Cộng Đồng. Góp ý:{' '}
          <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" className="text-link underline underline-offset-2">
            GitHub Issues
          </a>{' '}
          (cần tài khoản GitHub; nội dung hiện công khai, đừng ghi email, số điện thoại hay ảnh da của bạn).
        </p>
      </footer>
    </div>
  )
}

/** "hỗn loạn" with its letters out of line, as in the design: drawn, not animated. Read as one word. */
const CHAOS: [string, string][] = [
  ['h', 'translate-y-[-5px] -rotate-[7deg]'],
  ['ỗ', 'translate-y-[4px] rotate-[5deg]'],
  ['n', 'translate-y-[-2px] -rotate-[3deg]'],
  [' ', ''],
  ['l', 'translate-y-[6px] rotate-[8deg]'],
  ['o', 'translate-y-[-4px] -rotate-[5deg]'],
  ['ạ', 'translate-y-[3px] rotate-[4deg]'],
  ['n', 'translate-y-[-6px] -rotate-[8deg]'],
]

function Hero({ onStart }: { onStart: () => void }) {
  return (
    <section className="motion-enter mx-auto max-w-[61.25rem] px-5 pt-10 pb-10 text-center sm:pt-16 lg:pt-22 lg:pb-16">
      <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pr-3.5 pl-1.5 text-xs font-semibold text-ink-soft">
        <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-petal text-dawn-ink">
          ☀
        </span>
        Lịch skincare sáng / tối cho cả tuần, mỗi cảnh báo đều có nguồn
      </p>
      <h1 className="mt-6 font-sans text-[2.5rem] leading-[1.04] font-extrabold tracking-[-0.03em] text-balance sm:text-6xl lg:text-[5rem]">
        Biến sự <span className="sr-only">hỗn loạn</span>
        <span aria-hidden="true" className="whitespace-nowrap text-ink-soft">
          {CHAOS.map(([ch, tilt], i) => (
            <span key={i} className={`inline-block ${tilt}`}>
              {ch === ' ' ? ' ' : ch}
            </span>
          ))}
        </span>
        <br />
        thành <span className="text-primary">sự rõ ràng.</span>
      </h1>
      <p className="mx-auto mt-6 max-w-[40rem] text-base text-pretty text-ink-soft sm:text-lg">
        Xếp từng sản phẩm vào buổi sáng, buổi tối và từng ngày trong tuần. SkinWise đọc bảng thành phần, nhắc khi hai
        hoạt chất cần thận trọng, và cho bạn đọc nguyên văn nguồn của mỗi lời nhắc.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        <button onClick={onStart} className={`${btnPrimary} min-h-13 px-7 text-base`}>
          Bắt đầu lập kế hoạch <span aria-hidden="true">→</span>
        </button>
        <button onClick={() => jump('lp-how')} className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-2">
          Xem cách hoạt động
        </button>
      </div>
      <p className="mt-6 text-xs text-ink-mute">Công cụ nhắc nhở mang tính giáo dục, không thay thế bác sĩ da liễu hay dược sĩ.</p>
    </section>
  )
}

function Pending() {
  if (COPY_APPROVED) return null
  return (
    <span className="ml-2 inline-block rounded-sm border border-dashed border-ink-mute px-1.5 align-middle font-sans text-xs font-semibold tracking-normal text-ink-mute">
      [CHỜ DUYỆT]
    </span>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      id={id}
      tabIndex={-1}
      aria-labelledby={`${id}-title`}
      className="mx-auto max-w-[75rem] scroll-mt-4 px-4 py-12 focus:outline-none sm:px-6 lg:px-10 lg:py-16"
    >
      <h2 id={`${id}-title`} className="max-w-3xl text-3xl text-balance lg:text-4xl">
        {title}
        <Pending />
      </h2>
      {children}
    </section>
  )
}

function Points({ items }: { items: [string, string][] }) {
  return (
    <ul className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 sm:gap-4">
      {items.map(([title, body]) => (
        <li key={title} className="rounded-md bg-surface p-5">
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-ink-soft">{body}</p>
        </li>
      ))}
    </ul>
  )
}

function Problem() {
  return (
    <Section id="lp-problem" title="Càng nhiều bước, càng khó biết mình đang bôi gì">
      <Points
        items={[
          ['Không biết sản phẩm có trùng hoạt chất.', 'Toner, serum và kem dưỡng có thể cùng chứa một nhóm hoạt chất mà tên sản phẩm không nói ra.'],
          ['Không biết kết hợp nào cần cân nhắc.', 'Lời khuyên trên mạng thường không nói rõ là cùng bước, cùng buổi hay cùng ngày.'],
          ['Lời đồn nhiều hơn nguồn.', 'Nhiều câu "không được dùng chung" được lặp lại mà không ai dẫn nguồn.'],
          ['Bảng thành phần khó đọc.', 'Tên hoá học tiếng Anh hoặc Latin, xếp theo thứ tự mà ít người biết cách đọc.'],
        ]}
      />
    </Section>
  )
}

function Solution() {
  return (
    <Section id="lp-solution" title="Mỗi lời nhắc đến từ một luật có nguồn">
      <Points
        items={[
          [
            'Đọc bảng thành phần, nhận ra nhóm hoạt chất.',
            'Chọn sản phẩm có sẵn, dán bảng thành phần hoặc chụp nhãn; SkinWise chỉ ra chất nào trên nhãn thuộc nhóm nào.',
          ],
          ['Kiểm tra theo lịch dùng thật.', 'Cảnh báo xét đúng buổi và đúng ngày bạn dùng, không chỉ danh sách sản phẩm.'],
          [
            'Cảnh báo từ bộ luật cố định, không do AI đoán.',
            'Mỗi luật có mức độ, lời giải thích tiếng Việt và đoạn trích nguyên văn từ nguồn như AAD, DermNet, FDA, đã được người duyệt đối chiếu.',
          ],
          [
            'Nói rõ cả điều chưa biết.',
            'Không có cảnh báo không có nghĩa là chắc chắn không sao; bảng thành phần không ghi nồng độ nên lời nhắc dùng chữ "có thể".',
          ],
        ]}
      />
    </Section>
  )
}

function How() {
  const steps: [string, string][] = [
    ['Thêm sản phẩm', 'tìm theo tên hoặc thành phần, dán bảng thành phần, hoặc chụp nhãn rồi so lại với bao bì.'],
    ['Xếp lịch', 'thêm sản phẩm vào buổi sáng, buổi tối và chọn ngày trong tuần.'],
    ['Đọc kết quả kiểm tra', 'mỗi lời nhắc có mức độ, giải thích và nguồn; bấm để đọc nguyên văn.'],
  ]
  return (
    <Section id="lp-how" title="Ba bước">
      <ol className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-3 md:gap-4">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-3 rounded-md bg-surface p-5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral text-xs font-semibold text-ink-soft tabular-nums">
              {i + 1}
            </span>
            <p>
              <span className="font-semibold">{title}</span> — <span className="text-ink-soft">{body}</span>
            </p>
          </li>
        ))}
      </ol>
      <Demo />
    </Section>
  )
}

function Start({ onStart, onSignIn }: Props) {
  return (
    <Section id="lp-start" title="Bắt đầu với lịch dùng của bạn">
      <p className="mt-3 max-w-2xl text-ink-soft">
        Tạo tài khoản bằng email để lịch dùng được lưu và đồng bộ giữa các máy. SkinWise không bán sản phẩm và không gợi
        ý mua gì.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button onClick={onStart} className={btnPrimary}>
          Tạo tài khoản
        </button>
        <button onClick={onSignIn} className={btn}>
          Đăng nhập
        </button>
      </div>
    </Section>
  )
}

// --- Demo -----------------------------------------------------------------

type Catalogue = { kind: 'loading' } | { kind: 'error' } | { kind: 'missing' } | { kind: 'ready' }

/**
 * The sample routine (sampleRoutine(), the same four catalogue products as "Thử với routine mẫu")
 * with day buttons; every change is checked by the real engine through POST /demo/check. Kept in
 * this page only: it never touches the visitor's own routine or storage.
 */
function Demo() {
  const [routine, setRoutine] = useState<Routine | null>(null)
  const [catalogue, setCatalogue] = useState<Catalogue>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    api.searchProducts('').then(
      (list) => {
        if (!live) return
        const sample = sampleRoutine(list)
        setRoutine(sample)
        setCatalogue({ kind: sample ? 'ready' : 'missing' })
      },
      () => live && setCatalogue({ kind: 'error' }),
    )
    return () => {
      live = false
    }
  }, [attempt])

  const check = useDemoCheck(routine)

  const toggle = (id: string, day: number) =>
    setRoutine((r) =>
      r && {
        ...r,
        entries: r.entries.map((e) =>
          e.id === id
            ? { ...e, days: e.days.includes(day) ? e.days.filter((d) => d !== day) : [...e.days, day].sort((a, b) => a - b) }
            : e,
        ),
      },
    )

  return (
    <div className="mt-10">
      <p className="text-center text-xs text-ink-mute">Thử bấm vào các nút ngày. Kết quả kiểm tra cập nhật ngay.</p>
      <div className="motion-enter mt-4 rounded-md border border-line bg-neutral" style={stagger(1)}>
        <div className="flex min-h-11 items-center gap-4 rounded-t-md border-b border-line bg-surface px-4 py-2">
          <span className="text-xs font-semibold">Lịch dùng mẫu</span>
          <span className="text-xs text-ink-mute">4 sản phẩm có sẵn, chỉ để xem SkinWise kiểm tra thế nào, không phải gợi ý cách dùng</span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          {catalogue.kind === 'loading' && <p className="motion-loading text-sm text-ink-mute">Đang tải lịch dùng mẫu…</p>}
          {catalogue.kind === 'missing' && (
            <p className="text-sm text-ink-soft">Lịch dùng mẫu hiện không có đủ sản phẩm nên chưa thử được.</p>
          )}
          {catalogue.kind === 'error' && (
            <p className="text-sm text-avoid-ink">
              Không tải được lịch dùng mẫu.{' '}
              <button
                onClick={() => {
                  setCatalogue({ kind: 'loading' })
                  setAttempt((n) => n + 1)
                }}
                className="font-semibold underline underline-offset-2"
              >
                Thử lại
              </button>
            </p>
          )}
          {routine && (
            <>
              <div className="flex min-w-0 flex-col gap-4">
                {(['AM', 'PM'] as const).map((session) => (
                  <DemoSession key={session} session={session} routine={routine} onToggle={toggle} />
                ))}
              </div>
              <div className="min-w-0 lg:sticky lg:top-4">
                <WarningsPanel state={check} products={routine.products} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function DemoSession({
  session,
  routine,
  onToggle,
}: {
  session: Session
  routine: Routine
  onToggle: (id: string, day: number) => void
}) {
  const tone = TONE[session]
  const entries = sessionEntries(routine, session)
  const products = new Map(routine.products.map((p) => [p.key, p]))
  const label = `buổi ${SESSION_LABELS[session].toLowerCase()}`
  return (
    <SessionShell session={session} caption={`${entries.length} bước`}>
      <ol className={`mt-3 ${tone.list}`}>
        {entries.map((entry, i) => {
          const product = products.get(entry.productKey)
          if (!product) return null
          return (
            <li key={entry.id} className={`grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3 py-3.5 ${tone.row}`}>
              <span className={`mt-0.5 flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${tone.step}`}>
                {i + 1}
              </span>
              <div className="min-w-0">
                <span className={`block text-xs ${tone.mute}`}>{product.brand}</span>
                <p className="leading-snug font-semibold text-pretty">{product.name}</p>
                <div className="mt-1.5">
                  <GroupChips codes={product.groups} tone={session === 'PM' ? 'night' : 'day'} />
                </div>
              </div>
              <div
                className="col-span-2 grid w-full grid-cols-7 gap-1 md:flex md:w-auto"
                role="group"
                aria-label={`Ngày dùng “${product.name}”, ${label}`}
              >
                {ALL_DAYS.map((day) => {
                  const on = entry.days.includes(day)
                  return (
                    <button
                      key={day}
                      onClick={() => onToggle(entry.id, day)}
                      aria-pressed={on}
                      aria-label={`${DAY_LABELS[day]}, ${DAY_NAMES[day]}`}
                      className={`motion-press relative h-11 rounded-md border text-xs font-semibold tabular-nums md:size-9 md:shrink-0 md:rounded-full ${on ? tone.dayOn : tone.dayOff}`}
                    >
                      {DAY_LABELS[day]}
                      {on && (
                        <span
                          aria-hidden="true"
                          className={`absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full border text-[0.5625rem] leading-none ${tone.tick}`}
                        >
                          ✓
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </li>
          )
        })}
      </ol>
    </SessionShell>
  )
}

/**
 * Check the demo routine on every change (debounced, a newer check cancels an older one), through
 * the public POST /demo/check. Same states as useRoutineCheck, so WarningsPanel shows it as is.
 */
function useDemoCheck(routine: Routine | null): CheckState {
  const request = routine ? toCheckRequest(routine) : null
  const body = request
    ? JSON.stringify({
        // The sample routine has catalogue products only, so every product has its id.
        products: request.products.map((p) => ({ key: p.key, product_id: p.product_id ?? 0 })),
        items: request.items,
      })
    : ''
  const empty = !request || request.items.length === 0
  const [last, setLast] = useState<{ body: string; result?: RoutineCheckResponse; error?: string; tooMany?: boolean } | null>(
    null,
  )
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (empty) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      api
        .demoCheck(JSON.parse(body), controller.signal)
        .then((result) => setLast({ body, result }))
        .catch((e) => {
          if (e.name === 'AbortError') return
          setLast({ body, error: e.message, tooMany: requestProblem(e) === 'too-many' })
        })
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [body, empty, attempt])

  if (empty) return { kind: 'empty' }
  if (last?.body !== body) return { kind: 'loading', previous: last?.result ?? null }
  if (last.result) return { kind: 'done', result: last.result }
  return {
    kind: 'error',
    message: last.tooMany ? TOO_FAST : (last.error ?? ''),
    problem: last.tooMany ? 'too-many' : 'failed',
    retry: () => {
      setLast(null)
      setAttempt((n) => n + 1)
    },
  }
}
