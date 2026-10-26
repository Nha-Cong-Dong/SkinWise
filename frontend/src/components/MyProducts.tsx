import { useEffect, useState } from 'react'
import { api, type InciAnalysis, type ProductDetail } from '../api'
import { APPLICATION_LABELS, SESSION_LABELS, VERIFICATION_LABELS } from '../labels'
import { maybeIncomplete, type MyProduct, type RoutineActions } from '../routine'
import { Dialog } from './Dialog'
import { GroupChips } from './GroupChips'
import { Glyph } from './Icons'
import { IngredientList } from './IngredientList'

type Props = { actions: RoutineActions; onAdd: () => void }

/** The user's shelf: every product they added, ready to place in a session. */
export function MyProducts({ actions, onAdd }: Props) {
  const { products, entries } = actions.routine
  const [viewing, setViewing] = useState<MyProduct | null>(null)
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
          <button
            onClick={onAdd}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink py-2 pr-4 pl-3 text-sm font-medium text-white hover:bg-link"
          >
            <Glyph name="plus" className="size-4" />
            Thêm sản phẩm
          </button>
        </div>
      ) : (
        // On a phone the shelf scrolls sideways so the schedule is not pushed far down.
        <ul className="-mx-4 mt-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:grid md:overflow-visible md:px-0 md:pb-0 @lg:grid-cols-2 @3xl:grid-cols-3">
          {products.map((p) => (
            <ProductRow
              key={p.key}
              product={p}
              uses={entries.filter((e) => e.productKey === p.key).length}
              actions={actions}
              onView={() => setViewing(p)}
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
    </section>
  )
}

type RowProps = { product: MyProduct; uses: number; actions: RoutineActions; onView: () => void }

function ProductRow({ product, uses, actions, onView }: RowProps) {
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
            className={`rounded-full px-2.5 py-1 font-medium ${
              session === 'AM'
                ? 'bg-paper text-ink ring-1 ring-line hover:ring-ink'
                : 'bg-night text-night-text hover:bg-night-raised'
            }`}
          >
            + {SESSION_LABELS[session]}
          </button>
        ))}
        <span className="flex-1" />
        <button onClick={onView} className="rounded-full px-2 py-1 text-ink-soft hover:bg-paper hover:text-ink">
          Thành phần
        </button>
        <button
          onClick={() => {
            if (uses === 0 || confirm(`Xoá “${product.name}” khỏi ${uses} bước trong routine?`)) {
              actions.removeProduct(product.key)
            }
          }}
          className="rounded-full px-2 py-1 text-ink-mute hover:bg-avoid-soft hover:text-avoid-ink"
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
