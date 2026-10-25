import { SCOPE_LABELS, formatOccurrences } from '../labels'
import { maybeIncomplete, type CheckState, type MyProduct } from '../routine'
import { Notice } from './Notice'
import { RuleCard } from './RuleCard'

type Props = { state: CheckState; products: MyProduct[] }

export function WarningsPanel({ state, products }: Props) {
  const names = new Map(products.map((p) => [p.key, p.name]))
  const result = state.kind === 'done' ? state.result : state.kind === 'loading' ? state.previous : null
  const checked = new Set(result?.products.map((p) => p.key))
  const incomplete = products.filter((p) => checked.has(p.key) && maybeIncomplete(p))
  const misspelled = (result?.products ?? []).filter((p) => p.possible_actives.length > 0)

  return (
    <section aria-live="polite">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold text-slate-900">Kết quả kiểm tra</h2>
        {state.kind === 'loading' && <span className="text-xs text-slate-500">Đang kiểm tra…</span>}
      </div>
      <div className="mt-3 space-y-3">
        {state.kind === 'empty' && (
          <Notice>Thêm sản phẩm vào buổi sáng hoặc tối để SkinWise kiểm tra routine.</Notice>
        )}
        {state.kind === 'error' && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
            Không kiểm tra được routine ({state.message}). Hãy thử lại sau.
          </div>
        )}
        {incomplete.length > 0 && (
          <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
            Bảng thành phần của {incomplete.map((p) => `“${p.name}”`).join(', ')} có thể chưa đầy đủ, nên kết quả
            dưới đây có thể thiếu cảnh báo.
          </div>
        )}
        {misspelled.map((p) => (
          <div key={p.key} className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
            “{names.get(p.key) ?? p.key}” có thành phần không nhận ra, có thể là hoạt chất bị gõ sai:{' '}
            <strong>{p.possible_actives.join(', ')}</strong>. SkinWise chưa kiểm tra các chất này; hãy sửa bảng thành
            phần nếu đúng là gõ sai.
          </div>
        ))}
        {result?.notice_vi && <Notice>{result.notice_vi}</Notice>}
        {result?.warnings.map((w) => (
          <RuleCard key={`${w.rule.key}:${w.product_keys.join('+')}`} rule={w.rule}>
            <dl className="mt-2 space-y-0.5 text-sm text-slate-600">
              <div>
                <dt className="inline font-medium text-slate-700">Sản phẩm: </dt>
                <dd className="inline">{w.product_keys.map((k) => names.get(k) ?? k).join(' + ')}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-slate-700">Khi nào: </dt>
                <dd className="inline">{formatOccurrences(w.occurrences)}</dd>
              </div>
              <div className="text-xs text-slate-500">Luật áp dụng khi hai sản phẩm dùng {SCOPE_LABELS[w.rule.scope]}.</div>
            </dl>
          </RuleCard>
        ))}
        {result && result.warnings.length > 0 && (
          <p className="text-xs text-slate-500">
            Bảng thành phần không ghi nồng độ, nên cảnh báo chỉ nói “có thể”. SkinWise chỉ kiểm tra một số ít kết hợp
            đã có nguồn đáng tin cậy.
          </p>
        )}
      </div>
    </section>
  )
}
