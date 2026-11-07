import type { ReactNode } from 'react'
import { ALL_POSTS, href, type BlogView, type Route } from '../../router'
import { BlogIcon, type BlogIconName } from './icons'
import { useUnreadCount } from './unread'

/** Which shortcut of the side menu the page is; null: none (a post, a product, an author). */
export type Spot = BlogView | 'write' | 'saved' | 'activity' | null

const view = (v: BlogView): Route => ({ page: 'blog', filter: { skin: null, product: null, sort: 'new', view: v } })

const SHORTCUTS: [Exclude<Spot, null>, string, BlogIconName, Route][] = [
  ['all', 'Dành cho bạn', 'feed', ALL_POSTS],
  ['write', 'Viết bài', 'pen', { page: 'write', product: null }],
  ['activity', 'Hoạt động', 'bell', { page: 'activity' }],
  ['mine', 'Bài của tôi', 'user', view('mine')],
  ['saved', 'Đã lưu', 'bookmark', { page: 'saved' }],
  ['liked', 'Đã thích', 'heart', view('liked')],
  ['same-skin', 'Cùng loại da với tôi', 'drop', view('same-skin')],
]

function SideMenu({ spot }: { spot: Spot }) {
  const unread = useUnreadCount()
  return (
    <nav
      aria-label="Đánh giá"
      className="relative flex gap-1 overflow-x-auto pb-1 @3xl:sticky @3xl:top-6 @3xl:row-span-2 @3xl:flex-col @3xl:overflow-visible @3xl:pb-0"
    >
      {SHORTCUTS.map(([key, label, icon, route], n) => {
        const on = spot === key
        return (
          <a
            key={key}
            href={href(route)}
            aria-current={on ? 'page' : undefined}
            className={`motion-press relative flex min-h-11 shrink-0 items-center gap-2.5 rounded-full border px-3.5 text-sm whitespace-nowrap @3xl:min-h-10 @3xl:rounded-md @3xl:border-0 @3xl:px-3 @3xl:text-base ${
              n === 4 ? '@3xl:mt-3' : ''
            } ${
              on
                ? 'border-primary/20 bg-wash font-semibold text-ink'
                : 'border-line bg-surface text-ink hover:bg-thistle/25 @3xl:bg-transparent'
            }`}
          >
            <BlogIcon name={icon} filled={on && icon !== 'pen'} className={`size-5 ${on ? 'text-primary' : 'text-ink-soft'}`} />
            <span>{label}</span>
            {key === 'activity' && unread !== null && unread > 0 && (
              <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[0.6875rem] font-bold text-surface">
                {unread > 99 ? '99+' : unread}
                <span className="sr-only"> chưa đọc</span>
              </span>
            )}
          </a>
        )
      })}
    </nav>
  )
}

/**
 * The frame of every review page, after the design's three columns: shortcuts on the left, the
 * page in the middle, `rail` (search, filters…) on the right. It follows the width it is given
 * (container queries): one column, then two (the rail above the page), then three.
 */
export function BlogShell({
  spot,
  title,
  lead,
  back,
  rail,
  railLabel = 'Tìm và lọc',
  railAfter = false,
  heading = true,
  children,
}: {
  spot: Spot
  title: ReactNode
  /** false: the title is a label, the page has its own h1 (a post). */
  heading?: boolean
  lead?: ReactNode
  back?: { href: string; label: string }
  rail?: ReactNode
  railLabel?: string
  /** On narrow screens the rail comes after the page instead of before it. */
  railAfter?: boolean
  children: ReactNode
}) {
  const aside = rail && (
    <aside
      aria-label={railLabel}
      className="flex min-w-0 flex-col gap-6 @3xl:col-start-2 @5xl:sticky @5xl:top-6 @5xl:col-start-3 @5xl:row-start-1"
    >
      {rail}
    </aside>
  )
  return (
    <div className="@container">
      <div
        className={`grid items-start gap-x-8 gap-y-6 @3xl:grid-cols-[12.5rem_minmax(0,1fr)] ${
          rail ? '@5xl:grid-cols-[13rem_minmax(0,1fr)_17rem]' : '@5xl:grid-cols-[13rem_minmax(0,1fr)]'
        }`}
      >
        <SideMenu spot={spot} />
        {!railAfter && aside}
        <div className="min-w-0 @3xl:col-start-2 @5xl:row-start-1">
          <header className="mb-4 flex min-h-12 items-center gap-2">
            {back && (
              <a
                href={back.href}
                aria-label={back.label}
                title={back.label}
                className="motion-press inline-flex size-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-thistle/25"
              >
                <BlogIcon name="back" />
              </a>
            )}
            <div className="min-w-0">
              {heading ? (
                <h1 className="text-2xl leading-tight font-bold text-pretty">{title}</h1>
              ) : (
                <p className="text-lg font-bold">{title}</p>
              )}
              {lead && <div className="mt-1 text-sm text-ink-soft">{lead}</div>}
            </div>
          </header>
          {children}
        </div>
        {railAfter && aside}
      </div>
    </div>
  )
}
