import { useState, type CSSProperties, type ReactNode } from 'react'
import type { Session, Severity } from '../api'
import { ALL_DAYS, DAY_LABELS, DAY_NAMES, SESSION_LABELS } from '../labels'
import { href } from '../router'
import {
  currentResult,
  isUsageNote,
  sessionEntries,
  type CheckState,
  type Entry,
  type LabelGroups,
  type MyProduct,
  type RoutineActions,
} from '../routine'
import { GroupChips, LABEL_CHIP_NOTE } from './GroupChips'
import { Glyph, MoonIcon, SeverityBadge, SunIcon } from './Icons'
import { stagger } from './motion'
import { TONE } from './sessionTone'
import { btn, segBox, segOption } from './ui'
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
}

/** "Lịch tuần": one session at a time, each step with its days of the week. */
export function RoutineBoard({ actions, flagged, found, onShare, check }: Props) {
  const [session, setSession] = useState<Session>('AM')
  // After the first switch, the newly chosen session's panel fades in (ANIMATION.md 5.2).
  const [switched, setSwitched] = useState(false)
  const chooseSession = (s: Session) => {
    setSwitched(true)
    setSession(s)
  }
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

      <WeekOverview actions={actions} check={check} session={session} onSession={chooseSession} />

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
    <div className={`${segBox} min-w-0 flex-1 sm:flex-none`} role="group" aria-label="Chọn buổi">
      {(['AM', 'PM'] as const).map((s) => (
        <button key={s} aria-pressed={session === s} onClick={() => onChange(s)} className={`${segOption(session === s)} sm:px-5`}>
          {s === 'AM' ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
          Buổi {SESSION_LABELS[s].toLowerCase()}
          {count && ` · ${count(s)}`}
        </button>
      ))}
    </div>
  )
}

/**
 * Phones: the week at a glance, steps per day and session, "!" where a combination warning
 * applies (from the check's own days and sessions). A cell opens that session.
 */
function WeekOverview({
  actions,
  check,
  session,
  onSession,
}: {
  actions: RoutineActions
  check: CheckState
  session: Session
  onSession: (s: Session) => void
}) {
  const warnings = (currentResult(check)?.warnings ?? []).filter((w) => !isUsageNote(w))
  const warned = (day: number, s: Session) =>
    warnings.some((w) => w.occurrences.some((o) => o.day === day && (o.session === s || o.session === null)))
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
          <WeekRow key={s} s={s} actions={actions} warned={warned} selected={session === s} onSession={onSession} />
        ))}
      </div>
      <p className="mx-1 mt-2 text-xs text-ink-mute">Số là số bước. Dấu ! là buổi có cảnh báo kết hợp.</p>
    </section>
  )
}

function WeekRow({
  s,
  actions,
  warned,
  selected,
  onSession,
}: {
  s: Session
  actions: RoutineActions
  warned: (day: number, s: Session) => boolean
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
            aria-label={`${DAY_NAMES[day]}, buổi ${label.toLowerCase()}: ${n} bước${flag ? ', có cảnh báo' : ''}`}
            className={`h-11 rounded-md text-xs font-semibold tabular-nums ${tone} ${selected ? 'ring-2 ring-primary ring-offset-1 ring-offset-surface' : ''}`}
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
  const combinations = result.warnings.filter((w) => !isUsageNote(w))
  return (
    <a
      href={href({ page: 'routine', tab: 'check' })}
      className="relative flex flex-col gap-1.5 overflow-hidden rounded-md bg-surface py-4 pr-5 pl-6 text-ink hover:bg-surface/70"
    >
      {combinations.length > 0 && (
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
}: Omit<Props, 'onShare' | 'check'> & { session: Session; className: string }) {
  const entries = sessionEntries(actions.routine, session)
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
}

/**
 * A step: the product, then its week as round day buttons. Every row's week starts at the same
 * place, so reading one column top to bottom gives what is used that day.
 */
function EntryRow({ entry, step, last, product, severity, found, actions, tone, night, fresh }: EntryProps) {
  // 44px on phones (fingers), 36px from md.
  const iconButton = `inline-flex size-11 items-center justify-center rounded-md disabled:opacity-25 disabled:hover:bg-transparent md:size-9 ${tone.button}`
  const session = `buổi ${SESSION_LABELS[entry.session].toLowerCase()}`
  return (
    <li className={`${fresh ? 'motion-item ' : ''}grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3 py-3.5 xl:grid-cols-[1.5rem_minmax(0,1fr)_auto] xl:items-center ${tone.row}`}>
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
            return (
              <button
                key={day}
                onClick={() => actions.toggleDay(entry.id, day)}
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
