import type { ReactNode } from 'react'
import { imageSrc, type Disclosure, type PostSummary, type SkinType } from '../../api'
import { ago, formatDate } from '../../blog'
import { DISCLOSURE_LABELS, SKIN_TYPE_LABELS } from '../../labels'
import { href } from '../../router'
import { BlogIcon } from './icons'


export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span
      className={`tracking-[1px] whitespace-nowrap text-ink ${className ?? 'text-sm'}`}
      role="img"
      aria-label={`${rating} trên 5 điểm`}
      title={`${rating}/5`}
    >
      <span aria-hidden="true">
        {'★'.repeat(rating)}
        <span className="text-ink-soft">{'☆'.repeat(5 - rating)}</span>
      </span>
    </span>
  )
}

export function SkinChip({ skin }: { skin: SkinType }) {
  return <span className="text-xs whitespace-nowrap text-ink-soft">{SKIN_TYPE_LABELS[skin]}</span>
}

/** "Được tặng" / "Có tài trợ": shown wherever the post is; a bought product needs no tag. */
export function DisclosureTag({ disclosure }: { disclosure: Disclosure }) {
  if (disclosure === 'none') return null
  return (
    <span className="inline-flex items-center rounded-sm border border-dashed border-ink-soft px-1.5 text-xs leading-relaxed font-semibold whitespace-nowrap text-ink-soft">
      {DISCLOSURE_LABELS[disclosure]}
    </span>
  )
}

/** The first letter of a nickname in a circle (no photos of people). `null`: a comment no longer shown. */
export function Avatar({ handle, size = 'md' }: { handle: string | null; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold uppercase ${
        size === 'sm' ? 'size-7 text-xs' : 'size-9 text-sm'
      } ${handle ? 'bg-wash text-primary' : 'border border-dashed border-line bg-surface text-ink-mute'}`}
    >
      {handle ? handle.slice(0, 1) : ''}
    </span>
  )
}

/** A date as "3 ngày" with the full date on hover. */
export function When({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={formatDate(iso)}>
      {ago(iso)}
    </time>
  )
}

const productNames = (post: PostSummary) => post.products.map((p) => (p.brand ? `${p.brand} ${p.name}` : p.name)).join(' · ')

/** One post in a list: who, title, the start of the text, its products, likes and comments. */
export function PostRow({ post }: { post: PostSummary }) {
  const link = href({ page: 'post', id: post.id })
  return (
    <li className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 border-b border-line py-5 last:border-b-0">
      <Avatar handle={post.author.handle} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-0.5">
          <a href={href({ page: 'author', handle: post.author.handle })} className="inline-flex min-h-11 items-center md:min-h-0 font-semibold break-all text-ink hover:underline">
            {post.author.handle}
          </a>
          <span className="text-xs whitespace-nowrap text-ink-soft">
            {post.skin_type && `${SKIN_TYPE_LABELS[post.skin_type]} · `}
            <When iso={post.created_at} />
          </span>
          <DisclosureTag disclosure={post.disclosure} />
        </p>
        <h3 className="text-[1.0625rem] leading-snug font-semibold text-pretty">
          <a href={link} className="flex min-h-11 items-center hover:text-primary md:block md:min-h-0">
            {post.title}
          </a>
        </h3>
        <p className="line-clamp-3 text-sm leading-relaxed break-words text-ink">{post.excerpt}</p>
        {post.cover && (
          <a href={link} className="mt-1 block max-w-md overflow-hidden rounded-md border border-line">
            <img
              src={imageSrc(post.cover)}
              alt={post.cover.caption || 'Ảnh 1 của bài viết'}
              width={post.cover.width}
              height={post.cover.height}
              loading="lazy"
              className="aspect-[16/9] w-full bg-paper object-cover"
            />
          </a>
        )}
        {(post.products.length > 0 || post.rating !== null || post.has_routine) && (
          <div className="mt-1 flex flex-col gap-0.5 rounded-md border border-line bg-surface px-3.5 py-2.5">
            <span className="text-xs text-ink-soft">Sản phẩm trong bài</span>
            {post.products.length > 0 && <span className="line-clamp-2 text-sm">{productNames(post)}</span>}
            {(post.rating !== null || post.has_routine) && (
              <span className="flex flex-wrap items-center gap-2">
                {post.rating !== null && <Stars rating={post.rating} />}
                {post.has_routine && (
                  <span className="rounded-full bg-thistle/40 px-2 text-xs leading-relaxed font-semibold text-thistle-ink">
                    Có lịch dùng
                  </span>
                )}
              </span>
            )}
          </div>
        )}
        <p className="-ml-2.5 flex gap-1 text-xs text-ink-soft">
          <span className="inline-flex min-h-9 items-center gap-1.5 px-2.5">
            <BlogIcon name="heart" className="size-[1.125rem]" />
            <span className="sr-only">Lượt thích:</span> {post.like_count}
          </span>
          <a href={link} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2.5 md:min-h-9 hover:bg-thistle/25 hover:text-ink">
            <BlogIcon name="comment" className="size-[1.125rem]" />
            <span className="sr-only">Bình luận:</span> {post.comment_count}
          </a>
        </p>
      </div>
    </li>
  )
}

/** A list of posts in one card (the design's "stream"). */
export function PostGrid({ posts }: { posts: PostSummary[] }) {
  return (
    <ul className="rounded-md border border-line bg-surface px-4 sm:px-6">
      {posts.map((p) => (
        <PostRow key={p.id} post={p} />
      ))}
    </ul>
  )
}

export function Loading({ children = 'Đang tải…' }: { children?: ReactNode }) {
  return (
    <p className="text-sm text-ink-mute" role="status">
      {children}
    </p>
  )
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
  return <p className="mt-10 text-xs text-ink-mute">Bản demo: mọi bài viết và tài khoản ở đây là dữ liệu mẫu.</p>
}
