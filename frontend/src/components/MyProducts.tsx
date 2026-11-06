import { useEffect, useState } from 'react'
import { api, requestError, SUGGESTIONS_TRUNCATED_VI, type InciAnalysis, type ProductDetail } from '../api'
import type { Severity } from '../api'
import { APPLICATION_LABELS, SESSION_LABELS, VERIFICATION_LABELS, formatDays } from '../labels'
import {
  currentResult,
  maybeIncomplete,
  sampleRoutine,
  type CheckState,
  type LabelGroups,
  type MyProduct,
  type RemovedProduct,
  type RoutineActions,
} from '../routine'
import { Dialog } from './Dialog'
import { GroupChips, LABEL_CHIP_NOTE, UNORDERED_NOTE } from './GroupChips'
import { Glyph, SeverityBadge } from './Icons'
import { IngredientList } from './IngredientList'
import { DataNote } from './Notice'
import { btn, btnGhost, btnPrimary, field, sm } from './ui'

type Props = {
  actions: RoutineActions
  onAdd: () => void
  /** Label lines behind each product's groups (product key), from the last check. */
  found: Map<string, LabelGroups>
  /** Most severe combination warning each product key is part of. */
  flagged: Map<string, Severity>
  /** The routine check, for the "Có lưu ý" filter. */
  check: CheckState
}

type ShelfFilter = 'all' | 'used' | 'unscheduled' | 'noted'

const FILTERS: [ShelfFilter, string][] = [
  ['all', 'Tất cả'],
  ['used', 'Đang dùng'],
  ['unscheduled', 'Chưa xếp lịch'],
  ['noted', 'Có lưu ý'],
]

/** Lower case, without Vietnamese marks ("Đậu" -> "dau"), for the shelf search. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
}

const UNDO_MS = 8000

/** "Sáng: mỗi ngày · Tối: T2, T4", or "Chưa xếp lịch": where a product is in the schedule. */
function scheduleOf(product: MyProduct, actions: RoutineActions): string {
  const parts = (['AM', 'PM'] as const).flatMap((session) => {
    const entries = actions.routine.entries.filter((e) => e.productKey === product.key && e.session === session)
    if (entries.length === 0) return []
    const days = [...new Set(entries.flatMap((e) => e.days))].sort((a, b) => a - b)
    return [`${SESSION_LABELS[session]}: ${days.length ? formatDays(days) : 'chưa chọn ngày'}`]
  })
  return parts.length ? parts.join(' · ') : 'Chưa xếp lịch'
}

/** "Tủ đồ": every product the user added, ready to place in a session. */
export function MyProducts({ actions, onAdd, found, flagged, check }: Props) {
  const { products } = actions.routine
  // Search and filter live only while the page is open.
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ShelfFilter>('all')
  const scheduled = new Set(actions.routine.entries.map((e) => e.productKey))
  const result = currentResult(check)
  // Exactly the products the check put in a warning (or usage note); unknown until a check has answered.
  const noted = result ? new Set(result.warnings.flatMap((w) => w.product_keys)) : null
  const keep: Record<ShelfFilter, (p: MyProduct) => boolean> = {
    all: () => true,
    used: (p) => scheduled.has(p.key),
    unscheduled: (p) => !scheduled.has(p.key),
    noted: (p) => noted?.has(p.key) ?? false,
  }
  const words = fold(query).split(/\s+/).filter(Boolean)
  const matches = (p: MyProduct) => {
    const text = fold(`${p.name} ${p.brand ?? ''}`)
    return words.every((w) => text.includes(w))
  }
  const searched = products.filter(matches)
  const shown = searched.filter(keep[filter])
  // "Có lưu ý" before a check has answered: say why the list is empty instead of "no match".
  const notedPending = filter === 'noted' && noted === null
  const [viewing, setViewing] = useState<MyProduct | null>(null)
  // The last removal, offered for "Hoàn tác" for a few seconds (instead of asking first).
  const [removed, setRemoved] = useState<RemovedProduct | null>(null)
  const [sample, setSample] = useState<'idle' | 'loading' | 'error'>('idle')

  const trySample = () => {
    setSample('loading')
    api.searchProducts('').then(
      (catalogue) => {
        const routine = sampleRoutine(catalogue)
        if (routine) actions.replace(routine)
        setSample(routine ? 'idle' : 'error')
      },
      () => setSample('error'),
    )
  }

  useEffect(() => {
    if (!removed) return
    const timer = setTimeout(() => setRemoved(null), UNDO_MS)
    return () => clearTimeout(timer)
  }, [removed])

  return (
    <section aria-labelledby="products-title">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-ink-mute">{products.length} sản phẩm</p>
          <h1 id="products-title" className="text-3xl lg:text-4xl">
            Tủ đồ
          </h1>
        </div>
        {products.length > 0 && (
          <button onClick={onAdd} className={btnPrimary}>
            <Glyph name="plus" className="size-4" />
            Thêm sản phẩm
          </button>
        )}
      </header>
      {products.length === 0 ? (
        <div className="mt-6 max-w-2xl rounded-md border border-dashed border-ink-mute/40 bg-surface p-5">
          <p className="text-sm leading-relaxed text-ink-soft">
            Thêm những sản phẩm bạn đang dùng: tìm trong danh sách có sẵn, hoặc dán bảng thành phần in trên bao bì.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={onAdd} className={btnPrimary}>
              <Glyph name="plus" className="size-4" />
              Thêm sản phẩm
            </button>
            <button onClick={trySample} disabled={sample === 'loading'} className={btn}>
              {sample === 'loading' ? 'Đang tải…' : 'Thử với routine mẫu'}
            </button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-mute">
            Routine mẫu gồm 4 sản phẩm bán ở Việt Nam, chỉ để xem SkinWise kiểm tra thế nào, không phải gợi ý cách dùng.
            Bạn có thể xoá từng sản phẩm bất cứ lúc nào.
          </p>
          {sample === 'error' && (
            <p className="mt-2 text-sm text-avoid-ink">Không tải được routine mẫu. Hãy thử lại sau.</p>
          )}
        </div>
      ) : (
        <>
        <div className="mt-6 flex flex-wrap items-end gap-4">
          <label className="w-full text-xs font-semibold sm:max-w-sm">
            Tìm trong tủ
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tên sản phẩm hoặc tên hãng"
              className={`${field} mt-1 font-normal`}
            />
          </label>
          <div role="group" aria-label="Lọc" className="flex flex-wrap gap-2">
            {FILTERS.map(([value, label]) => {
              const n = value === 'noted' && noted === null ? null : searched.filter(keep[value]).length
              return (
                <button
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={`inline-flex min-h-11 shrink-0 items-center rounded-md border px-3 text-xs font-semibold whitespace-nowrap ${
                    filter === value
                      ? 'border-primary bg-primary text-surface'
                      : 'border-line bg-surface text-primary hover:border-primary'
                  }`}
                >
                  {label}
                  {n !== null && <span className="ml-1.5 tabular-nums opacity-80">{n}</span>}
                </button>
              )
            })}
          </div>
        </div>
        {notedPending ? (
          <p className="mt-6 text-sm text-ink-soft" role="status">
            {check.kind === 'loading'
              ? 'Đang kiểm tra lịch dùng…'
              : check.kind === 'error'
                ? 'Chưa kiểm tra được lịch dùng, nên chưa biết sản phẩm nào có lưu ý.'
                : 'Lịch dùng chưa có bước nào nên chưa có kết quả kiểm tra.'}
          </p>
        ) : shown.length === 0 ? (
          <p className="mt-6 text-sm text-ink-soft" role="status">
            Không có sản phẩm khớp
            {query.trim() ? ` với “${query.trim()}”` : ''}
            {filter !== 'all' ? ` trong mục “${FILTERS.find(([v]) => v === filter)![1]}”` : ''}.
          </p>
        ) : (
        <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {shown.map((p) => (
            <ProductRow
              key={p.key}
              product={p}
              found={found.get(p.key)}
              severity={flagged.get(p.key)}
              actions={actions}
              onView={() => setViewing(p)}
              onRemove={() => setRemoved(actions.removeProduct(p.key))}
            />
          ))}
        </ul>
        )}
        </>
      )}
      <Dialog
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={
          viewing && (
            <>
              {viewing.brand && <p className="text-xs text-ink-mute">{viewing.brand}</p>}
              <h2 className="text-2xl leading-tight">{viewing.name}</h2>
              <p className="mt-1 text-xs text-ink-mute">Trong lịch dùng: {scheduleOf(viewing, actions)}</p>
              <div className="mt-2">
                <GroupChips codes={viewing.groups} found={found.get(viewing.key)} />
              </div>
              <ChipNote found={found.get(viewing.key)} />
            </>
          )
        }
      >
        {viewing &&
          (viewing.productId !== null ? (
            <SeededIngredients productId={viewing.productId} />
          ) : (
            <PastedIngredients inci={viewing.inci ?? ''} />
          ))}
      </Dialog>
      {/* Always in the page, so a screen reader announces the message when it appears. Above the
          results bar and the tab bar that phones show at the bottom of the screen. */}
      <div role="status" className="fixed inset-x-3 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-md lg:bottom-6">
        {removed && (
          <div className="dusk-panel flex items-center gap-3 rounded-md bg-primary py-2.5 pr-2.5 pl-4 text-sm text-surface shadow-float">
            <span className="min-w-0 flex-1">
              Đã xoá “{removed.product.name}”
              {removed.entries.length > 0 && ` và ${removed.entries.length} bước trong lịch`}.
            </span>
            <button
              onClick={() => {
                actions.restoreProduct(removed)
                setRemoved(null)
              }}
              className="min-h-10 shrink-0 rounded-full px-3 font-semibold text-thistle hover:bg-on-dusk/10"
            >
              Hoàn tác
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

type RowProps = {
  product: MyProduct
  found: LabelGroups | undefined
  severity: Severity | undefined
  actions: RoutineActions
  onView: () => void
  onRemove: () => void
}

// Buttons repeat on every card, so their accessible names include the product (aria-label, which
// starts with the visible word).
function ProductRow({ product, found, severity, actions, onView, onRemove }: RowProps) {
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-md bg-surface p-4 lg:p-5">
      <button onClick={onView} className="-m-1 rounded-sm p-1 text-left leading-snug text-pretty hover:text-primary">
        <span className="block text-xs text-ink-mute">{product.brand ?? 'Tự nhập bảng thành phần'}</span>
        <span className="font-semibold">{product.name}</span>
      </button>
      {product.origin?.kind === 'photo' && (
        <p className="-mt-2 text-xs text-ink-mute">Đọc từ ảnh nhãn bằng AI, bạn đã so với bao bì</p>
      )}
      {maybeIncomplete(product) && (
        <p className="-mt-2 text-xs text-caution-ink">Bảng thành phần có thể chưa đầy đủ, cảnh báo có thể bị thiếu</p>
      )}
      <GroupChips codes={product.groups} found={found} empty="Không có hoạt chất trong danh sách theo dõi" />
      <p className="flex flex-wrap items-center gap-2 text-xs text-ink-mute">
        {severity && <SeverityBadge severity={severity} />}
        {scheduleOf(product, actions)}
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        {(['AM', 'PM'] as const).map((session) => (
          <button
            key={session}
            onClick={() => actions.addEntry(product.key, session)}
            aria-label={`${SESSION_LABELS[session]}: thêm “${product.name}” vào buổi ${SESSION_LABELS[session].toLowerCase()}`}
            className={`${btn} ${sm}`}
          >
            + {SESSION_LABELS[session]}
          </button>
        ))}
        <span className="flex-1" />
        <button onClick={onView} aria-label={`Thành phần của “${product.name}”`} className={btnGhost}>
          Thành phần
        </button>
        <button
          onClick={onRemove}
          aria-label={`Xoá “${product.name}”`}
          className={`${btnGhost} text-avoid-ink hover:bg-avoid-soft`}
        >
          Xoá
        </button>
      </div>
    </li>
  )
}

/** Under the chips of the details dialog, once they name an ingredient (tooltips are not read on phones). */
function ChipNote({ found }: { found: LabelGroups | undefined }) {
  if (!found || found.ingredients.length === 0) return null
  return (
    <p className="mt-1.5 text-xs leading-relaxed font-normal text-ink-mute">
      {LABEL_CHIP_NOTE}
      {!found.ordered && ` ${UNORDERED_NOTE}`}
    </p>
  )
}

function SeededIngredients({ productId }: { productId: number }) {
  const [detail, setDetail] = useState<ProductDetail | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    api.product(productId).then(setDetail, () => setError(true))
  }, [productId])

  if (error) return <p className="text-sm text-avoid-ink">Không tải được bảng thành phần.</p>
  if (!detail) return <p className="text-sm text-ink-mute">Đang tải…</p>
  return (
    <>
      <p className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-mute">
        {detail.application && <span>Sản phẩm {APPLICATION_LABELS[detail.application].toLowerCase()}</span>}
        <span>{VERIFICATION_LABELS[detail.verification_status] ?? detail.verification_status}</span>
        {detail.source_url && (
          <a
            href={detail.source_url}
            target="_blank"
            rel="noreferrer"
            className="text-link underline-offset-2 hover:underline"
          >
            Lấy từ trang của hãng
            {detail.source_retrieved_at && ` (${new Date(detail.source_retrieved_at).toLocaleDateString('vi-VN')})`}
          </a>
        )}
      </p>
      <IngredientList ingredients={detail.ingredients} onePercentMarker={detail.one_percent_marker} />
    </>
  )
}

function PastedIngredients({ inci }: { inci: string }) {
  const [analysis, setAnalysis] = useState<InciAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.analyzeInci(inci).then(setAnalysis, (e) => setError(requestError(e, 'Không phân tích được bảng thành phần.')))
  }, [inci])

  if (error) return <p className="text-sm text-avoid-ink">{error}</p>
  if (!analysis) return <p className="text-sm text-ink-mute">Đang tải…</p>
  return (
    <>
      {analysis.suggestions_truncated && (
        <div className="mb-3">
          <DataNote title="Chưa kiểm hết bảng thành phần">{SUGGESTIONS_TRUNCATED_VI}</DataNote>
        </div>
      )}
      <IngredientList ingredients={analysis.ingredients} onePercentMarker={analysis.one_percent_marker} />
    </>
  )
}
