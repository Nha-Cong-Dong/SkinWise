import { api, type ProductDetail } from '../../api'
import { APPLICATION_LABELS, VERIFICATION_LABELS } from '../../labels'
import { href } from '../../router'
import { statusOf, useLoad } from '../../useLoad'
import { GroupChips } from '../GroupChips'
import { IngredientList } from '../IngredientList'
import { PostListView } from './BlogList'
import { usePostList, type PostListHandle } from './hooks'
import { DemoFooter, LoadError, Loading, primary, textLink } from './parts'

/** #/san-pham/<id>: the ingredient list of a catalogue product, and the reviews of it. */
export function ProductPage({ id }: { id: number }) {
  const { state: loaded, retry } = useLoad(`product:${id}`, () => api.product(id))
  const reviews = usePostList({ product_id: id, sort: 'new' })
  const state =
    loaded.kind === 'ready'
      ? { kind: 'ready' as const, product: loaded.value }
      : loaded.kind === 'error' && statusOf(loaded.error) === 404
        ? { kind: 'missing' as const }
        : loaded.kind === 'error'
          ? { kind: 'error' as const }
          : { kind: 'loading' as const }

  return (
    <div className="space-y-8">
      {state.kind === 'loading' && <Loading />}
      {state.kind === 'missing' && <p className="text-sm text-ink-soft">Không tìm thấy sản phẩm này trong danh sách của SkinWise.</p>}
      {state.kind === 'error' && <LoadError onRetry={retry}>Không tải được sản phẩm.</LoadError>}
      {state.kind === 'ready' && <ProductHeader product={state.product} />}

      <section aria-labelledby="reviews-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="reviews-title" className="text-xl font-bold">
            Bài review về sản phẩm này
          </h2>
          {state.kind === 'ready' && (
            <a href={href({ page: 'write', product: id })} className={primary}>
              Viết bài về sản phẩm này
            </a>
          )}
        </div>
        <AverageRating list={reviews} />
        <div className="mt-4">
          <PostListView list={reviews} empty="Chưa có bài review nào." />
        </div>
      </section>

      {state.kind === 'ready' && (
        <section aria-labelledby="ingredients-title" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 id="ingredients-title" className="text-lg font-bold">
            Bảng thành phần
          </h2>
          <p className="mt-1 mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-mute">
            {state.product.application && (
              <span>Sản phẩm {APPLICATION_LABELS[state.product.application].toLowerCase()}</span>
            )}
            <span>{VERIFICATION_LABELS[state.product.verification_status] ?? state.product.verification_status}</span>
            {state.product.source_url && (
              <a href={state.product.source_url} target="_blank" rel="noreferrer" className={textLink}>
                Lấy từ trang của hãng
                {state.product.source_retrieved_at &&
                  ` (${new Date(state.product.source_retrieved_at).toLocaleDateString('vi-VN')})`}
              </a>
            )}
          </p>
          <IngredientList ingredients={state.product.ingredients} onePercentMarker={state.product.one_percent_marker} />
        </section>
      )}
      <DemoFooter />
    </div>
  )
}

function ProductHeader({ product }: { product: ProductDetail }) {
  return (
    <header>
      <p className="text-sm text-ink-mute">{product.brand}</p>
      <h1 className="text-2xl leading-tight font-bold text-pretty">{product.name}</h1>
      <div className="mt-2">
        <GroupChips codes={product.groups} empty="Không có hoạt chất trong danh sách SkinWise theo dõi" />
      </div>
    </header>
  )
}

/** The mean rating over every visible post of this product that has one (from the server). */
function AverageRating({ list }: { list: PostListHandle }) {
  if (list.state.kind !== 'ready' || list.state.ratingAvg === null || list.state.ratingCount === 0) return null
  return (
    <p className="mt-2 text-sm text-ink-soft">
      Điểm trung bình người viết chấm:{' '}
      <span className="font-semibold text-ink">
        {list.state.ratingAvg.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}/5
      </span>{' '}
      (từ {list.state.ratingCount} bài có chấm điểm). Đây là cảm nhận của người viết, không phải đánh giá của SkinWise.
    </p>
  )
}
