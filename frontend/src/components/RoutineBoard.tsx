import type { Session, Severity } from '../api'
import { ALL_DAYS, DAY_LABELS, SESSION_LABELS, SEVERITY } from '../labels'
import { sessionEntries, type Entry, type MyProduct, type RoutineActions } from '../routine'
import { GroupChips } from './GroupChips'

type Props = {
  actions: RoutineActions
  /** Most severe warning each product key is part of. */
  flagged: Map<string, Severity>
}

export function RoutineBoard({ actions, flagged }: Props) {
  return (
    <section>
      <h2 className="font-semibold text-slate-900">Lịch dùng</h2>
      <p className="text-sm text-slate-500">
        Thứ tự từ trên xuống là thứ tự các bước. Bấm vào thứ trong tuần để bật/tắt ngày dùng.
      </p>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {(['AM', 'PM'] as const).map((session) => (
          <SessionColumn key={session} session={session} actions={actions} flagged={flagged} />
        ))}
      </div>
    </section>
  )
}

function SessionColumn({ session, actions, flagged }: Props & { session: Session }) {
  const entries = sessionEntries(actions.routine, session)
  const products = new Map(actions.routine.products.map((p) => [p.key, p]))
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h3 className="font-semibold text-slate-800">
        {session === 'AM' ? '☀️' : '🌙'} Buổi {SESSION_LABELS[session].toLowerCase()}
      </h3>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          Chưa có bước nào. Bấm “+ {SESSION_LABELS[session]}” ở sản phẩm để thêm.
        </p>
      ) : (
        <ol className="mt-2 space-y-2">
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
}

function EntryRow({ entry, step, last, product, severity, actions }: EntryProps) {
  const iconButton = 'rounded px-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30'
  return (
    <li className="rounded-md border border-slate-200 p-2">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">
            {product.name}
            {severity && (
              <span
                className={`ml-2 rounded px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap ${SEVERITY[severity].badge}`}
              >
                {SEVERITY[severity].label}
              </span>
            )}
          </p>
          <div className="mt-1">
            <GroupChips codes={product.groups} />
          </div>
        </div>
        <div className="flex shrink-0 text-sm">
          <button
            className={iconButton}
            disabled={step === 1}
            onClick={() => actions.moveEntry(entry.id, -1)}
            aria-label="Lên một bước"
          >
            ↑
          </button>
          <button
            className={iconButton}
            disabled={last}
            onClick={() => actions.moveEntry(entry.id, 1)}
            aria-label="Xuống một bước"
          >
            ↓
          </button>
          <button
            className="rounded px-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700"
            onClick={() => actions.removeEntry(entry.id)}
            aria-label="Bỏ bước này"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {ALL_DAYS.map((day) => {
          const on = entry.days.includes(day)
          return (
            <button
              key={day}
              onClick={() => actions.toggleDay(entry.id, day)}
              aria-pressed={on}
              className={`w-8 rounded py-0.5 text-xs font-medium ${on ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-500'}`}
            >
              {DAY_LABELS[day]}
            </button>
          )
        })}
        {entry.days.length < 7 && (
          <button
            onClick={() => actions.setDays(entry.id, [...ALL_DAYS])}
            className="ml-1 text-xs text-slate-500 hover:text-rose-700 hover:underline"
          >
            Cả tuần
          </button>
        )}
        {entry.days.length === 0 && <span className="text-xs text-amber-700">Chưa chọn ngày nào</span>}
      </div>
    </li>
  )
}
