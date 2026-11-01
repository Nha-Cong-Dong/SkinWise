import { useEffect, useState } from 'react'
import { api, type Ingredient, type InciAnalysis, type PostDetail, type PostProductOut, type ProductDetail } from '../../api'
import { AUTHOR_NAMED, portableCheckRequest, portableProducts } from '../../blog'
import { href } from '../../router'
import type { CheckState } from '../../routine'
import type { PortableRoutine } from '../../share'
import { useLoad } from '../../useLoad'
import { GroupChips } from '../GroupChips'
import { IngredientList } from '../IngredientList'
import { DataNote, Notice } from '../Notice'
import { WarningsPanel } from '../WarningsPanel'
import { LoadError, Loading, textLink } from './parts'

/**
 * "Thông tin có nguồn (SkinWise)": built only from the product, ingredient and routine-check
 * routes, from the products and routine attached to the post. The post's words are never sent.
 */
export function SourcedInfo({ post }: { post: PostDetail }) {
  return (
    <section aria-labelledby="sourced-title" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 id="sourced-title" className="text-lg font-bold">
        Thông tin có nguồn (SkinWise)
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-mute">
        Phân tích tự động từ bảng thành phần và các luật đã được người duyệt đối chiếu với nguồn. Không phụ thuộc nội
        dung bài viết.
      </p>
      <ul className="mt-4 divide-y divide-line">
        {post.products.map((p) => (
          <ProductAnalysis key={p.position} product={p} />
        ))}
      </ul>
      <div className="mt-5 border-t border-line pt-5">
        {post.routine ? (
          <RoutineAnalysis routine={post.routine} />
        ) : (
          <Notice>Bài viết không kèm routine nên SkinWise không kiểm tra kết hợp giữa các sản phẩm.</Notice>
        )}
      </div>
    </section>
  )
}

type Analysis =
  | { kind: 'loading' }
  | { kind: 'error'; missing: boolean }
  | { kind: 'seeded'; detail: ProductDetail }
  | { kind: 'pasted'; analysis: InciAnalysis }

function ProductAnalysis({ product }: { product: PostProductOut }) {
  const [state, setState] = useState<Analysis>({ kind: 'loading' })
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const done = (next: Analysis) => !cancelled && setState(next)
    const failed = (e: unknown) => done({ kind: 'error', missing: (e as { status?: number }).status === 404 })
    if (product.product_id !== null) {
      api.product(product.product_id).then((detail) => done({ kind: 'seeded', detail }), failed)
    } else {
      api.analyzeInci(product.inci ?? '').then((analysis) => done({ kind: 'pasted', analysis }), failed)
    }
    return () => {
      cancelled = true
    }
  }, [product.product_id, product.inci, attempt])

  const ingredients: Ingredient[] =
    state.kind === 'seeded' ? state.detail.ingredients : state.kind === 'pasted' ? state.analysis.ingredients : []
  const allergens = ingredients.filter((i) => i.fragrance_allergen).length

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <p className="leading-snug">
        <span className="block text-xs text-ink-mute">{product.brand ?? 'Bảng thành phần người viết tự dán'}</span>
        <span className="text-sm font-medium">{product.name}</span>
        {product.product_id === null && <span className="text-xs text-ink-mute"> ({AUTHOR_NAMED})</span>}
      </p>
      <div className="mt-1.5 text-sm">
        {state.kind === 'loading' && <Loading>Đang phân tích…</Loading>}
        {state.kind === 'error' && (
          <LoadError onRetry={state.missing ? undefined : () => setAttempt((n) => n + 1)}>
            {state.missing ? 'Sản phẩm này không còn trong danh sách của SkinWise.' : 'Không phân tích được sản phẩm này.'}
          </LoadError>
        )}
        {(state.kind === 'seeded' || state.kind === 'pasted') && (
          <div className="space-y-1.5">
            <GroupChips
              codes={state.kind === 'seeded' ? state.detail.groups : state.analysis.groups}
              empty="Không có hoạt chất trong danh sách SkinWise theo dõi"
            />
            <p className="flex flex-wrap gap-x-3 text-xs text-ink-soft">
              <span>
                {allergens > 0
                  ? `${allergens} chất gây dị ứng hương liệu theo danh sách EU (chỉ để thông tin)`
                  : 'Bảng thành phần không ghi tên chất nào trong danh sách chất gây dị ứng hương liệu của EU (EU chỉ bắt ghi khi vượt ngưỡng).'}
              </span>
              {state.kind === 'seeded' ? (
                <a href={href({ page: 'product', id: state.detail.id })} className={textLink}>
                  Xem bảng thành phần
                </a>
              ) : (
                <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`text-link ${textLink}`}>
                  {open ? 'Ẩn bảng thành phần' : 'Xem bảng thành phần'}
                </button>
              )}
            </p>
            {state.kind === 'pasted' &&
              state.analysis.notices.map((n) => (
                <DataNote key={n.code} title="Lưu ý về bảng thành phần tự dán">
                  {n.message_vi}
                </DataNote>
              ))}
            {state.kind === 'pasted' && open && (
              <div className="pt-2">
                <IngredientList
                  ingredients={state.analysis.ingredients}
                  onePercentMarker={state.analysis.one_percent_marker}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

/** The attached routine through /routine/check, shown like the routine page's results. */
function RoutineAnalysis({ routine }: { routine: PortableRoutine }) {
  const request = portableCheckRequest(routine)
  const body = JSON.stringify(request)
  const empty = request.items.length === 0
  // Catalogue names for the routine's catalogue products; the author's names are never shown for them.
  const ids = [...new Set(routine.products.flatMap((p) => (p.productId !== undefined ? [p.productId] : [])))]
  const names = useLoad(ids.length ? `names:${ids.join(',')}` : null, () =>
    Promise.all(
      ids.map((id) =>
        api.product(id).then(
          (d) => [id, `${d.brand} ${d.name}`] as const,
          () => null, // gone or unreachable: "Sản phẩm số …"
        ),
      ),
    ),
  )
  const catalogue = new Map(names.state.kind === 'ready' ? names.state.value.filter((x) => x !== null) : [])
  const { state: loaded, retry } = useLoad(empty ? null : body, (signal) => api.checkRoutine(JSON.parse(body), signal))
  const state: CheckState =
    loaded.kind === 'idle'
      ? { kind: 'empty' }
      : loaded.kind === 'ready'
        ? { kind: 'done', result: loaded.value }
        : loaded.kind === 'error'
          ? { kind: 'error', message: (loaded.error as Error).message ?? '' }
          : { kind: 'loading', previous: null }

  if (state.kind === 'empty') {
    return <Notice>Routine kèm theo chưa có bước nào nên SkinWise không kiểm tra kết hợp giữa các sản phẩm.</Notice>
  }
  const groups = new Map((state.kind === 'done' ? state.result.products : []).map((p) => [p.key, p.groups]))
  return (
    <div>
      <p className="mb-3 text-sm text-ink-soft">Kiểm tra routine người viết đính kèm:</p>
      <WarningsPanel state={state} products={portableProducts(routine, groups, catalogue)} />
      {state.kind === 'error' && (
        <button onClick={retry} className="mt-2 text-sm text-link underline underline-offset-2">
          Thử lại
        </button>
      )}
    </div>
  )
}
