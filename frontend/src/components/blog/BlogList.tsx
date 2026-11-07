import { useState, type FormEvent } from 'react'
import { api, type PostQuery, type SkinType } from '../../api'
import { SEARCH_MAX, SEARCH_MIN } from '../../blog'
import { useGroupName } from '../../groups'
import { SKIN_TYPE_LABELS } from '../../labels'
import { PROFILE_LOAD_ERROR, useProfile } from '../../profile'
import { href, navigate, type BlogFilter, type BlogView } from '../../router'
import { useLoad } from '../../useLoad'
import { Notice } from '../Notice'
import { segBox, segOption } from '../ui'
import { usePostList, type PostListHandle } from './hooks'
import { BlogIcon } from './icons'
import { DemoFooter, LoadError, Loading, PostGrid } from './parts'
import { field, primary, quiet, secondary, small, textLink } from './styles'
import { BlogShell } from './Shell'

export function PostListView({ list, empty }: { list: PostListHandle; empty: string }) {
  const { state, loadMore, retry } = list
  if (state.kind === 'loading' || state.kind === 'idle') return <Loading />
  if (state.kind === 'error') {
    return state.status === 422 ? (
      <Notice>Hãy gõ từ {SEARCH_MIN} đến {SEARCH_MAX} chữ cái hoặc chữ số để tìm.</Notice>
    ) : (
      <LoadError onRetry={retry}>Không tải được danh sách bài review.</LoadError>
    )
  }
  if (state.items.length === 0) return <Notice>{empty}</Notice>
  return (
    <div>
      <PostGrid posts={state.items} />
      {state.items.length < state.total && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <button onClick={loadMore} disabled={state.more === 'loading'} className={secondary}>
            {state.more === 'loading' ? 'Đang tải…' : 'Xem thêm'}
          </button>
          {state.more === 'error' && <p className="text-sm text-avoid-ink">Không tải được thêm bài.</p>}
        </div>
      )}
    </div>
  )
}

const TITLES: Record<BlogView, string> = {
  all: 'Dành cho bạn',
  mine: 'Bài của tôi',
  liked: 'Đã thích',
  'same-skin': 'Cùng loại da với tôi',
}

/** Shown at the bottom of the rail of every list: what a review is, and is not. */
function AboutReviews() {
  return (
    <p className="text-xs leading-relaxed text-ink-soft">
      Đánh giá là trải nghiệm cá nhân, không phải thông tin đã kiểm chứng. Cuối mỗi bài, SkinWise gắn phần thông tin có
      nguồn về các sản phẩm đó.
    </p>
  )
}

/** #/blog: every visible post, or a shortcut (mine, liked, my skin type), with search and filters. */
export function BlogListPage({ filter }: { filter: BlogFilter }) {
  const profile = useProfile()
  const view = filter.view ?? 'all'
  const q = filter.q ?? null
  const group = filter.group ?? null
  const me = profile.state.kind === 'ready' ? profile.state.profile : null

  // The part of the query that comes from the shortcut; null while the profile it needs is unknown.
  let base: PostQuery | null = {}
  let blocked: 'profile-loading' | 'profile-error' | 'no-handle' | 'no-skin' | null = null
  if (view === 'liked') base = { liked: true }
  if (view === 'mine' || view === 'same-skin') {
    if (profile.state.kind === 'loading') blocked = 'profile-loading'
    else if (profile.state.kind === 'error') blocked = 'profile-error'
    else if (view === 'mine' && !me?.handle) blocked = 'no-handle'
    else if (view === 'same-skin' && !me?.skin_type) blocked = 'no-skin'
    else base = view === 'mine' ? { author: me?.handle ?? undefined } : { skin_type: me?.skin_type ?? undefined }
  }
  const skin = view === 'same-skin' ? null : filter.skin // the shortcut already sets the skin type
  const query: PostQuery | null =
    blocked !== null || base === null
      ? null
      : {
          ...base,
          ...(skin ? { skin_type: skin } : {}),
          ...(filter.product !== null ? { product_id: filter.product } : {}),
          ...(group ? { group } : {}),
          ...(q ? { q } : {}),
          sort: filter.sort,
        }
  const list = usePostList(query)
  const filtered = skin !== null || filter.product !== null || group !== null
  const to = (change: Partial<BlogFilter>) => href({ page: 'blog', filter: { ...filter, ...change } })

  const empty = q
    ? `Không tìm thấy bài review nào khớp “${q}”.`
    : view === 'mine'
      ? 'Bạn chưa viết bài review nào.'
      : view === 'liked'
        ? 'Bạn chưa thích bài review nào.'
        : filtered
          ? 'Chưa có bài review nào khớp bộ lọc.'
          : view === 'same-skin'
            ? 'Chưa có bài review nào của người cùng loại da với bạn.'
            : 'Chưa có bài review nào.'

  return (
    <BlogShell
      spot={view}
      title={TITLES[view]}
      lead={
        view === 'same-skin' && me?.skin_type ? (
          <>Bài của người ghi loại da: {SKIN_TYPE_LABELS[me.skin_type]}.</>
        ) : view === 'mine' ? (
          'Chỉ gồm bài đang hiển thị với mọi người. Bài đang chờ duyệt hay tạm ẩn có thông báo ở mục Hoạt động.'
        ) : undefined
      }
      rail={
        <>
          <SearchBox key={q ?? ''} filter={filter} />
          <Trending filter={filter} />
          <Filters filter={filter} to={to} />
          <AboutReviews />
        </>
      }
    >
      {view === 'all' && !q && !filtered && <Compose />}
      <ActiveFilters filter={filter} to={to} />
      {blocked === 'profile-loading' && <Loading />}
      {blocked === 'profile-error' && <LoadError onRetry={profile.reload}>{PROFILE_LOAD_ERROR}</LoadError>}
      {blocked === 'no-handle' && (
        <ProfileNeeded onEdit={profile.edit} button="Đặt biệt danh">
          Bạn chưa đặt biệt danh nên chưa có bài nào. Cần biệt danh để viết bài và bình luận.
        </ProfileNeeded>
      )}
      {blocked === 'no-skin' && (
        <ProfileNeeded onEdit={profile.edit} button="Thêm loại da vào hồ sơ">
          Hồ sơ của bạn chưa ghi loại da. Thêm loại da để xem bài của người cùng loại da (ai đọc bài của bạn cũng thấy loại
          da này).
        </ProfileNeeded>
      )}
      {blocked === null && <PostListView list={list} empty={empty} />}
      <DemoFooter />
    </BlogShell>
  )
}

function ProfileNeeded({ children, button, onEdit }: { children: string; button: string; onEdit: () => void }) {
  return (
    <div className="space-y-3 rounded-md border border-line bg-surface p-4 text-sm leading-relaxed text-ink-soft">
      <p>{children}</p>
      <button onClick={onEdit} className={secondary}>
        {button}
      </button>
    </div>
  )
}

/** "Bạn đã dùng sản phẩm gì gần đây?": a shortcut to the post form. */
function Compose() {
  const profile = useProfile()
  const handle = profile.state.kind === 'ready' ? profile.state.profile.handle : null
  return (
    <a
      href={href({ page: 'write', product: null })}
      className="mb-4 flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-3 hover:border-primary/40"
    >
      <span
        aria-hidden="true"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-wash text-sm font-semibold text-primary uppercase"
      >
        {handle ? handle.slice(0, 1) : <BlogIcon name="pen" className="size-4" />}
      </span>
      <span className="min-w-0 flex-1 text-sm text-ink-soft">Bạn đã dùng sản phẩm gì gần đây?</span>
      <span className={`${primary} ${small}`}>Viết bài</span>
    </a>
  )
}

/** Search box: posts by title, text and product names (the server ranks them). */
function SearchBox({ filter }: { filter: BlogFilter }) {
  const [text, setText] = useState(filter.q ?? '')
  const [short, setShort] = useState(false)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const q = text.trim()
    if (q.length < SEARCH_MIN) {
      setShort(true)
      return
    }
    navigate({ page: 'blog', filter: { ...filter, q: q.slice(0, SEARCH_MAX), product: null, group: null } })
  }
  return (
    <form role="search" onSubmit={submit}>
      <label className="relative block">
        <span className="sr-only">Tìm bài review theo sản phẩm, hoạt chất</span>
        <BlogIcon name="search" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-soft" />
        <input
          type="search"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setShort(false)
          }}
          maxLength={SEARCH_MAX}
          placeholder="Tìm sản phẩm, hoạt chất"
          className={`${field} min-h-11 rounded-full pl-11`}
        />
      </label>
      {short && <p className="mt-1.5 text-xs text-ink-soft">Gõ ít nhất {SEARCH_MIN} ký tự rồi nhấn Enter.</p>}
    </form>
  )
}

/** "Đang được bàn": catalogue products and groups with several posts this week. Names only, no description. */
function Trending({ filter }: { filter: BlogFilter }) {
  const { state, retry } = useLoad('blog-trending', () => api.trending(7))
  const items = state.kind === 'ready' ? state.value : []
  const target = (product: number | null, group: string | null) =>
    href({ page: 'blog', filter: { ...filter, product, group, q: null } })
  return (
    <section aria-labelledby="trending-title">
      <h2 id="trending-title" className="text-base font-bold">
        Đang được bàn
      </h2>
      <p className="mt-0.5 text-xs text-ink-soft">Sản phẩm và nhóm hoạt chất có nhiều bài trong 7 ngày qua</p>
      {state.kind === 'loading' && (
        <div className="mt-2">
          <Loading />
        </div>
      )}
      {state.kind === 'error' && (
        <div className="mt-2">
          <LoadError onRetry={retry}>Không tải được.</LoadError>
        </div>
      )}
      {state.kind === 'ready' && items.length === 0 && (
        <p className="mt-2 text-xs text-ink-soft">Tuần này chưa có sản phẩm hay hoạt chất nào có từ 2 bài trở lên.</p>
      )}
      {items.length > 0 && (
        <ul className="relative mt-1 flex gap-2 overflow-x-auto pb-1 @5xl:block @5xl:overflow-visible @5xl:pb-0">
          {items.map((t) => {
            const on = t.kind === 'product' ? filter.product === t.product_id : (filter.group ?? null) === t.group
            return (
              <li key={`${t.kind}:${t.product_id ?? t.group}`} className="shrink-0 @5xl:border-b @5xl:border-line @5xl:last:border-b-0">
                <a
                  href={target(t.kind === 'product' ? t.product_id : null, t.kind === 'group' ? t.group : null)}
                  aria-current={on ? 'true' : undefined}
                  className={`group relative flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm @5xl:flex-col @5xl:items-start @5xl:gap-1 @5xl:rounded-none @5xl:border-0 @5xl:px-0 @5xl:py-3 ${
                    on ? 'border-primary/30 bg-wash @5xl:bg-transparent' : 'border-line bg-surface @5xl:bg-transparent'
                  }`}
                >
                  <span className={`leading-snug font-semibold whitespace-nowrap group-hover:text-primary @5xl:whitespace-normal ${on ? 'text-primary' : ''}`}>
                    {t.kind === 'group' && <span className="sr-only">Hoạt chất: </span>}
                    {t.label_vi}
                  </span>
                  <span className="rounded-full bg-paper px-2 text-xs leading-relaxed font-semibold whitespace-nowrap text-ink-soft">
                    {t.post_count} bài
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** "Lọc bài": skin type, newest or most liked. */
function Filters({ filter, to }: { filter: BlogFilter; to: (change: Partial<BlogFilter>) => string }) {
  const sameSkin = filter.view === 'same-skin'
  return (
    <section aria-labelledby="filter-title">
      <h2 id="filter-title" className="text-base font-bold">
        Lọc bài
      </h2>
      {!sameSkin && (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo loại da">
          {([null, ...Object.keys(SKIN_TYPE_LABELS)] as (SkinType | null)[]).map((skin) => {
            const on = filter.skin === skin
            return (
              <a
                key={skin ?? 'all'}
                href={to({ skin })}
                aria-current={on ? 'true' : undefined}
                className={`motion-press inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm @3xl:min-h-9 ${
                  on ? 'border-primary bg-primary font-semibold text-surface' : 'border-line bg-surface text-ink hover:bg-thistle/25'
                }`}
              >
                {skin ? SKIN_TYPE_LABELS[skin] : 'Mọi loại da'}
              </a>
            )
          })}
        </div>
      )}
      {filter.q ? (
        <p className="mt-3 text-xs text-ink-soft">Khi tìm, bài khớp nhất đứng trước.</p>
      ) : (
        <div className={`mt-3 ${segBox}`} role="group" aria-label="Sắp xếp">
          {(
            [
              ['new', 'Mới nhất'],
              ['top', 'Nhiều thích'],
            ] as const
          ).map(([sort, label]) => (
            <a key={sort} href={to({ sort })} aria-current={filter.sort === sort ? 'true' : undefined} className={segOption(filter.sort === sort)}>
              {label}
            </a>
          ))}
        </div>
      )}
    </section>
  )
}

/** What the list is narrowed to (search, product, group), each with a way out. */
function ActiveFilters({ filter, to }: { filter: BlogFilter; to: (change: Partial<BlogFilter>) => string }) {
  const groupName = useGroupName()
  const q = filter.q ?? null
  const group = filter.group ?? null
  if (!q && filter.product === null && !group) return null
  return (
    <div className="mb-4 space-y-2 text-sm text-ink-soft">
      {q && (
        <p className="flex flex-wrap items-center gap-2">
          <span>
            Kết quả tìm “<span className="font-semibold text-ink">{q}</span>”
          </span>
          <a href={to({ q: null })} className={`${quiet} min-h-9`}>
            Xoá tìm kiếm
          </a>
        </p>
      )}
      {filter.product !== null && <ProductFilter id={filter.product} clear={to({ product: null })} />}
      {group && (
        <div>
          <p className="flex flex-wrap items-center gap-2">
            <span>
              Bài có sản phẩm thuộc nhóm <span className="font-semibold text-ink">{groupName(group)}</span>
            </span>
            <a href={to({ group: null })} className={`${quiet} min-h-9`}>
              Bỏ lọc nhóm
            </a>
          </p>
          <p className="text-xs">Chỉ tính sản phẩm có trong danh sách của SkinWise, không tính bảng thành phần người viết tự dán.</p>
        </div>
      )}
    </div>
  )
}

function ProductFilter({ id, clear }: { id: number; clear: string }) {
  const { state } = useLoad(`product:${id}`, () => api.product(id))
  const product = state.kind === 'ready' ? state.value : null
  return (
    <p className="flex flex-wrap items-center gap-2">
      <span>
        Chỉ hiện bài về:{' '}
        <a href={href({ page: 'product', id })} className={`font-semibold ${textLink}`}>
          {product ? `${product.brand} ${product.name}` : `sản phẩm số ${id}`}
        </a>
      </span>
      <a href={clear} className={`${quiet} min-h-9`}>
        Bỏ lọc sản phẩm
      </a>
    </p>
  )
}

/** #/blog/da-luu: posts the user saved. */
export function SavedPage() {
  const list = usePostList({ saved: true, sort: 'new' })
  return (
    <BlogShell spot="saved" title="Đã lưu">
      <PostListView list={list} empty="Bạn chưa lưu bài review nào." />
      <DemoFooter />
    </BlogShell>
  )
}
