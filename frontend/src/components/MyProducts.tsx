import { useEffect, useState } from 'react'
import { api, type ProductDetail } from '../api'
import { SESSION_LABELS, VERIFICATION_LABELS } from '../labels'
import { maybeIncomplete, type MyProduct, type RoutineActions } from '../routine'
import { GroupChips } from './GroupChips'

export function MyProducts({ actions }: { actions: RoutineActions }) {
  const { products, entries } = actions.routine
  return (
    <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="font-semibold text-slate-900">Sản phẩm của tôi</h2>
      {products.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Chưa có sản phẩm. Thêm sản phẩm ở khung bên trên.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {products.map((p) => (
            <ProductRow
              key={p.key}
              product={p}
              uses={entries.filter((e) => e.productKey === p.key).length}
              actions={actions}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function ProductRow({ product, uses, actions }: { product: MyProduct; uses: number; actions: RoutineActions }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="py-3">
      <div>
        <div className="min-w-0">
          {product.brand && <p className="text-xs text-slate-500">{product.brand}</p>}
          <p className="text-sm font-medium text-slate-900">
            {product.name}
            {product.productId === null && <span className="ml-2 text-xs font-normal text-slate-400">tự nhập</span>}
          </p>
          {maybeIncomplete(product) && (
            <p className="text-xs text-amber-700">Bảng thành phần có thể chưa đầy đủ, cảnh báo có thể bị thiếu</p>
          )}
          <div className="mt-1">
            <GroupChips codes={product.groups} empty="Không có hoạt chất trong danh sách theo dõi" />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1 text-sm">
          {(['AM', 'PM'] as const).map((session) => (
            <button
              key={session}
              onClick={() => actions.addEntry(product.key, session)}
              className="rounded-md border border-rose-300 px-2 py-1 text-rose-700 hover:bg-rose-50"
            >
              + {SESSION_LABELS[session]}
            </button>
          ))}
          <button
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100"
          >
            Thành phần
          </button>
          <button
            onClick={() => {
              if (uses === 0 || confirm(`Xoá “${product.name}” khỏi ${uses} bước trong routine?`)) {
                actions.removeProduct(product.key)
              }
            }}
            className="rounded-md px-2 py-1 text-slate-500 hover:bg-red-50 hover:text-red-700"
          >
            Xoá
          </button>
        </div>
      </div>
      {open &&
        (product.productId !== null ? (
          <SeededIngredients productId={product.productId} />
        ) : (
          <p className="mt-2 rounded-md bg-slate-50 p-3 font-mono text-xs text-slate-600">{product.inci}</p>
        ))}
    </li>
  )
}

function SeededIngredients({ productId }: { productId: number }) {
  const [detail, setDetail] = useState<ProductDetail | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    api.product(productId).then(setDetail, () => setError(true))
  }, [productId])

  if (error) return <p className="mt-2 text-sm text-red-700">Không tải được bảng thành phần.</p>
  if (!detail) return <p className="mt-2 text-sm text-slate-500">Đang tải…</p>
  return (
    <div className="mt-2 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
      <ol className="flex flex-wrap gap-x-1">
        {detail.ingredients.map((i) => (
          <li key={i.position} className={i.groups.length ? 'font-semibold text-rose-700' : undefined}>
            {i.raw_name}
            {i.position < detail.ingredients.length && ','}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-slate-500">
        {VERIFICATION_LABELS[detail.verification_status] ?? detail.verification_status}
        {detail.source_url && (
          <>
            {' · '}
            <a href={detail.source_url} target="_blank" rel="noreferrer" className="hover:text-rose-700 hover:underline">
              Lấy từ trang của hãng
              {detail.source_retrieved_at && ` (${new Date(detail.source_retrieved_at).toLocaleDateString('vi-VN')})`}
            </a>
          </>
        )}
      </p>
    </div>
  )
}
