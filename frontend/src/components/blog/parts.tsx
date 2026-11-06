import type { ReactNode } from 'react'
import { imageSrc, type Disclosure, type PostSummary, type SkinType } from '../../api'
import { formatDate } from '../../blog'
import { DISCLOSURE_LABELS, SKIN_TYPE_LABELS } from '../../labels'
import { href } from '../../router'

export const field =
  'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[0.9375rem] placeholder:text-ink-mute/80 focus:border-link focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-link/20'
export const primary = 'rounded-full bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-link disabled:opacity-40'
export const secondary =
  'rounded-full px-4 py-2 text-sm font-medium text-ink ring-1 ring-ink hover:bg-paper disabled:opacity-40'
export const quiet = 'rounded-full px-3 py-1.5 text-sm text-ink-soft ring-1 ring-line hover:bg-paper hover:text-ink disabled:opacity-40'
export const textLink = 'text-link underline-offset-2 hover:underline'

export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={`tracking-tight whitespace-nowrap text-ink ${className ?? ''}`} aria-label={`${rating}/5 sao`} title={`${rating}/5`}>
      <span aria-hidden="true">
        {'★'.repeat(rating)}
        <span className="text-ink-mute/40">{'★'.repeat(5 - rating)}</span>
      </span>
    </span>
  )
}

export function SkinChip({ skin }: { skin: SkinType }) {
  return (
    <span className="rounded-full bg-paper px-2 py-px text-xs text-ink-soft ring-1 ring-line">{SKIN_TYPE_LABELS[skin]}</span>
  )
}

/** "Được tặng" / "Có tài trợ": shown wherever the post is; a bought product needs no tag. */
export function DisclosureTag({ disclosure }: { disclosure: Disclosure }) {
  if (disclosure === 'none') return null
  return (
    <span className="rounded-full border border-dashed border-ink-mute px-2 py-px text-xs font-medium text-ink">
      {DISCLOSURE_LABELS[disclosure]}
    </span>
  )
}

export function PostCard({ post }: { post: PostSummary }) {
  return (
    <li>
      <a
        href={href({ page: 'post', id: post.id })}
        className="flex h-full flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-line hover:ring-ink-mute"
      >
        {post.cover && (
          <img
            src={imageSrc(post.cover)}
            alt={post.cover.caption || 'Ảnh 1 của bài viết'}
            width={post.cover.width}
            height={post.cover.height}
            loading="lazy"
            className="aspect-[16/9] w-full bg-paper object-cover"
          />
        )}
        <div className="flex flex-1 flex-col p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {post.rating !== null && <Stars rating={post.rating} className="text-sm" />}
            {post.skin_type && <SkinChip skin={post.skin_type} />}
            <DisclosureTag disclosure={post.disclosure} />
          </div>
          <h3 className="mt-2 text-base leading-snug font-semibold text-pretty">{post.title}</h3>
          <p className="mt-1 line-clamp-3 text-sm leading-relaxed break-words text-ink-soft">{post.excerpt}</p>
          {post.products.length > 0 && (
            <p className="mt-2 line-clamp-2 text-xs text-ink-mute">
              {post.products.map((p) => (p.brand ? `${p.brand} ${p.name}` : p.name)).join(' · ')}
            </p>
          )}
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-ink-mute">
            <span>@{post.author.handle}</span>
            <span>{formatDate(post.created_at)}</span>
            <span className="flex-1" />
            {post.has_routine && <span className="rounded-full bg-active px-2 py-px font-medium text-active-ink">Có routine</span>}
            <span aria-label={`${post.like_count} lượt thích`}>♥ {post.like_count}</span>
            <span aria-label={`${post.comment_count} bình luận`}>💬 {post.comment_count}</span>
          </div>
        </div>
      </a>
    </li>
  )
}

export function PostGrid({ posts }: { posts: PostSummary[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </ul>
  )
}

export function Loading({ children = 'Đang tải…' }: { children?: ReactNode }) {
  return <p className="text-sm text-ink-mute">{children}</p>
}

export function LoadError({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <p className="text-sm text-avoid-ink">
      {children}
      {onRetry && (
        <>
          {' '}
          <button onClick={onRetry} className="text-link underline underline-offset-2">
            Thử lại
          </button>
        </>
      )}
    </p>
  )
}

export function DemoFooter() {
  return (
    <p className="mt-10 border-t border-line pt-4 text-xs text-ink-mute">
      Bản demo: mọi bài viết và tài khoản ở đây là dữ liệu mẫu.
    </p>
  )
}
