import { useState } from 'react'
import type { Session, Severity, Warning } from '../api'
import { DAY_NAMES, KIND_LABELS, SESSION_LABELS, SEVERITY, todayIndex } from '../labels'
import { href } from '../router'
import {
  currentResult,
  dataGaps,
  groupByRule,
  isUsageNote,
  sessionEntries,
  type CheckState,
  type RoutineActions,
  type WarningGroup,
} from '../routine'
import { SeverityBadge } from './Icons'
import { DataNote, Notice } from './Notice'
import { SessionShell, SessionSwitch } from './RoutineBoard'
import { TONE } from './sessionTone'
import { WarningPairs } from './WarningPairs'
import { stagger } from './motion'
import { btn, btnPrimary } from './ui'

type Props = { actions: RoutineActions; check: CheckState }

const SEVERITY_RANK = Object.keys(SEVERITY) as Severity[] // most severe first

/**
 * "Hôm nay": today's steps from the weekly schedule, and the warnings whose days, as the check
 * returned them, include today. Nothing here is inferred beyond those days and sessions.
 */
export function TodayPage({ actions, check }: Props) {
  // The day is read once per visit to the tab; a tab left open past midnight shows the day it opened.
  const [now] = useState(() => new Date())
  const today = todayIndex(now)
  // Morning panel first until early afternoon, then the evening one (phones show one at a time).
  const [session, setSession] = useState<Session>(now.getHours() < 14 ? 'AM' : 'PM')
  const date = now.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' })

  const result = currentResult(check)
  const todays = (result?.warnings ?? []).filter((w) => w.occurrences.some((o) => o.day === today))
  /**
   * Most severe combination warning of each product in one session today, to flag its step: only
   * occurrences today in that session, or with no session (a same-day rule).
   */
  const flaggedIn = (s: Session) => {
    const flagged = new Map<string, Severity>()
    for (const w of todays.filter((w) => !isUsageNote(w))) {
      if (!w.occurrences.some((o) => o.day === today && (o.session === s || o.session === null))) continue
      for (const key of w.product_keys) {
        const current = flagged.get(key)
        if (!current || SEVERITY_RANK.indexOf(w.rule.severity) < SEVERITY_RANK.indexOf(current)) {
          flagged.set(key, w.rule.severity)
        }
      }
    }
    return flagged
  }
  const stepsToday = (s: Session) => sessionEntries(actions.routine, s).filter((e) => e.days.includes(today))
  const empty = actions.routine.entries.length === 0
  const noStepsToday = stepsToday('AM').length === 0 && stepsToday('PM').length === 0
  // Today's products whose result may be missing warnings (the check tab says which and why).
  const usedToday = new Set([...stepsToday('AM'), ...stepsToday('PM')].map((e) => e.productKey))
  const gaps = dataGaps(result, actions.routine.products.filter((p) => usedToday.has(p.key)))
  const mayMiss = gaps.incomplete.length > 0 || gaps.misspelled.some((p) => usedToday.has(p.key))

  return (
    <section aria-labelledby="today-title">
      <header className="motion-enter flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-ink-mute">
            {DAY_NAMES[today]}, {date}
          </p>
          <h1 id="today-title" className="text-3xl lg:text-4xl">
            Hôm nay
          </h1>
        </div>
        {!empty && (
          <a href={href({ page: 'routine', tab: 'week' })} className={btn}>
            Sửa lịch tuần
          </a>
        )}
      </header>

      {empty ? (
        <div className="motion-enter mt-6 max-w-xl rounded-md bg-surface p-5" style={stagger(1)}>
          <p className="text-ink-soft">Lịch dùng chưa có bước nào. Thêm sản phẩm vào tủ đồ rồi xếp vào buổi sáng hoặc tối.</p>
          <a href={href({ page: 'routine', tab: 'shelf' })} className={`${btnPrimary} mt-4`}>
            Mở tủ đồ
          </a>
        </div>
      ) : (
        <>
          <div className="motion-enter mt-5 lg:hidden" style={stagger(1)}>
            <SessionSwitch session={session} onChange={setSession} count={(s) => stepsToday(s).length} />
          </div>
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:mt-6 lg:grid-cols-2">
            {(['AM', 'PM'] as const).map((s) => (
              <TodaySession
                key={s}
                session={s}
                actions={actions}
                steps={stepsToday(s)}
                flagged={flaggedIn(s)}
                className={s === session ? '' : 'hidden lg:block'}
                order={s === 'AM' ? 1 : 2}
              />
            ))}
          </div>
        </>
      )}

      <section aria-labelledby="today-warnings" className="motion-enter mt-8 max-w-3xl" style={stagger(3)}>
        <h2 id="today-warnings" className="text-xl">
          Cần lưu ý hôm nay
        </h2>
        <div className="mt-3 flex flex-col gap-2">
          {/* Nothing to check today: say so, so that the empty list does not read as "safe". */}
          {(empty || noStepsToday) && (
            <p className="text-sm text-ink-soft">
              Hôm nay chưa có bước nào trong lịch, nên chưa kiểm tra được kết hợp.
            </p>
          )}
          {check.kind === 'loading' && !result && !noStepsToday && <p className="motion-loading text-sm text-ink-mute">Đang kiểm tra…</p>}
          {check.kind === 'error' && (
            <p className="text-sm text-avoid-ink">
              Không kiểm tra được routine.{' '}
              <a href={href({ page: 'routine', tab: 'check' })} className="font-semibold underline underline-offset-2">
                Xem chi tiết
              </a>
            </p>
          )}
          {mayMiss && (
            <DataNote title="Có thể thiếu cảnh báo">
              Kết quả cho sản phẩm dùng hôm nay có thể chưa đầy đủ.{' '}
              <a
                href={href({ page: 'routine', tab: 'check' })}
                className="inline-flex min-h-11 items-center font-semibold text-primary"
              >
                Xem chi tiết ›
              </a>
            </DataNote>
          )}
          {/* Always with the result, also beside usage notes: no combination warning ≠ safe. */}
          {result?.notice_vi && <Notice>{result.notice_vi}</Notice>}
          {groupByRule(todays).map((g) => (
            <TodayWarning key={g.rule.key} group={g} today={today} actions={actions} />
          ))}
          {result && !result.notice_vi && result.warnings.length > 0 && todays.length === 0 && !noStepsToday && (
            <p className="text-sm text-ink-soft">Chưa có cảnh báo, không có nghĩa là chắc chắn an toàn.</p>
          )}
        </div>
      </section>
    </section>
  )
}

function TodaySession({
  session,
  actions,
  steps,
  flagged,
  className,
  order,
}: {
  /** Place in the first-visit rise of the tab. */
  order: number
  session: Session
  actions: RoutineActions
  steps: ReturnType<typeof sessionEntries>
  flagged: Map<string, Severity>
  className: string
}) {
  const tone = TONE[session]
  const products = new Map(actions.routine.products.map((p) => [p.key, p]))
  return (
    <SessionShell
      session={session}
      caption={steps.length > 0 ? `${steps.length} bước hôm nay` : undefined}
      className={`motion-enter ${className}`}
      style={stagger(order)}
    >
      {steps.length === 0 ? (
        <p className={`px-1 pt-3 pb-1 text-sm ${tone.mute}`}>
          Hôm nay không có bước nào buổi {SESSION_LABELS[session].toLowerCase()}.
        </p>
      ) : (
        <ol className={`mt-3 ${tone.list}`}>
          {steps.map((entry, i) => {
            const product = products.get(entry.productKey)
            if (!product) return null
            const severity = flagged.get(product.key)
            return (
              <li key={entry.id} className={`flex items-center gap-3 py-3 ${tone.row}`}>
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${tone.step}`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-xs ${tone.mute}`}>{product.brand ?? 'Tự nhập bảng thành phần'}</span>
                  <span className="block leading-snug font-semibold text-pretty">{product.name}</span>
                </span>
                {severity && <SeverityBadge severity={severity} />}
              </li>
            )
          })}
        </ol>
      )}
    </SessionShell>
  )
}

/** Today's sessions of one warning: "Buổi sáng và Buổi tối, hôm nay". */
function todayWhen(warning: Warning, today: number): string {
  const sessions = [...new Set(warning.occurrences.filter((o) => o.day === today).map((o) => o.session))]
  return sessions.includes(null)
    ? 'Trong ngày hôm nay'
    : sessions.map((s) => `Buổi ${SESSION_LABELS[s!].toLowerCase()}`).join(' và ') + ', hôm nay'
}

/** One rule that applies today: its own title, then each pair of products and today's sessions. */
function TodayWarning({ group, today, actions }: { group: WarningGroup; today: number; actions: RoutineActions }) {
  const names = new Map(actions.routine.products.map((p) => [p.key, p.name]))
  const warning = group.warnings[0]
  return (
    <article className="relative overflow-hidden rounded-md bg-surface py-4 pr-4 pl-6">
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${SEVERITY[warning.rule.severity].bar}`} />
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={warning.rule.severity} />
        <span className="text-xs text-ink-mute">{KIND_LABELS[warning.rule.kind]}</span>
      </div>
      <h3 className="mt-2 font-sans text-base leading-snug font-semibold text-pretty">{warning.rule.title_vi}</h3>
      <WarningPairs warnings={group.warnings} names={names} when={(w) => todayWhen(w, today)} />
      <a
        href={href({ page: 'routine', tab: 'check' })}
        className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
      >
        Xem giải thích và nguồn ›
      </a>
    </article>
  )
}
