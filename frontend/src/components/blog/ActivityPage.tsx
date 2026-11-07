import { useEffect, useRef } from 'react'
import { api, type ActivityItem, type NoticeKind } from '../../api'
import { href } from '../../router'
import { useLoad } from '../../useLoad'
import { Notice } from '../Notice'
import { BlogIcon, type BlogIconName } from './icons'
import { Avatar, DemoFooter, LoadError, Loading, When } from './parts'
import { BlogShell } from './Shell'
import { setUnread } from './unread'

const LIMIT = 50

/** What happened, after the person who did it ("lan_dakho đã bình luận bài của bạn"). */
const ACTED: Record<'post_commented' | 'comment_replied', string> = {
  post_commented: 'đã bình luận bài của bạn',
  comment_replied: 'đã trả lời bình luận của bạn',
}

/**
 * Likes never name who liked (the privacy policy says others do not see who liked), so these are
 * shown with no handle, avatar or author link even if the API ever sends one.
 */
const LIKED: Record<'post_liked' | 'comment_liked', string> = {
  post_liked: 'Có người đã thích bài của bạn',
  comment_liked: 'Có người đã thích bình luận của bạn',
}

/** Notices about the user's own post, with no one named. */
const STATUS: Record<'post_pending' | 'post_visible' | 'post_hidden' | 'post_removed', string> = {
  post_pending: 'Bài của bạn đang chờ duyệt, người khác chưa thấy bài này',
  post_visible: 'Người duyệt đã cho hiện bài của bạn',
  post_hidden: 'Bài của bạn đang tạm ẩn vì có nhiều báo cáo, chờ người duyệt xem lại',
  post_removed: 'Người duyệt đã gỡ bài của bạn',
}

const ICON: Record<NoticeKind, BlogIconName> = {
  post_liked: 'heart',
  post_commented: 'comment',
  comment_replied: 'reply',
  comment_liked: 'heart',
  post_pending: 'bell',
  post_visible: 'bell',
  post_hidden: 'bell',
  post_removed: 'bell',
}

const isStatus = (kind: NoticeKind): kind is keyof typeof STATUS => kind in STATUS
const isLike = (kind: NoticeKind): kind is keyof typeof LIKED => kind in LIKED

/** The person to name for a notice: only comments and replies name someone. */
const actorOf = (item: ActivityItem): string | null => (isStatus(item.kind) || isLike(item.kind) ? null : item.actor_handle)

/** Where a notice leads: the post, at the comment when there is one. */
function link(item: ActivityItem): string {
  const post = href({ page: 'post', id: item.post_id })
  return item.comment_id !== null ? `${post}?bl=${item.comment_id}` : post
}

function Line({ item, actor }: { item: ActivityItem; actor: string | null }) {
  if (isStatus(item.kind)) return <>{STATUS[item.kind]}:</>
  if (isLike(item.kind)) return <>{LIKED[item.kind]}:</>
  return (
    <>
      <span className="font-semibold break-all text-ink">{actor ?? 'Một người dùng'}</span> {ACTED[item.kind]}:
    </>
  )
}

function Row({ item }: { item: ActivityItem }) {
  const actor = actorOf(item)
  return (
    <a href={link(item)} className="group grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-start gap-x-3 py-4">
      {actor === null ? (
        <span
          aria-hidden="true"
          className="inline-flex size-9 items-center justify-center rounded-full border border-line bg-paper text-ink-soft"
        >
          <BlogIcon name={ICON[item.kind]} className="size-[1.125rem]" />
        </span>
      ) : (
        <Avatar handle={actor} />
      )}
      <span className="min-w-0 text-sm leading-relaxed text-ink-soft">
        <Line item={item} actor={actor} />{' '}
        <span className="font-semibold text-ink group-hover:text-primary group-hover:underline">{item.post_title}</span>
        {item.excerpt_vi && <span className="mt-0.5 block break-words text-ink">“{item.excerpt_vi}”</span>}
        <span className="mt-0.5 block text-xs">
          <When iso={item.created_at} />
        </span>
      </span>
      {!item.read && <span className="mt-1 rounded-full bg-wash px-2 text-xs leading-relaxed font-semibold text-primary">Mới</span>}
    </a>
  )
}

/** #/blog/hoat-dong: likes, comments and replies on the user's posts, and what reviewers did with them. */
export function ActivityPage() {
  const { state, retry } = useLoad('activity', (signal) => api.activity(LIMIT, signal))
  const marked = useRef(false)

  // Opening the page reads what it shows (only those: older unread ones further down stay unread).
  useEffect(() => {
    if (state.kind !== 'ready') return
    setUnread(state.value.unread_count)
    const unread = state.value.items.filter((i) => !i.read).map((i) => i.id)
    if (marked.current || unread.length === 0) return
    marked.current = true
    api.readActivity(unread).then(
      (r) => setUnread(r.unread_count),
      () => {
        // Still unread on the server; the next visit tries again.
      },
    )
  }, [state])

  return (
    <BlogShell spot="activity" title="Hoạt động" lead="Lượt thích, bình luận và trả lời về bài của bạn, và việc người duyệt làm với bài.">
      {state.kind === 'loading' && <Loading />}
      {state.kind === 'error' && <LoadError onRetry={retry}>Không tải được hoạt động.</LoadError>}
      {state.kind === 'ready' && state.value.items.length === 0 && (
        <Notice>Chưa có hoạt động nào. Khi có người thích, bình luận hay trả lời bạn, thông báo sẽ hiện ở đây.</Notice>
      )}
      {state.kind === 'ready' && state.value.items.length > 0 && (
        <ul className="rounded-md border border-line bg-surface px-4 sm:px-6">
          {state.value.items.map((item) => (
            <li key={item.id} className="border-b border-line last:border-b-0">
              <Row item={item} />
            </li>
          ))}
        </ul>
      )}
      {state.kind === 'ready' && state.value.items.length >= LIMIT && (
        <p className="mt-3 text-xs text-ink-soft">Chỉ hiện {LIMIT} hoạt động gần nhất.</p>
      )}
      <DemoFooter />
    </BlogShell>
  )
}
