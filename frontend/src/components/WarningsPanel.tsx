import type { Severity, Warning } from '../api'
import { SCOPE_LABELS, SEVERITY, formatOccurrences } from '../labels'
import { currentResult, isUsageNote, maybeIncomplete, type CheckState, type MyProduct } from '../routine'
import { SeverityBadge } from './Icons'
import { DataNote, Notice } from './Notice'
import { RuleCard } from './RuleCard'

type Props = { state: CheckState; products: MyProduct[] }

export function WarningsPanel({ state, products }: Props) {
  const names = new Map(products.map((p) => [p.key, p.name]))
  const result = currentResult(state)
  const checked = new Set(result?.products.map((p) => p.key))
  const incomplete = products.filter((p) => checked.has(p.key) && maybeIncomplete(p))
  const misspelled = (result?.products ?? []).filter((p) => p.possible_actives.length > 0)
  const applications = new Map(result?.products.map((p) => [p.key, p.application]))

  return (
    <section aria-labelledby="results-title">
      {/* Read out after each check. The panel itself is not a live region: a screen reader
          would read every card again on each change. */}
      <p role="status" className="sr-only">
        {announcement(state)}
      </p>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="results-title" className="text-xl font-bold">
          Kết quả kiểm tra
        </h2>
        {state.kind === 'loading' && <span className="text-xs text-ink-mute">Đang kiểm tra…</span>}
      </div>
      {result && result.warnings.length > 0 && <SeverityCounts warnings={result.warnings} className="mt-2" />}
      <div className="mt-4 space-y-3">
        {state.kind === 'empty' && (
          <Notice>Thêm sản phẩm vào buổi sáng hoặc tối để SkinWise kiểm tra routine.</Notice>
        )}
        {state.kind === 'error' && (
          <div className="rounded-xl bg-avoid-soft p-4 text-sm leading-relaxed text-avoid-ink">
            <p>Không kiểm tra được routine lúc này. Có thể mạng đang chập chờn hoặc máy chủ đang bận.</p>
            <button
              onClick={state.retry}
              className="mt-2 min-h-10 rounded-full bg-surface px-4 font-medium text-avoid-ink ring-1 ring-avoid/40 hover:bg-white"
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
          <DataNote key={p.key} title="Có thể có hoạt chất bị gõ sai">
            “{names.get(p.key) ?? p.key}” có thành phần không nhận ra, có thể là hoạt chất bị gõ sai:{' '}
            <strong className="text-ink">{p.possible_actives.join(', ')}</strong>. SkinWise chưa kiểm tra các chất này;
            hãy sửa bảng thành phần nếu đúng là gõ sai.
          </DataNote>
        ))}
        {result?.notice_vi && <Notice>{result.notice_vi}</Notice>}
        {result?.warnings.map((w) => {
          const usage = w.rule.kind === 'usage'
          const rinseOff = usage ? [] : w.product_keys.filter((k) => applications.get(k) === 'rinse_off')
          return (
            <RuleCard key={`${w.rule.key}:${w.product_keys.join('+')}`} rule={w.rule} collapsible>
              <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                <dt className="text-ink-mute">Sản phẩm</dt>
                <dd className="font-medium">
                  {w.product_keys.map((k, n) => (
                    <span key={k}>
                      {n > 0 && <span className="font-normal text-ink-mute">{usage ? ', ' : ' + '}</span>}
                      {names.get(k) ?? k}
                    </span>
                  ))}
                </dd>
                <dt className="text-ink-mute">Khi nào</dt>
                <dd>{formatOccurrences(w.occurrences)}</dd>
              </dl>
              <p className="mt-2 text-xs leading-relaxed text-ink-mute">
                {usage
                  ? 'Lưu ý cho mọi sản phẩm có nhóm hoạt chất này trong routine.'
                  : `Luật áp dụng khi hai sản phẩm dùng ${SCOPE_LABELS[w.rule.scope]}.`}
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
    </section>
  )
}

/**
 * How many combination warnings at each severity, most severe first; "Lưu ý khi dùng" notes are
 * counted on their own, not as warnings.
 */
function tally(warnings: Warning[]) {
  const combinations = warnings.filter((w) => !isUsageNote(w))
  const counts = (Object.keys(SEVERITY) as Severity[])
    .map((severity) => [severity, combinations.filter((w) => w.rule.severity === severity).length] as const)
    .filter(([, n]) => n > 0)
  return { counts, notes: warnings.length - combinations.length }
}

/** The status line a screen reader announces once a check finishes. */
function announcement(state: CheckState): string {
  if (state.kind === 'error') return 'Không kiểm tra được routine.'
  if (state.kind !== 'done') return ''
  const { counts, notes } = tally(state.result.warnings)
  const parts = counts.map(([severity, n]) => `${n} ${SEVERITY[severity].label.toLowerCase()}`)
  if (parts.length === 0) parts.push('chưa có cảnh báo kết hợp, không có nghĩa là chắc chắn an toàn')
  if (notes > 0) parts.push(`${notes} lưu ý khi dùng`)
  return `Đã kiểm tra routine: ${parts.join('; ')}.`
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
