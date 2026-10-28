import type { Session, Severity } from '../api'
import { ALL_DAYS, DAY_LABELS, SESSION_LABELS } from '../labels'
import { sessionEntries, type Entry, type MyProduct, type RoutineActions } from '../routine'
import { GroupChips } from './GroupChips'
import { Glyph, MoonIcon, SeverityBadge, SunIcon } from './Icons'

type Props = {
  actions: RoutineActions
  /** Opens the "save and share" dialog. */
  onShare: () => void
  /** Most severe warning each product key is part of. */
  flagged: Map<string, Severity>
}

export function RoutineBoard({ actions, flagged, onShare }: Props) {
  return (
    <section aria-labelledby="schedule-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="schedule-title" className="text-xl font-bold">
          Lịch dùng
        </h2>
        <button
          onClick={onShare}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full py-1.5 pr-3.5 pl-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface"
        >
          <Glyph name="share" className="size-4" />
          Lưu & chia sẻ
        </button>
      </div>
      <p className="mt-1 text-sm text-ink-mute">
        Thứ tự từ trên xuống là thứ tự các bước. Bấm vào thứ trong tuần để bật/tắt ngày dùng.
      </p>
      <div className="mt-4 space-y-4">
        {(['AM', 'PM'] as const).map((session) => (
          <SessionPanel key={session} session={session} actions={actions} flagged={flagged} />
        ))}
      </div>
    </section>
  )
}

// Each session has its own palette: the morning panel is daylight, the evening panel is night.
const TONE = {
  AM: {
    panel: 'bg-surface text-ink ring-1 ring-line',
    mute: 'text-ink-mute',
    line: 'border-line',
    step: 'bg-paper text-ink-soft',
    button: 'text-ink-mute hover:bg-paper hover:text-ink',
    dayOn: 'bg-ink text-white',
    dayOff: 'bg-paper text-ink-mute hover:bg-line',
    warn: 'text-caution-ink',
  },
  PM: {
    panel: 'bg-night text-night-text',
    mute: 'text-night-mute',
    line: 'border-night-line',
    step: 'bg-night-raised text-night-text',
    button: 'text-night-mute hover:bg-night-raised hover:text-white',
    dayOn: 'bg-moon text-night',
    dayOff: 'bg-night-raised text-night-mute hover:bg-night-line',
    warn: 'text-moon',
  },
}

function SessionPanel({ session, actions, flagged }: Omit<Props, 'onShare'> & { session: Session }) {
  const entries = sessionEntries(actions.routine, session)
  const products = new Map(actions.routine.products.map((p) => [p.key, p]))
  const tone = TONE[session]
  return (
    <div className={`rounded-2xl px-4 pt-4 pb-2 ${tone.panel}`}>
      <h3 className="flex items-center gap-2">
        {session === 'AM' ? <SunIcon className="size-6" /> : <MoonIcon className="size-6" />}
        <span className="text-lg font-semibold">
          Buổi {SESSION_LABELS[session].toLowerCase()}
        </span>
        {entries.length > 0 && <span className={`text-sm ${tone.mute}`}>{entries.length} bước</span>}
      </h3>
      {entries.length === 0 ? (
        <p className={`pt-2 pb-3 text-sm ${tone.mute}`}>
          Chưa có bước nào. Bấm “+ {SESSION_LABELS[session]}” ở sản phẩm để thêm.
        </p>
      ) : (
        <ol className="mt-2">
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
                actions={actions}
                tone={tone}
                night={session === 'PM'}
              />
            ) : null
          })}
        </ol>
      )}
    </div>
  )
}

type EntryProps = {
  entry: Entry
  step: number
  last: boolean
  product: MyProduct
  severity: Severity | undefined
  actions: RoutineActions
  tone: (typeof TONE)['AM']
  night: boolean
}

/**
 * A step: the product, then its week as the compartments of a pill box. Every row's week starts
 * at the same place, so reading one column top to bottom gives what is used that day.
 */
function EntryRow({ entry, step, last, product, severity, actions, tone, night }: EntryProps) {
  const iconButton = `rounded-full p-1 disabled:opacity-25 disabled:hover:bg-transparent ${tone.button}`
  return (
    <li className={`grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2.5 border-t py-3 first:border-t-0 ${tone.line}`}>
      <span
        className={`mt-0.5 flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${tone.step}`}
      >
        {step}
      </span>
      <div className="min-w-0">
        {/* The buttons share the brand's line so the product name gets the full width. */}
        <div className="flex items-start gap-2">
          <span className={`min-w-0 flex-1 pt-1 text-xs ${tone.mute}`}>
            {product.brand ?? 'Tự nhập bảng thành phần'}
          </span>
          <div className="-my-0.5 flex shrink-0">
            <button
              className={iconButton}
              disabled={step === 1}
              onClick={() => actions.moveEntry(entry.id, -1)}
              aria-label="Lên một bước"
              title="Lên một bước"
            >
              <Glyph name="up" className="size-4" />
            </button>
            <button
              className={iconButton}
              disabled={last}
              onClick={() => actions.moveEntry(entry.id, 1)}
              aria-label="Xuống một bước"
              title="Xuống một bước"
            >
              <Glyph name="down" className="size-4" />
            </button>
            <button
              className={`rounded-full p-1 ${night ? 'text-night-mute hover:bg-avoid hover:text-white' : 'text-ink-mute hover:bg-avoid-soft hover:text-avoid-ink'}`}
              onClick={() => actions.removeEntry(entry.id)}
              aria-label={`Bỏ bước ${step}`}
              title="Bỏ bước này"
            >
              <Glyph name="close" className="size-4" />
            </button>
          </div>
        </div>
        <p className="leading-snug font-medium text-pretty">{product.name}</p>
        {(product.groups.length > 0 || severity) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {severity && <SeverityBadge severity={severity} />}
            <GroupChips codes={product.groups} tone={night ? 'night' : 'day'} />
          </div>
        )}
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="grid grid-cols-[repeat(7,2.25rem)] gap-1" role="group" aria-label="Ngày dùng">
          {ALL_DAYS.map((day) => {
            const on = entry.days.includes(day)
            return (
              <button
                key={day}
                onClick={() => actions.toggleDay(entry.id, day)}
                aria-pressed={on}
                className={`h-8 rounded-lg text-xs font-semibold transition-colors ${on ? tone.dayOn : tone.dayOff}`}
              >
                {DAY_LABELS[day]}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
          {/* toCheckRequest leaves out a step with no days, so say so. */}
          {entry.days.length === 0 && (
            <span className={tone.warn}>Chưa chọn ngày nào, nên bước này chưa được kiểm tra</span>
          )}
          {entry.days.length < 7 && (
            <button
              onClick={() => actions.setDays(entry.id, [...ALL_DAYS])}
              className={`underline-offset-2 hover:underline ${tone.mute}`}
            >
              Cả tuần
            </button>
          )}
        </div>
      </div>
    </li>
  )
}
