import { api, type SkinType } from '../../api'
import { SKIN_TYPE_LABELS } from '../../labels'
import { useLoad } from '../../useLoad'
import { ALL_POSTS, href, type BlogFilter } from '../../router'
import { Notice } from '../Notice'
import { usePostList, type PostListHandle } from './hooks'
import { DemoFooter, LoadError, Loading, PostGrid, primary, quiet } from './parts'

export function PostListView({
  list,
  empty,
}: {
  list: PostListHandle
  empty: string
}) {
  const { state, loadMore, retry } = list
  if (state.kind === 'loading') return <Loading />
  if (state.kind === 'error') return <LoadError onRetry={retry}>Không tải được danh sách bài review.</LoadError>
  if (state.items.length === 0) return <Notice>{empty}</Notice>
  return (
    <div>
      <PostGrid posts={state.items} />
      {state.items.length < state.total && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <button onClick={loadMore} disabled={state.more === 'loading'} className={quiet}>
            {state.more === 'loading' ? 'Đang tải…' : 'Xem thêm'}
          </button>
          {state.more === 'error' && <p className="text-sm text-avoid-ink">Không tải được thêm bài.</p>}
        </div>
      )}
    </div>
  )
}

function Tabs({ saved }: { saved: boolean }) {
  return (
    <nav className="flex gap-1 rounded-full bg-surface p-1 text-sm ring-1 ring-line" aria-label="Danh sách bài">
      {(
        [
          [false, 'Tất cả bài', href(ALL_POSTS)],
          [true, 'Đã lưu', href({ page: 'saved' })],
        ] as const
      ).map(([value, label, link]) => (
        <a
          key={label}
          href={link}
          aria-current={saved === value ? 'page' : undefined}
          className={`rounded-full px-3.5 py-1.5 ${saved === value ? 'bg-primary font-medium text-surface' : 'text-ink-soft hover:text-ink'}`}
        >
          {label}
        </a>
      ))}
    </nav>
  )
}

function Header({ saved }: { saved: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">Review cộng đồng</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Cảm nhận của người dùng về sản phẩm họ đã dùng. Cuối mỗi bài, SkinWise gắn phần thông tin có nguồn về các sản
          phẩm đó.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Tabs saved={saved} />
        <a href={href({ page: 'write', product: null })} className={primary}>
          Viết bài
        </a>
      </div>
    </div>
  )
}

/** #/blog: every visible post, filtered by skin type (and product), newest or most liked first. */
export function BlogListPage({ filter }: { filter: BlogFilter }) {
  const list = usePostList({
    skin_type: filter.skin ?? undefined,
    product_id: filter.product ?? undefined,
    sort: filter.sort,
  })
  const filtered = filter.skin !== null || filter.product !== null
  const to = (change: Partial<BlogFilter>) => href({ page: 'blog', filter: { ...filter, ...change } })

  return (
    <div>
      <Header saved={false} />
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo loại da">
          {([null, ...Object.keys(SKIN_TYPE_LABELS)] as (SkinType | null)[]).map((skin) => (
            <a
              key={skin ?? 'all'}
              href={to({ skin })}
              aria-current={filter.skin === skin ? 'true' : undefined}
              className={`rounded-full px-3 py-1 text-sm ring-1 ${
                filter.skin === skin ? 'bg-primary text-surface ring-primary' : 'bg-surface text-ink-soft ring-line hover:text-ink'
              }`}
            >
              {skin ? SKIN_TYPE_LABELS[skin] : 'Mọi loại da'}
            </a>
          ))}
        </div>
        <div className="flex gap-1 text-sm sm:ml-auto" role="group" aria-label="Sắp xếp">
          {(
            [
              ['new', 'Mới nhất'],
              ['top', 'Nhiều thích'],
            ] as const
          ).map(([sort, label]) => (
            <a
              key={sort}
              href={to({ sort })}
              aria-current={filter.sort === sort ? 'true' : undefined}
              className={`rounded-full px-3 py-1 ${filter.sort === sort ? 'font-semibold text-ink underline underline-offset-4' : 'text-ink-soft hover:text-ink'}`}
            >
              {label}
            </a>
          ))}
        </div>
      </div>
      {filter.product !== null && <ProductFilter id={filter.product} clear={to({ product: null })} />}
      <div className="mt-6">
        <PostListView list={list} empty={filtered ? 'Chưa có bài review nào khớp bộ lọc.' : 'Chưa có bài review nào.'} />
      </div>
      <DemoFooter />
    </div>
  )
}

function ProductFilter({ id, clear }: { id: number; clear: string }) {
  const { state } = useLoad(`product:${id}`, () => api.product(id))
  const product = state.kind === 'ready' ? state.value : null
  return (
    <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
      Chỉ hiện bài về:{' '}
      <a href={href({ page: 'product', id })} className="font-medium text-link underline-offset-2 hover:underline">
        {product ? `${product.brand} ${product.name}` : `sản phẩm số ${id}`}
      </a>
      <a href={clear} className="rounded-full px-2 py-0.5 text-xs ring-1 ring-line hover:bg-surface">
        Bỏ lọc sản phẩm
      </a>
    </p>
  )
}

/** #/blog/da-luu: posts the user saved. */
export function SavedPage() {
  const list = usePostList({ saved: true, sort: 'new' })
  return (
    <div>
      <Header saved />
      <div className="mt-6">
        <PostListView list={list} empty="Bạn chưa lưu bài review nào." />
      </div>
      <DemoFooter />
    </div>
  )
}
