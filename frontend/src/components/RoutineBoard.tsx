import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react'
import type { Session, Severity, Warning } from '../api'
import { ALL_DAYS, DAY_LABELS, DAY_NAMES, KIND_LABELS, SESSION_LABELS, SEVERITY } from '../labels'
import { href } from '../router'
import {
  currentResult,
  groupByRule,
  isCombinationAlert,
  sessionEntries,
  type CheckState,
  type WarningGroup,
  type Entry,
  type LabelGroups,
  type MyProduct,
  type RoutineActions,
} from '../routine'
import { GroupChips, LABEL_CHIP_NOTE } from './GroupChips'
import { Glyph, MoonIcon, SeverityBadge, SunIcon } from './Icons'
import { stagger } from './motion'
import { TONE } from './sessionTone'
import { btn } from './ui'
import { SeverityCounts } from './WarningsPanel'

type Props = {
  actions: RoutineActions
  /** Opens the "save and share" dialog. */
  onShare: () => void
  /** Most severe warning each product key is part of. */
  flagged: Map<string, Severity>
  /** Label lines behind each product's groups (product key), from the last check. */
  found: Map<string, LabelGroups>
  check: CheckState
  /** A rule key from the check tab ("Mở lịch tuần để sắp xếp lại"): show where that warning is. */
  focus?: string
}

/** The warnings of the focused rule in the last check, or null (no focus, or no such warning now). */
function focusedGroup(check: CheckState, focus: string | undefined): WarningGroup | null {
  if (!focus) return null
  return groupByRule(currentResult(check)?.warnings ?? []).find((g) => g.rule.key === focus) ?? null
}

/** The sessions the focused warning names, morning first (a same-day rule names none). */
function spotSessions(spot: WarningGroup | null): Session[] {
  const named = new Set(spot?.warnings.flatMap((w) => w.occurrences.map((o) => o.session)))
  return (['AM', 'PM'] as const).filter((s) => named.has(s))
}

/**
 * Days of one step that the focused warning names: its product is in the warning, and the warning
 * applies on that day in the step's session (or all day). Display only, from the check's own days.
 */
function spotDays(spot: WarningGroup | null, entry: Entry): number[] {
  if (!spot) return []
  const days = new Set<number>()
  for (const w of spot.warnings) {
    if (!w.product_keys.includes(entry.productKey)) continue
    for (const o of w.occurrences) {
      if ((o.session === entry.session || o.session === null) && entry.days.includes(o.day)) days.add(o.day)
    }
  }
  return [...days].sort((a, b) => a - b)
}

/** "Lịch tuần": one session at a time, each step with its days of the week. */
export function RoutineBoard({ actions, flagged, found, onShare, check, focus }: Props) {
  const spot = focusedGroup(check, focus)
  // Opened from a warning: start on its first session. Fixed on the first answer that names one
  // (the check may answer after the tab opens), so later edits never move the view on their own.
  const spotSession = spotSessions(spot)[0] ?? null
  const [arrival, setArrival] = useState<Session | null>(spotSession)
  if (arrival === null && spotSession !== null) setArrival(spotSession)
  const [chosen, setChosen] = useState<Session | null>(null)
  const session = chosen ?? arrival ?? 'AM'
  // After the first switch, the newly chosen session's panel fades in (ANIMATION.md 5.2).
  const switched = chosen !== null
  const chooseSession = (s: Session) => setChosen(s)
  // A step's chip names an ingredient once the check has answered for it: explain such chips once.
  const scheduled = new Set(actions.routine.entries.map((e) => e.productKey))
  const named = actions.routine.products.some(
    (p) => scheduled.has(p.key) && p.groups.length > 0 && (found.get(p.key)?.ingredients.length ?? 0) > 0,
  )
  const count = (s: Session) => sessionEntries(actions.routine, s).length
  return (
    <section aria-labelledby="schedule-title">
      <header className="motion-enter flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="max-w-2xl">
          <h1 id="schedule-title" className="text-3xl lg:text-4xl">
            Lịch tuần
          </h1>
          <p className="mt-2 text-ink-soft">
            Thứ tự từ trên xuống là thứ tự các bước. Bấm vào thứ trong tuần để bật/tắt ngày dùng.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <SessionSwitch session={session} onChange={chooseSession} count={count} />
          <button onClick={onShare} className={btn}>
            <Glyph name="share" className="size-4" />
            Lưu & chia sẻ
          </button>
        </div>
      </header>
      {named && <p className="motion-enter mt-3 max-w-3xl text-xs leading-relaxed text-ink-mute">{LABEL_CHIP_NOTE}</p>}

      {focus && <FocusBanner spot={spot} check={check} session={session} onSession={chooseSession} />}

      <WeekOverview actions={actions} check={check} session={session} onSession={chooseSession} spot={spot} />

      <div
        className="motion-enter mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18.75rem] lg:gap-8"
        style={stagger(2)}
      >
        <SessionPanel
          key={session}
          session={session}
          actions={actions}
          flagged={flagged}
          found={found}
          className={switched ? 'motion-tab' : ''}
          spot={spot}
          scrollToSpot={!switched}
        />
        <aside className="flex flex-col gap-4">
          <WarningsSummary check={check} />
          <AddToSession actions={actions} session={session} />
        </aside>
      </div>
    </section>
  )
}

/** Morning or evening, with the number of steps in each. */
export function SessionSwitch({
  session,
  onChange,
  count,
}: {
  session: Session
  onChange: (s: Session) => void
  count?: (s: Session) => number
}) {
  return (
    // A soft pill track; the chosen session takes its own tone (dawn white / dusk indigo) instead
    // of the heavy primary fill, and the step count sits in a small chip.
    <div
      className="inline-grid min-w-0 flex-1 auto-cols-fr grid-flow-col gap-1 rounded-full bg-wash p-1 sm:flex-none"
      role="group"
      aria-label="Chọn buổi"
    >
      {(['AM', 'PM'] as const).map((s) => {
        const on = session === s
        const tone =
          s === 'AM'
            ? on
              ? 'bg-surface text-dawn-ink shadow-[0_1px_3px_rgb(0_0_0/0.08)]'
              : 'text-ink-soft hover:text-ink'
            : on
              ? 'bg-dusk text-on-dusk shadow-[0_1px_3px_rgb(0_0_0/0.12)]'
              : 'text-ink-soft hover:text-ink'
        const chip = on ? (s === 'AM' ? 'bg-dawn text-dawn-ink' : 'bg-dusk-raised text-on-dusk') : 'bg-surface text-ink-mute'
        return (
          <button
            key={s}
            aria-pressed={on}
            onClick={() => onChange(s)}
            className={`motion-press inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors sm:px-5 ${tone}`}
          >
            {s === 'AM' ? (
              <SunIcon className={`size-[1.125rem] ${on ? '' : 'opacity-70'}`} />
            ) : (
              <MoonIcon className={`size-[1.125rem] ${on ? 'text-thistle' : 'opacity-70'}`} />
            )}
            Buổi {SESSION_LABELS[s].toLowerCase()}
            {count && (
              <span className={`min-w-5 rounded-full px-1.5 text-center text-xs leading-5 tabular-nums ${chip}`}>
                <span className="sr-only">, </span>
                {count(s)}
                <span className="sr-only"> bước</span>
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Phones: the week at a glance, steps per day and session, "!" where a combination warning of
 * severity avoid / caution applies (from the check's own days and sessions); info / safe cards
 * (myths, info duplicates) get no mark. A cell opens that session.
 */
function WeekOverview({
  actions,
  check,
  session,
  onSession,
  spot,
}: {
  actions: RoutineActions
  check: CheckState
  session: Session
  onSession: (s: Session) => void
  spot: WarningGroup | null
}) {
  const warnings = (currentResult(check)?.warnings ?? []).filter(isCombinationAlert)
  const applies = (list: Warning[], day: number, s: Session) =>
    list.some((w) => w.occurrences.some((o) => o.day === day && (o.session === s || o.session === null)))
  const warned = (day: number, s: Session) => applies(warnings, day, s)
  const spotted = (day: number, s: Session) => spot !== null && applies(spot.warnings, day, s)
  return (
    <section aria-label="Cả tuần" className="motion-enter mt-5 rounded-md bg-surface p-2 lg:hidden" style={stagger(1)}>
      <div className="grid grid-cols-[2.75rem_repeat(7,minmax(0,1fr))] items-center gap-1">
        <span />
        {DAY_LABELS.map((d) => (
          <span key={d} className="text-center text-xs font-semibold">
            {d}
          </span>
        ))}
        {(['AM', 'PM'] as const).map((s) => (
          <WeekRow
            key={s}
            s={s}
            actions={actions}
            warned={warned}
            spotted={spotted}
            selected={session === s}
            onSession={onSession}
          />
        ))}
      </div>
      <p className="mx-1 mt-2 text-xs text-ink-mute">Số là số bước. Dấu ! là buổi có kết hợp nên tránh hoặc cần thận trọng.</p>
    </section>
  )
}

function WeekRow({
  s,
  actions,
  warned,
  spotted,
  selected,
  onSession,
}: {
  s: Session
  actions: RoutineActions
  warned: (day: number, s: Session) => boolean
  spotted: (day: number, s: Session) => boolean
  selected: boolean
  onSession: (s: Session) => void
}) {
  const entries = sessionEntries(actions.routine, s)
  const label = SESSION_LABELS[s]
  return (
    <>
      <span className="text-xs text-ink-mute">{label}</span>
      {ALL_DAYS.map((day) => {
        const n = entries.filter((e) => e.days.includes(day)).length
        const flag = n > 0 && warned(day, s)
        const lifted = n > 0 && spotted(day, s)
        const tone =
          n === 0
            ? 'border border-dashed border-line bg-surface font-normal text-ink-mute'
            : s === 'AM'
              ? 'bg-petal text-dawn-ink'
              : 'bg-dusk text-on-dusk'
        return (
          <button
            key={day}
            onClick={() => onSession(s)}
            aria-label={`${DAY_NAMES[day]}, buổi ${label.toLowerCase()}: ${n} bước${flag ? ', có kết hợp nên tránh hoặc cần thận trọng' : ''}`}
            className={`h-11 rounded-md text-xs font-semibold tabular-nums ${tone} ${selected ? 'ring-2 ring-primary ring-offset-1 ring-offset-surface' : ''} ${lifted ? 'motion-spotlight' : ''}`}
          >
            {n}
            {flag && ' !'}
          </button>
        )
      })}
    </>
  )
}

/** The combination warnings, counted, with the way to the check tab. */
function WarningsSummary({ check }: { check: CheckState }) {
  const result = currentResult(check)
  if (!result) return null
  const alert = result.warnings.some(isCombinationAlert)
  return (
    <a
      href={href({ page: 'routine', tab: 'check' })}
      className="relative flex flex-col gap-1.5 overflow-hidden rounded-md bg-surface py-4 pr-5 pl-6 text-ink hover:bg-surface/70"
    >
      {alert && (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-caution" />
      )}
      {result.warnings.length > 0 ? (
        <SeverityCounts warnings={result.warnings} />
      ) : (
        <span className="text-sm text-ink-soft">Chưa có cảnh báo, không có nghĩa là chắc chắn an toàn</span>
      )}
      <span className="text-sm font-semibold text-primary">Xem trong Kiểm tra ›</span>
    </a>
  )
}

/**
 * Above the week when it was opened from a warning card: which warning the lifted steps belong
 * to, its sessions, and the way back. Says so when the latest check no longer has that warning.
 */
function FocusBanner({
  spot,
  check,
  session,
  onSession,
}: {
  spot: WarningGroup | null
  check: CheckState
  session: Session
  onSession: (s: Session) => void
}) {
  const result = currentResult(check)
  if (!result) return null
  const clear = (
    <a href={href({ page: 'routine', tab: 'week' })} className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-soft hover:text-ink">
      Bỏ đánh dấu
    </a>
  )
  if (!spot) {
    return (
      <div className="motion-tab mt-5 flex max-w-3xl flex-wrap items-center justify-between gap-x-4 rounded-md bg-surface px-5 py-3">
        <p className="text-sm text-ink-soft">Kết quả kiểm tra mới không còn cảnh báo này trong lịch dùng.</p>
        <span className="flex gap-4">
          <a href={href({ page: 'routine', tab: 'check' })} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">
            Xem Kiểm tra ›
          </a>
          {clear}
        </span>
      </div>
    )
  }
  const sessions = spotSessions(spot)
  return (
    <div className="motion-tab relative mt-5 max-w-3xl overflow-hidden rounded-md bg-surface py-3 pr-5 pl-6">
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${SEVERITY[spot.rule.severity].bar}`} />
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={spot.rule.severity} />
        <span className="text-xs text-ink-mute">{KIND_LABELS[spot.rule.kind]}</span>
      </div>
      <p className="mt-1.5 leading-snug font-semibold text-pretty">{spot.rule.title_vi}</p>
      <p className="mt-1 text-sm text-ink-soft">
        Các bước nổi lên là sản phẩm của cảnh báo này; ngày có quầng hồng là ngày cảnh báo áp dụng.
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-4">
        {sessions.length > 1 &&
          sessions.map((s) => (
            <button
              key={s}
              onClick={() => onSession(s)}
              aria-pressed={session === s}
              className={`inline-flex min-h-11 items-center text-sm font-semibold ${session === s ? 'text-ink' : 'text-primary'}`}
            >
              Buổi {SESSION_LABELS[s].toLowerCase()}
            </button>
          ))}
        <a
          href={href({ page: 'routine', tab: 'check', focus: spot.rule.key })}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary"
        >
          Xem giải thích ›
        </a>
        {clear}
      </div>
    </div>
  )
}

/** Shelf products not yet in this session, one tap to add them as the last step. */
function AddToSession({ actions, session }: { actions: RoutineActions; session: Session }) {
  const inSession = new Set(sessionEntries(actions.routine, session).map((e) => e.productKey))
  const products = actions.routine.products.filter((p) => !inSession.has(p.key))
  const label = SESSION_LABELS[session].toLowerCase()
  return (
    <section aria-labelledby="add-to-session" className="rounded-md bg-surface p-5">
      <h2 id="add-to-session" className="font-sans text-sm font-semibold">
        Thêm vào buổi {label}
      </h2>
      {products.length === 0 ? (
        <p className="mt-1 text-sm text-ink-mute">
          {actions.routine.products.length === 0
            ? 'Tủ đồ chưa có sản phẩm nào.'
            : `Mọi sản phẩm trong tủ đã có trong buổi ${label}.`}
        </p>
      ) : (
        <ul className="mt-1 divide-y divide-line">
          {products.map((p) => (
            <li key={p.key} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-ink-mute">{p.brand ?? 'Tự nhập bảng thành phần'}</span>
                <span className="block truncate text-sm font-semibold" title={p.name}>
                  {p.name}
                </span>
              </span>
              <button
                onClick={() => actions.addEntry(p.key, session)}
                aria-label={`Thêm “${p.name}” vào buổi ${label}`}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-wash text-primary hover:bg-wash-strong md:size-9"
              >
                <Glyph name="plus" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <a
        href={href({ page: 'routine', tab: 'shelf' })}
        className="mt-1 inline-flex min-h-11 md:min-h-10 items-center text-sm font-semibold text-primary"
      >
        Mở tủ đồ ›
      </a>
    </section>
  )
}

/** A session panel: the gradient, the "Buổi sáng" tag, a caption, then the steps. */
export function SessionShell({
  session,
  caption,
  children,
  className = '',
  style,
}: {
  session: Session
  caption?: ReactNode
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const tone = TONE[session]
  return (
    <section aria-label={`Buổi ${SESSION_LABELS[session].toLowerCase()}`} className={`rounded-lg p-4 lg:p-5 ${tone.panel} ${className}`} style={style}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${tone.tag}`}>
          {session === 'AM' ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
          Buổi {SESSION_LABELS[session].toLowerCase()}
        </span>
        {caption && <span className={`text-xs ${tone.mute}`}>{caption}</span>}
      </div>
      {children}
    </section>
  )
}

function SessionPanel({
  session,
  actions,
  flagged,
  found,
  className,
  spot,
  scrollToSpot,
}: Omit<Props, 'onShare' | 'check' | 'focus'> & {
  session: Session
  className: string
  /** The focused warning: its steps in this session are lifted and their days ringed. */
  spot: WarningGroup | null
  /** Bring the first lifted step into view (on arrival, not after the user switches sessions). */
  scrollToSpot: boolean
}) {
  const entries = sessionEntries(actions.routine, session)
  const firstSpot = useRef<HTMLLIElement>(null)
  const scrolled = useRef(false)
  const firstSpotIndex = entries.findIndex((e) => spotDays(spot, e).length > 0)
  useEffect(() => {
    if (!scrollToSpot || scrolled.current || firstSpotIndex < 0) return
    scrolled.current = true
    // Instant, not smooth (ANIMATION.md 7): the lift itself shows where to look.
    firstSpot.current?.scrollIntoView({ block: 'center' })
  }, [scrollToSpot, firstSpotIndex])
  // Steps already there when the panel mounted; a step added later rises in (ANIMATION.md 5.6).
  const [initial] = useState(() => new Set(entries.map((e) => e.id)))
  const products = new Map(actions.routine.products.map((p) => [p.key, p]))
  const tone = TONE[session]
  return (
    <SessionShell
      session={session}
      caption={entries.length > 0 ? `${entries.length} bước` : undefined}
      className={className}
    >
      {entries.length === 0 ? (
        <p className={`px-1 pt-3 pb-2 text-sm ${tone.mute}`}>
          Chưa có bước nào. Thêm sản phẩm ở mục “Thêm vào buổi {SESSION_LABELS[session].toLowerCase()}”.
        </p>
      ) : (
        <ol className={`mt-3 ${tone.list}`}>
          {entries.map((entry, i) => {
            const product = products.get(entry.productKey)
            return product ? (
              <EntryRow
                key={entry.id}
                rowRef={i === firstSpotIndex ? firstSpot : undefined}
                spotDays={spotDays(spot, entry)}
                entry={entry}
                step={i + 1}
                last={i === entries.length - 1}
                product={product}
                severity={flagged.get(product.key)}
                found={found.get(product.key)}
                actions={actions}
                tone={tone}
                night={session === 'PM'}
                fresh={!initial.has(entry.id)}
              />
            ) : null
          })}
        </ol>
      )}
    </SessionShell>
  )
}

type EntryProps = {
  entry: Entry
  step: number
  last: boolean
  product: MyProduct
  severity: Severity | undefined
  found: LabelGroups | undefined
  actions: RoutineActions
  tone: (typeof TONE)['AM']
  night: boolean
  /** Added after the panel mounted. */
  fresh: boolean
  /** Days of this step that the focused warning names; empty when the step is not part of it. */
  spotDays: number[]
  rowRef?: Ref<HTMLLIElement>
}

/**
 * A step: the product, then its week as round day buttons. Every row's week starts at the same
 * place, so reading one column top to bottom gives what is used that day.
 */
function EntryRow({ entry, step, last, product, severity, found, actions, tone, night, fresh, spotDays, rowRef }: EntryProps) {
  const spotted = spotDays.length > 0
  // 44px on phones (fingers), 36px from md.
  const iconButton = `inline-flex size-11 items-center justify-center rounded-md disabled:opacity-25 disabled:hover:bg-transparent md:size-9 ${tone.button}`
  const session = `buổi ${SESSION_LABELS[entry.session].toLowerCase()}`
  return (
    <li
      ref={rowRef}
      className={`${fresh ? 'motion-item ' : ''}${spotted ? `motion-spotlight ${night ? '' : 'spotlight-wide '}` : ''}grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3 py-3.5 xl:grid-cols-[1.5rem_minmax(0,1fr)_auto] xl:items-center ${tone.row}`}
    >
      {spotted && (
        <span className="sr-only">
          Bước thuộc cảnh báo đang xem, vào {spotDays.map((d) => DAY_NAMES[d]).join(', ')}.
        </span>
      )}
      <span
        className={`mt-0.5 flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums xl:mt-0 ${tone.step}`}
      >
        {step}
      </span>
      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <span className={`block text-xs ${tone.mute}`}>{product.brand ?? 'Tự nhập bảng thành phần'}</span>
            <p className="leading-snug font-semibold text-pretty">{product.name}</p>
          </div>
          <div className="-my-1 -mr-1 flex shrink-0">
            <button
              className={iconButton}
              disabled={step === 1}
              onClick={() => actions.moveEntry(entry.id, -1)}
              aria-label={`Đưa “${product.name}” lên một bước trong ${session}`}
              title="Lên một bước"
            >
              <Glyph name="up" className="size-4" />
            </button>
            <button
              className={iconButton}
              disabled={last}
              onClick={() => actions.moveEntry(entry.id, 1)}
              aria-label={`Đưa “${product.name}” xuống một bước trong ${session}`}
              title="Xuống một bước"
            >
              <Glyph name="down" className="size-4" />
            </button>
            <button
              className={`inline-flex size-11 items-center justify-center rounded-md md:size-9 ${tone.remove}`}
              onClick={() => actions.removeEntry(entry.id)}
              aria-label={`Bỏ bước ${step} (“${product.name}”) khỏi ${session}`}
              title="Bỏ bước này"
            >
              <Glyph name="close" className="size-4" />
            </button>
          </div>
        </div>
        {(product.groups.length > 0 || severity) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {severity && <SeverityBadge severity={severity} />}
            <GroupChips codes={product.groups} tone={night ? 'night' : 'day'} found={found} />
          </div>
        )}
      </div>
      <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 xl:col-span-1">
        <div
          className="grid w-full grid-cols-7 gap-1 md:flex md:w-auto"
          role="group"
          aria-label={`Ngày dùng “${product.name}”, ${session}`}
        >
          {ALL_DAYS.map((day) => {
            const on = entry.days.includes(day)
            const ringed = spotDays.includes(day)
            return (
              <button
                key={day}
                onClick={() => actions.toggleDay(entry.id, day)}
                aria-pressed={on}
                aria-label={`${DAY_LABELS[day]}, ${DAY_NAMES[day]}`}
                className={`motion-press relative h-11 rounded-md border text-xs font-semibold tabular-nums md:size-9 md:shrink-0 md:rounded-full ${on ? tone.dayOn : tone.dayOff} ${ringed ? 'spotlight-day' : ''}`}
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
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs xl:basis-full xl:justify-end">
          {/* toCheckRequest leaves out a step with no days, so say so. */}
          {entry.days.length === 0 && (
            <span className={tone.warn}>Chưa chọn ngày nào, nên bước này chưa được kiểm tra</span>
          )}
          {entry.days.length < 7 && (
            <button
              onClick={() => actions.setDays(entry.id, [...ALL_DAYS])}
              aria-label={`Cả tuần cho “${product.name}”, ${session}`}
              className={`min-h-11 underline-offset-2 hover:underline md:min-h-8 ${tone.mute}`}
            >
              Cả tuần
            </button>
          )}
        </div>
      </div>
    </li>
  )
}
