import { useEffect, useId, useRef, useState } from 'react'
import { SUGGESTIONS_TRUNCATED_VI, type Severity, type Warning } from '../api'
import { KIND_LABELS, SCOPE_LABELS, SEVERITY, formatOccurrences } from '../labels'
import { href } from '../router'
import {
  checkError,
  currentResult,
  dataGaps,
  formatLabelLine,
  groupByRule,
  warningProducts,
  type CheckState,
  type LabelGroups,
  type MyProduct,
} from '../routine'
import { SeverityBadge } from './Icons'
import { DataNote, Notice } from './Notice'
import { spotClass, stagger, useSpotlight } from './motion'
import { RuleCard } from './RuleCard'

type Props = {
  state: CheckState
  products: MyProduct[]
  /**
   * Label lines behind each product's groups (product key), from the last check; left out where
   * the label lines are not shown (a blog post's routine).
   */
  found?: Map<string, LabelGroups>
  /**
   * The "Kiểm tra" tab: a page title, counts as tiles and, on wide screens, a list of the warnings
   * beside the cards. Without it, a section of another page (a blog post's routine).
   */
  page?: boolean
  /** What to say while there is nothing to check; the default asks for products in a session. */
  emptyText?: string
  /** A rule key from a link ("Xem giải thích và nguồn"): scroll to that card and lift it once. */
  focus?: string
}

const NONE = new Map<string, LabelGroups>()

export function WarningsPanel({
  state,
  products,
  found = NONE,
  page = false,
  emptyText = 'Thêm sản phẩm vào buổi sáng hoặc tối để SkinWise kiểm tra routine.',
  focus,
}: Props) {
  const idPrefix = useId()
  const names = new Map(products.map((p) => [p.key, p.name]))
  const result = currentResult(state)
  const { incomplete, misspelled } = dataGaps(result, products)
  const applications = new Map(result?.products.map((p) => [p.key, p.application]))
  // One card per rule; a rule raised for several pairs of products lists every pair inside it.
  const groups = groupByRule(result?.warnings ?? [])
  const focusIndex = focus ? groups.findIndex((g) => g.rule.key === focus) : -1
  // Once, when the card is there (the check may answer after the tab opens): bring it into view
  // and move focus to it, so a screen reader starts there too. Instant scroll (ANIMATION.md 7).
  const focused = useRef(false)
  useEffect(() => {
    if (focused.current || focusIndex < 0) return
    focused.current = true
    const card = document.getElementById(`${idPrefix}-${focusIndex}`)
    card?.scrollIntoView({ block: 'start' })
    card?.focus({ preventScroll: true })
  }, [focusIndex, idPrefix])
  // The card picked in the list beside the cards (wide screens); until then, the one a link chose.
  // Each pick is a new target, so picking the same card again lifts it again.
  const [picked, setPicked] = useState<{ key: string; n: number } | null>(null)
  const pickedIndex = picked ? groups.findIndex((g) => g.rule.key === picked.key) : -1
  const lit = pickedIndex >= 0 ? pickedIndex : focusIndex
  const target = picked && pickedIndex >= 0 ? `${picked.key}#${picked.n}` : focus && focusIndex >= 0 ? focus : null
  // Lit until the user's next click or key press (ANIMATION.md 5.9).
  const on = useSpotlight(target)
  const pick = (i: number) => {
    const card = document.getElementById(`${idPrefix}-${i}`)
    if (!card) return
    setPicked((p) => ({ key: groups[i].rule.key, n: (p?.n ?? 0) + 1 }))
    card.scrollIntoView({ block: 'start' })
    card.focus({ preventScroll: true })
  }

  return (
    <section aria-labelledby="results-title" id={page ? 'results' : undefined}>
      {/* Read out after each check. The panel itself is not a live region: a screen reader
          would read every card again on each change. */}
      <p role="status" className="sr-only">
        {announcement(state)}
      </p>
      {page ? (
        <header className="motion-enter flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs text-ink-mute">Cả tuần · cập nhật ngay khi bạn sửa lịch dùng</p>
            <h1 id="results-title" className="text-3xl lg:text-4xl">
              Kết quả kiểm tra
            </h1>
          </div>
          {state.kind === 'loading' && <span className="motion-loading text-xs text-ink-mute">Đang kiểm tra…</span>}
        </header>
      ) : (
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="results-title" className="text-xl">
            Kết quả kiểm tra
          </h2>
          {state.kind === 'loading' && <span className="text-xs text-ink-mute">Đang kiểm tra…</span>}
        </div>
      )}
      {result &&
        result.warnings.length > 0 &&
        (page ? <SeverityTiles warnings={result.warnings} /> : <SeverityCounts warnings={result.warnings} className="mt-2" />)}
      {/* The whole list is one block, warnings and notice_vi together: an "avoid" card never shows
          after an "info" card, and the "no warning ≠ safe" line never lags (ANIMATION.md 7). */}
      <div
        className={`${page ? 'motion-enter' : ''} ${
          page && result && result.warnings.length > 0
            ? 'mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]'
            : ''
        }`}
        style={page ? stagger(2) : undefined}
      >
      {page && result && result.warnings.length > 0 && (
        <nav aria-label="Danh sách cảnh báo" className="hidden lg:sticky lg:top-4 lg:block">
          <ul className="flex flex-col gap-1">
            {groups.map((g, i) => (
              <li key={g.rule.key}>
                <button
                  onClick={() => pick(i)}
                  aria-current={i === lit && on ? 'true' : undefined}
                  className={`flex w-full flex-col gap-1.5 rounded-md px-5 py-4 text-left hover:bg-surface ${i === lit && on ? 'bg-surface' : ''}`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={g.rule.severity} />
                    <span className="text-xs text-ink-mute">{KIND_LABELS[g.rule.kind]}</span>
                  </span>
                  <span className="leading-snug font-semibold">{g.rule.title_vi}</span>
                  <span className="text-xs text-ink-mute">
                    {g.warnings.length === 1
                      ? `${warningProducts(g.warnings[0], names)} · ${formatOccurrences(g.warnings[0].occurrences)}`
                      : `${g.warnings.length} cặp sản phẩm: ${g.productKeys.map((k) => names.get(k) ?? k).join(', ')}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <div className={page ? 'mt-6 space-y-4 lg:mt-0' : 'mt-4 space-y-3'}>
        {state.kind === 'empty' && (
          <Notice>{emptyText}</Notice>
        )}
        {state.kind === 'error' && (
          <div className="rounded-md bg-avoid-soft p-4 text-sm leading-relaxed text-avoid-ink">
            <p>{checkError(state.problem)}</p>
            <button
              onClick={state.retry}
              className="mt-2 min-h-11 rounded-full bg-surface px-4 font-semibold text-avoid-ink ring-1 ring-avoid/40 hover:bg-neutral"
            >
              Thử lại
            </button>
            {state.message && (
              <details className="mt-2 text-xs text-ink-mute">
                <summary className="cursor-pointer">Chi tiết kỹ thuật</summary>
                <p className="mt-1 break-words">{state.message}</p>
              </details>
            )}
          </div>
        )}
        {incomplete.length > 0 && (
          <DataNote title="Có thể thiếu cảnh báo">
            Bảng thành phần của {incomplete.map((p) => `“${p.name}”`).join(', ')} có thể chưa đầy đủ, nên kết quả dưới
            đây có thể thiếu cảnh báo.
          </DataNote>
        )}
        {misspelled.map((p) => (
          <DataNote
            key={p.key}
            title={p.possible_actives.length > 0 ? 'Có thể có hoạt chất bị gõ sai' : 'Chưa kiểm hết bảng thành phần'}
          >
            {p.possible_actives.length > 0 ? (
              <>
                “{names.get(p.key) ?? p.key}” có thành phần không nhận ra, có thể là hoạt chất bị gõ sai:{' '}
                <strong className="text-ink">{p.possible_actives.join(', ')}</strong>. SkinWise chưa kiểm tra các chất
                này; hãy sửa bảng thành phần nếu đúng là gõ sai.
                {p.suggestions_truncated && ` ${SUGGESTIONS_TRUNCATED_VI}`}
              </>
            ) : (
              `“${names.get(p.key) ?? p.key}”: ${SUGGESTIONS_TRUNCATED_VI}`
            )}
          </DataNote>
        ))}
        {result?.notice_vi && <Notice>{result.notice_vi}</Notice>}
        {groups.map((g, i) => {
          const usage = g.rule.kind === 'usage'
          const rinseOff = usage ? [] : g.productKeys.filter((k) => applications.get(k) === 'rinse_off')
          const single = g.warnings.length === 1 ? g.warnings[0] : null
          return (
            <RuleCard
              key={g.rule.key}
              id={`${idPrefix}-${i}`}
              rule={g.rule}
              className={spotClass(i === lit, on)}
              collapsible
              footer={
                page && (
                  <a
                    href={href({ page: 'routine', tab: 'week', focus: g.rule.key })}
                    className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
                  >
                    {usage ? 'Xem các bước trong lịch tuần ›' : 'Mở lịch tuần để sắp xếp lại ›'}
                  </a>
                )
              }
            >
              {single ? (
                <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-ink-mute">Sản phẩm</dt>
                  <dd className="font-medium">
                    {single.product_keys.map((k, n) => (
                      <span key={k}>
                        {n > 0 && <span className="font-normal text-ink-mute">{usage ? ', ' : ' + '}</span>}
                        {names.get(k) ?? k}
                      </span>
                    ))}
                  </dd>
                  <dt className="text-ink-mute">Khi nào</dt>
                  <dd>{formatOccurrences(single.occurrences)}</dd>
                </dl>
              ) : (
                <div className="mt-3 text-sm">
                  <p className="text-ink-mute">{g.warnings.length} cặp sản phẩm:</p>
                  <ul className="mt-1 space-y-1.5">
                    {g.warnings.map((w) => (
                      <li key={w.product_keys.join('+')}>
                        <span className="font-medium">{warningProducts(w, names)}</span>
                        <span className="block text-xs text-ink-mute">{formatOccurrences(w.occurrences)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <RuleIngredients rule={g.rule} productKeys={g.productKeys} names={names} found={found} />
              <p className="mt-2 text-xs leading-relaxed text-ink-mute">
                {usage
                  ? 'Lưu ý cho mọi sản phẩm có nhóm hoạt chất này trong routine.'
                  : `Luật áp dụng khi hai sản phẩm dùng ${SCOPE_LABELS[g.rule.scope]}.`}
                {rinseOff.length > 0 &&
                  ` ${rinseOff.map((k) => `“${names.get(k) ?? k}”`).join(', ')} là sản phẩm rửa trôi; SkinWise hiện áp dụng luật như nhau cho sản phẩm rửa trôi và sản phẩm để lại trên da.`}
              </p>
            </RuleCard>
          )
        })}
        {result && result.warnings.length > 0 && (
          <p className="px-1 text-xs leading-relaxed text-ink-mute">
            Bảng thành phần không ghi nồng độ, nên cảnh báo chỉ nói “có thể”. SkinWise chỉ kiểm tra một số ít kết hợp
            đã có nguồn đáng tin cậy.
          </p>
        )}
      </div>
      </div>
    </section>
  )
}

/**
 * For each product of a rule's warnings, the label lines in the rule's groups, with their place on
 * the label. Display only: nothing here changes the warning. Hidden when no line matches.
 */
function RuleIngredients({
  rule,
  productKeys,
  names,
  found,
}: {
  rule: Warning['rule']
  productKeys: string[]
  names: Map<string, string>
  found: Map<string, LabelGroups>
}) {
  const ruleGroups = [rule.group_a, rule.group_b].filter((g): g is string => g !== null)
  const rows = productKeys.flatMap((key) => {
    const product = found.get(key)
    if (!product) return []
    // One line can be in both groups of the rule (or the same group twice): list it once.
    const seen = new Set<number>()
    const lines = product.ingredients.filter(
      (i) => ruleGroups.includes(i.group) && !seen.has(i.position) && seen.add(i.position),
    )
    return lines.length > 0 ? [{ key, text: lines.map((l) => formatLabelLine(l, product)).join(', ') }] : []
  })
  if (rows.length === 0) return null
  return (
    <div className="mt-2 text-sm">
      <p className="text-ink-mute">Chất liên quan trên nhãn:</p>
      <ul className="mt-0.5 space-y-0.5">
        {rows.map((r) => (
          <li key={r.key} className="break-words">
            <span className="font-medium">{names.get(r.key) ?? r.key}:</span> {r.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * How many combination warnings at each severity, most severe first, counted as cards (one per
 * rule, however many pairs of products it lists); "Lưu ý khi dùng" notes are counted on their own,
 * not as warnings.
 */
function tally(warnings: Warning[]) {
  const groups = groupByRule(warnings)
  const combinations = groups.filter((g) => g.rule.kind !== 'usage')
  const counts = (Object.keys(SEVERITY) as Severity[])
    .map((severity) => [severity, combinations.filter((g) => g.rule.severity === severity).length] as const)
    .filter(([, n]) => n > 0)
  return { counts, notes: groups.length - combinations.length }
}

/** The status line a screen reader announces once a check finishes. */
function announcement(state: CheckState): string {
  if (state.kind === 'error') return checkError(state.problem)
  if (state.kind !== 'done') return ''
  const { counts, notes } = tally(state.result.warnings)
  const parts = counts.map(([severity, n]) => `${n} ${SEVERITY[severity].label.toLowerCase()}`)
  if (parts.length === 0) parts.push('chưa có cảnh báo kết hợp, không có nghĩa là chắc chắn an toàn')
  if (notes > 0) parts.push(`${notes} lưu ý khi dùng`)
  return `Đã kiểm tra routine: ${parts.join('; ')}.`
}

/** The counts as tiles (the check tab): one per severity that has warnings, then the usage notes. */
function SeverityTiles({ warnings }: { warnings: Warning[] }) {
  const { counts, notes } = tally(warnings)
  return (
    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {counts.map(([severity, n]) => (
        <div key={severity} className="rounded-md bg-surface p-3">
          <SeverityBadge severity={severity} />
          <p className="mt-1 text-xl font-semibold tabular-nums">{n}</p>
        </div>
      ))}
      {notes > 0 && (
        <div className="rounded-md bg-surface p-3">
          <span className="text-xs font-semibold text-ink-soft">Lưu ý khi dùng</span>
          <p className="mt-1 text-xl font-semibold tabular-nums">{notes}</p>
        </div>
      )}
    </div>
  )
}

/** "1 Nên tránh, 2 Thận trọng" badges, then the number of usage notes. */
export function SeverityCounts({ warnings, className }: { warnings: Warning[]; className?: string }) {
  const { counts, notes } = tally(warnings)
  return (
    <p className={`flex flex-wrap items-center gap-1.5 ${className ?? ''}`}>
      {counts.map(([severity, n]) => (
        <SeverityBadge key={severity} severity={severity}>
          {n} {SEVERITY[severity].label.toLowerCase()}
        </SeverityBadge>
      ))}
      {notes > 0 && <span className="text-xs opacity-80">{notes} lưu ý khi dùng</span>}
    </p>
  )
}
