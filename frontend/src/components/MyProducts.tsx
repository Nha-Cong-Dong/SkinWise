import { useEffect, useState } from 'react'
import { api, type InciAnalysis, type ProductDetail } from '../api'
import { APPLICATION_LABELS, SESSION_LABELS, VERIFICATION_LABELS } from '../labels'
import { maybeIncomplete, sampleRoutine, type MyProduct, type RemovedProduct, type RoutineActions } from '../routine'
import { Dialog } from './Dialog'
import { GroupChips } from './GroupChips'
import { Glyph } from './Icons'
import { IngredientList } from './IngredientList'

type Props = { actions: RoutineActions; onAdd: () => void }

const UNDO_MS = 8000

/** The user's shelf: every product they added, ready to place in a session. */
export function MyProducts({ actions, onAdd }: Props) {
  const { products } = actions.routine
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
    <section aria-labelledby="products-title" className="@container">
      <div className="flex items-center justify-between gap-3">
        <h2 id="products-title" className="text-xl font-bold">
          Sản phẩm của tôi
        </h2>
        {products.length > 0 && (
          <button
            onClick={onAdd}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink py-1.5 pr-3.5 pl-2.5 text-sm font-medium text-white hover:bg-link"
          >
            <Glyph name="plus" className="size-4" />
            Thêm
          </button>
        )}
      </div>
      {products.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-ink-mute/40 p-5">
          <p className="text-sm leading-relaxed text-ink-soft">
            Thêm những sản phẩm bạn đang dùng: tìm trong danh sách có sẵn, hoặc dán bảng thành phần in trên bao bì.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={onAdd}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-ink pr-4 pl-3 text-sm font-medium text-white hover:bg-link"
            >
              <Glyph name="plus" className="size-4" />
              Thêm sản phẩm
            </button>
            <button
              onClick={trySample}
              disabled={sample === 'loading'}
              className="inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium text-ink ring-1 ring-line hover:bg-surface disabled:opacity-60"
            >
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
        // On a phone the shelf scrolls sideways so the schedule is not pushed far down.
        <ul className="-mx-4 mt-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:grid md:overflow-visible md:px-0 md:pb-0 @lg:grid-cols-2 @3xl:grid-cols-3">
          {products.map((p) => (
            <ProductRow
              key={p.key}
              product={p}
              actions={actions}
              onView={() => setViewing(p)}
              onRemove={() => setRemoved(actions.removeProduct(p.key))}
            />
          ))}
        </ul>
      )}
      <Dialog
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={
          viewing && (
            <>
              {viewing.brand && <p className="text-sm text-ink-mute">{viewing.brand}</p>}
              <h2 className="text-lg leading-snug font-semibold">{viewing.name}</h2>
              <div className="mt-1.5">
                <GroupChips codes={viewing.groups} />
              </div>
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
          results bar that phones show at the bottom of the screen. */}
      <div role="status" className="fixed inset-x-3 bottom-20 z-30 mx-auto max-w-md lg:bottom-6">
        {removed && (
          <div className="flex items-center gap-3 rounded-2xl bg-ink py-2.5 pr-2.5 pl-4 text-sm text-white shadow-xl shadow-ink/30">
            <span className="min-w-0 flex-1">
              Đã xoá “{removed.product.name}”
              {removed.entries.length > 0 && ` và ${removed.entries.length} bước trong lịch`}.
            </span>
            <button
              onClick={() => {
                actions.restoreProduct(removed)
                setRemoved(null)
              }}
              className="min-h-10 shrink-0 rounded-full px-3 font-semibold text-moon hover:bg-white/10"
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
  actions: RoutineActions
  onView: () => void
  onRemove: () => void
}

// Buttons repeat on every card, so their accessible names include the product (aria-label, which
// starts with the visible word); at least 40 px tall on phones (WCAG 2.2 asks 24 px, fingers need more).
const ROW_BUTTON = 'inline-flex min-h-10 items-center rounded-full md:min-h-8'

function ProductRow({ product, actions, onView, onRemove }: RowProps) {
  return (
    <li className="flex w-72 shrink-0 snap-start flex-col rounded-xl bg-surface p-3 ring-1 ring-line md:w-auto">
      <p className="leading-snug text-pretty">
        {product.brand ? (
          <span className="block text-xs text-ink-mute">{product.brand}</span>
        ) : (
          <span className="block text-xs text-ink-mute">Tự nhập bảng thành phần</span>
        )}
        <span className="text-sm font-medium">{product.name}</span>
      </p>
      {product.origin?.kind === 'photo' && (
        <p className="mt-1 text-xs text-ink-mute">Đọc từ ảnh nhãn bằng AI, bạn đã so với bao bì</p>
      )}
      {maybeIncomplete(product) && (
        <p className="mt-1 text-xs text-caution-ink">Bảng thành phần có thể chưa đầy đủ, cảnh báo có thể bị thiếu</p>
      )}
      <div className="mt-1.5">
        <GroupChips codes={product.groups} empty="Không có hoạt chất trong danh sách theo dõi" />
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-1 pt-3 text-sm">
        {(['AM', 'PM'] as const).map((session) => (
          <button
            key={session}
            onClick={() => actions.addEntry(product.key, session)}
            aria-label={`${SESSION_LABELS[session]}: thêm “${product.name}” vào buổi ${SESSION_LABELS[session].toLowerCase()}`}
            className={`${ROW_BUTTON} px-2.5 font-medium ${
              session === 'AM'
                ? 'bg-paper text-ink ring-1 ring-line hover:ring-ink'
                : 'bg-night text-night-text hover:bg-night-raised'
            }`}
          >
            + {SESSION_LABELS[session]}
          </button>
        ))}
        <span className="flex-1" />
        <button
          onClick={onView}
          aria-label={`Thành phần của “${product.name}”`}
          className={`${ROW_BUTTON} px-2 text-ink-soft hover:bg-paper hover:text-ink`}
        >
          Thành phần
        </button>
        <button
          onClick={onRemove}
          aria-label={`Xoá “${product.name}”`}
          className={`${ROW_BUTTON} px-2 text-ink-mute hover:bg-avoid-soft hover:text-avoid-ink`}
        >
          Xoá
        </button>
      </div>
    </li>
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
  const [error, setError] = useState(false)

  useEffect(() => {
    api.analyzeInci(inci).then(setAnalysis, () => setError(true))
  }, [inci])

  if (error) return <p className="text-sm text-avoid-ink">Không phân tích được bảng thành phần.</p>
  if (!analysis) return <p className="text-sm text-ink-mute">Đang tải…</p>
  return <IngredientList ingredients={analysis.ingredients} onePercentMarker={analysis.one_percent_marker} />
}
