import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, type CommentOut } from '../../api'
import { COMMENT_MAX, SESSION_EXPIRED, TOO_MANY, actionError, isSignedOut, isTooMany, mayBeFlagged } from '../../blog'
import { flagReasons } from '../../labels'
import { PROFILE_LOAD_ERROR, isProfileRequired, useProfile } from '../../profile'
import { href } from '../../router'
import { useLoad } from '../../useLoad'
import { BlogIcon } from './icons'
import type { ReportTarget } from './ReportDialog'
import { Avatar, LoadError, Loading, When } from './parts'
import { field, primary, quiet, small } from './styles'

/** Shown in place of a top-level comment that is no longer shown but still has replies. No reason, no author. */
export const GONE_COMMENT = 'Bình luận không còn hiển thị.'

/** The comment a notification points at: "#/blog/12?bl=34". */
function linkedComment(): number | null {
  const match = /[?&]bl=(\d{1,15})(?:&|$)/.exec(window.location.hash)
  return match ? Number(match[1]) : null
}

type Replying = { root: number; to: CommentOut }

const shown = (c: CommentOut) => !c.deleted && c.status === 'visible'

export function Comments({ postId, onReport }: { postId: number; onReport: (target: ReportTarget) => void }) {
  const { state, update, retry } = useLoad(`comments:${postId}`, () => api.comments(postId))
  const [replying, setReplying] = useState<Replying | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [target] = useState(linkedComment)
  const scrolled = useRef(false)

  // Bring the comment a notification links to into view, once.
  useEffect(() => {
    if (state.kind !== 'ready' || target === null || scrolled.current) return
    scrolled.current = true
    document.getElementById(`comment-${target}`)?.scrollIntoView({ block: 'center' })
  }, [state.kind, target])

  /** Change one comment wherever it is in the tree. */
  const patch = (id: number, change: (c: CommentOut) => CommentOut) =>
    update((list) =>
      list.map((root) =>
        root.id === id ? change(root) : { ...root, replies: root.replies.map((r) => (r.id === id ? change(r) : r)) },
      ),
    )

  const remove = (comment: CommentOut) => {
    if (!confirm('Xoá bình luận này?')) return
    setError(null)
    api.deleteComment(comment.id).then(
      () => retry(), // a top-level comment with replies stays as an empty frame: ask the server for the tree
      (e) => setError(actionError(e, 'Không xoá được bình luận. Hãy thử lại.')),
    )
  }

  const like = (comment: CommentOut) => {
    setBusy(comment.id)
    setError(null)
    api
      .likeComment(comment.id, !comment.liked_by_me)
      .then(
        (r) => patch(comment.id, (c) => ({ ...c, liked_by_me: r.liked, like_count: r.like_count })),
        (e) =>
          setError(
            isTooMany(e) ? TOO_MANY : actionError(e, 'Không thích được bình luận này. Có thể bình luận không còn hiển thị.'),
          ),
      )
      .finally(() => setBusy(null))
  }

  const added = (comment: CommentOut) => {
    if (comment.parent_id === null) update((list) => [...list, comment])
    else update((list) => list.map((root) => (root.id === comment.parent_id ? { ...root, replies: [...root.replies, comment] } : root)))
    setReplying(null)
  }

  // Same count as the post card: the user's own pending or hidden comments are not counted.
  const comments = state.kind === 'ready' ? state.value : []
  const visible = comments.reduce((n, root) => n + (shown(root) ? 1 : 0) + root.replies.filter(shown).length, 0)

  const item = (c: CommentOut, root: CommentOut, hasThread: boolean) => (
    <CommentItem
      comment={c}
      highlighted={c.id === target}
      thread={hasThread}
      busy={busy === c.id}
      onLike={() => like(c)}
      onReply={() => setReplying({ root: root.id, to: c })}
      onDelete={() => remove(c)}
      onReport={() => onReport({ kind: 'comment', id: c.id })}
    />
  )

  return (
    <section aria-labelledby="comments-title" className="rounded-md border border-line bg-surface px-4 sm:px-6">
      <h2 id="comments-title" className="pt-5 text-base font-bold">
        {visible > 0 ? `${visible} bình luận` : 'Bình luận'}
      </h2>
      <div aria-live="polite">{error && <p className="mt-2 text-sm text-avoid-ink">{error}</p>}</div>
      {state.kind === 'loading' && (
        <div className="py-4">
          <Loading />
        </div>
      )}
      {state.kind === 'error' && (
        <div className="py-4">
          <LoadError onRetry={retry}>Không tải được bình luận.</LoadError>
        </div>
      )}
      {state.kind === 'ready' && comments.length === 0 && <p className="py-4 text-sm text-ink-soft">Chưa có bình luận nào.</p>}
      {comments.length > 0 && (
        <ul>
          {comments.map((root) => (
            <li key={root.id} className="border-b border-line">
              {item(root, root, root.replies.length > 0 || replying?.root === root.id)}
              {(root.replies.length > 0 || replying?.root === root.id) && (
                <ul className="ml-[1.125rem] border-l-2 border-line pl-5 sm:pl-7">
                  {root.replies.map((r) => (
                    <li key={r.id}>{item(r, root, false)}</li>
                  ))}
                  {replying?.root === root.id && (
                    <li className="pb-4">
                      <CommentForm
                        postId={postId}
                        parent={replying.to}
                        onAdded={added}
                        onCancel={() => setReplying(null)}
                      />
                    </li>
                  )}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="py-4">
        <CommentForm postId={postId} parent={null} onAdded={added} />
      </div>
    </section>
  )
}

function CommentItem({
  comment: c,
  highlighted,
  thread,
  busy,
  onLike,
  onReply,
  onDelete,
  onReport,
}: {
  comment: CommentOut
  highlighted: boolean
  thread: boolean
  busy: boolean
  onLike: () => void
  onReply: () => void
  onDelete: () => void
  onReport: () => void
}) {
  const action =
    'motion-press inline-flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-xs text-ink-soft hover:bg-thistle/25 hover:text-ink md:min-h-9 disabled:opacity-40'
  return (
    <article
      id={`comment-${c.id}`}
      className={`grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 py-4 ${highlighted ? '-mx-2 rounded-md bg-wash px-2' : ''}`}
      aria-label={c.deleted ? GONE_COMMENT : `Bình luận của ${c.author?.handle ?? ''}`}
    >
      <div className="flex flex-col items-center">
        <Avatar handle={c.author?.handle ?? null} />
        {thread && <span aria-hidden="true" className="mt-2 w-0.5 flex-1 rounded-full bg-line" />}
      </div>
      {c.deleted || !c.author ? (
        <p className="self-center text-sm text-ink-soft italic">{GONE_COMMENT}</p>
      ) : (
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-soft">
            <a href={href({ page: 'author', handle: c.author.handle })} className="inline-flex min-h-11 items-center md:min-h-0 text-sm font-semibold break-all text-ink hover:underline">
              {c.author.handle}
            </a>
            <When iso={c.created_at} />
          </p>
          {c.is_mine && c.status === 'pending' && (
            <p className="mt-2 rounded-md bg-paper p-2 text-xs leading-relaxed text-ink-soft">
              Bình luận đang chờ duyệt vì có nội dung cần kiểm tra: {flagReasons(c.flags)}. Người khác chưa thấy bình luận
              này.
            </p>
          )}
          {c.is_mine && c.status === 'hidden' && (
            <p className="mt-2 rounded-md bg-paper p-2 text-xs leading-relaxed text-ink-soft">
              Bình luận đang tạm ẩn vì có nhiều báo cáo, chờ người duyệt xem lại.
            </p>
          )}
          <p className="mt-1 text-sm leading-relaxed break-words whitespace-pre-wrap text-ink">
            {c.reply_to_handle && (
              <a href={href({ page: 'author', handle: c.reply_to_handle })} className="mr-1 font-semibold text-primary hover:underline">
                @{c.reply_to_handle}
              </a>
            )}
            {c.body}
          </p>
          <div className="-ml-2.5 mt-1 flex flex-wrap items-center gap-1">
            <button
              onClick={onLike}
              disabled={busy}
              aria-pressed={c.liked_by_me}
              aria-label={`Thích bình luận, ${c.like_count} lượt thích`}
              className={`${action} ${c.liked_by_me ? 'font-semibold text-primary' : ''}`}
            >
              <BlogIcon name="heart" filled={c.liked_by_me} className="size-[1.125rem]" />
              {c.like_count}
            </button>
            {c.status === 'visible' && (
              <button onClick={onReply} className={action}>
                <BlogIcon name="reply" className="size-[1.125rem]" />
                Trả lời
              </button>
            )}
            {c.is_mine ? (
              <button onClick={onDelete} className={action}>
                Xoá
              </button>
            ) : (
              <button onClick={onReport} className={action}>
                Báo cáo
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  )
}

function CommentForm({
  postId,
  parent,
  onAdded,
  onCancel,
}: {
  postId: number
  parent: CommentOut | null // a reply to this comment
  onAdded: (comment: CommentOut) => void
  onCancel?: () => void
}) {
  const profile = useProfile()
  const [body, setBody] = useState('')
  const [state, setState] = useState<
    'idle' | 'sending' | 'error' | 'gone' | 'too-many' | 'no-profile' | 'profile-error' | 'signed-out'
  >('idle')
  const to = parent?.author?.handle ?? null

  const send = async (retried = false): Promise<void> => {
    setState('sending')
    try {
      onAdded(await api.addComment(postId, { body: body.trim(), ...(parent ? { parent_id: parent.id } : {}) }))
      setBody('')
      setState('idle')
    } catch (e) {
      if (isProfileRequired(e) && !retried) {
        const saved = await profile.require(true)
        if (saved === 'error') return setState('profile-error')
        if (saved?.handle) return send(true)
        setState('no-profile')
        return
      }
      const status = (e as { status?: number } | null)?.status
      setState(isSignedOut(e) ? 'signed-out' : isTooMany(e) ? 'too-many' : parent && status === 404 ? 'gone' : 'error')
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const saved = await profile.require()
    if (saved === 'error') return setState('profile-error')
    if (!saved?.handle) {
      setState('no-profile')
      return
    }
    await send()
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-2">
      <label className="block text-sm">
        <span className="sr-only">{to ? `Trả lời ${to}` : 'Viết bình luận'}</span>
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            if (state !== 'sending') setState('idle')
          }}
          maxLength={COMMENT_MAX}
          rows={parent ? 2 : 3}
          placeholder={to ? `Trả lời ${to}…` : 'Viết bình luận…'}
          autoFocus={parent !== null}
          className={field}
        />
      </label>
      {mayBeFlagged(body) && (
        <p className="text-xs leading-relaxed text-caution-ink">
          Hãy viết cảm nhận của bạn. Tránh nói sản phẩm "trị" hay "chữa" bệnh, và đừng ghi số điện thoại, email hay link.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={!body.trim() || state === 'sending'} className={`${primary} ${small}`}>
          {state === 'sending' ? 'Đang gửi…' : parent ? 'Gửi trả lời' : 'Gửi bình luận'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={quiet}>
            Huỷ
          </button>
        )}
        <span className="ml-auto text-xs text-ink-soft">
          {body.length}/{COMMENT_MAX}
        </span>
      </div>
      <div aria-live="polite" className="text-sm">
        {state === 'error' && <p className="text-avoid-ink">Không gửi được bình luận. Hãy thử lại.</p>}
        {state === 'gone' && <p className="text-avoid-ink">Bình luận bạn trả lời không còn hiển thị.</p>}
        {state === 'too-many' && <p className="text-avoid-ink">{TOO_MANY}</p>}
        {state === 'no-profile' && <p className="text-ink-soft">Cần đặt biệt danh trước khi bình luận.</p>}
        {state === 'profile-error' && <p className="text-avoid-ink">{PROFILE_LOAD_ERROR}</p>}
        {state === 'signed-out' && <p className="text-avoid-ink">{SESSION_EXPIRED}</p>}
      </div>
    </form>
  )
}
