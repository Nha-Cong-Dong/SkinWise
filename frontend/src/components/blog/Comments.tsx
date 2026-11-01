import { useState, type FormEvent } from 'react'
import { api, type CommentOut } from '../../api'
import { COMMENT_MAX, SESSION_EXPIRED, TOO_MANY, actionError, formatDate, isSignedOut, isTooMany, mayBeFlagged } from '../../blog'
import { flagReasons } from '../../labels'
import { PROFILE_LOAD_ERROR, isProfileRequired, useProfile } from '../../profile'
import { href } from '../../router'
import { useLoad } from '../../useLoad'
import type { ReportTarget } from './ReportDialog'
import { LoadError, Loading, field, primary, textLink } from './parts'

export function Comments({ postId, onReport }: { postId: number; onReport: (target: ReportTarget) => void }) {
  const { state: loaded, update, retry } = useLoad(`comments:${postId}`, () => api.comments(postId))
  const state = loaded.kind === 'ready' ? { kind: 'ready' as const, comments: loaded.value } : loaded

  const remove = (comment: CommentOut) => {
    if (!confirm('Xoá bình luận này?')) return
    api.deleteComment(comment.id).then(
      () => update((list) => list.filter((c) => c.id !== comment.id)),
      (e) => alert(actionError(e, 'Không xoá được bình luận. Hãy thử lại.')),
    )
  }

  // Same count as the post card: the user's own pending or hidden comments are not counted.
  const visible = state.kind === 'ready' ? state.comments.filter((c) => c.status === 'visible').length : 0

  return (
    <section aria-labelledby="comments-title">
      <h2 id="comments-title" className="text-lg font-bold">
        Bình luận{visible > 0 && ` (${visible})`}
      </h2>
      <div className="mt-3">
        {(state.kind === 'loading' || state.kind === 'idle') && <Loading />}
        {state.kind === 'error' && (
          <LoadError onRetry={retry}>Không tải được bình luận.</LoadError>
        )}
        {state.kind === 'ready' && state.comments.length === 0 && (
          <p className="text-sm text-ink-mute">Chưa có bình luận nào.</p>
        )}
        {state.kind === 'ready' && state.comments.length > 0 && (
          <ul className="space-y-3">
            {state.comments.map((c) => (
              <li key={c.id} className="rounded-xl bg-surface p-3.5 ring-1 ring-line">
                <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-mute">
                  <a href={href({ page: 'author', handle: c.author.handle })} className={`font-medium text-ink ${textLink}`}>
                    @{c.author.handle}
                  </a>
                  <span>{formatDate(c.created_at)}</span>
                  <span className="flex-1" />
                  {c.is_mine ? (
                    <button onClick={() => remove(c)} className="hover:text-ink">
                      Xoá
                    </button>
                  ) : (
                    <button onClick={() => onReport({ kind: 'comment', id: c.id })} className="hover:text-ink">
                      Báo cáo
                    </button>
                  )}
                </p>
                {c.is_mine && c.status === 'pending' && (
                  <p className="mt-2 rounded-lg bg-paper p-2 text-xs leading-relaxed text-ink-soft">
                    Bình luận đang chờ duyệt vì có nội dung cần kiểm tra: {flagReasons(c.flags)}. Người khác chưa thấy
                    bình luận này.
                  </p>
                )}
                {c.is_mine && c.status === 'hidden' && (
                  <p className="mt-2 rounded-lg bg-paper p-2 text-xs leading-relaxed text-ink-soft">
                    Bình luận đang tạm ẩn vì có nhiều báo cáo, chờ người duyệt xem lại.
                  </p>
                )}
                <p className="mt-1.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-ink">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <CommentForm
        postId={postId}
        onAdded={(c) => update((list) => [...list, c])}
      />
    </section>
  )
}

function CommentForm({ postId, onAdded }: { postId: number; onAdded: (comment: CommentOut) => void }) {
  const profile = useProfile()
  const [body, setBody] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'error' | 'too-many' | 'no-profile' | 'profile-error' | 'signed-out'>('idle')

  const send = async (retried = false): Promise<void> => {
    setState('sending')
    try {
      onAdded(await api.addComment(postId, { body: body.trim() }))
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
      setState(isSignedOut(e) ? 'signed-out' : isTooMany(e) ? 'too-many' : 'error')
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
    <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-2">
      <label className="block text-sm">
        <span className="sr-only">Viết bình luận</span>
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            if (state !== 'sending') setState('idle')
          }}
          maxLength={COMMENT_MAX}
          rows={3}
          placeholder="Viết bình luận…"
          className={field}
        />
      </label>
      {mayBeFlagged(body) && (
        <p className="text-xs leading-relaxed text-caution-ink">
          Hãy viết cảm nhận của bạn. Tránh nói sản phẩm "trị" hay "chữa" bệnh, và đừng ghi số điện thoại, email hay link.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!body.trim() || state === 'sending'} className={primary}>
          {state === 'sending' ? 'Đang gửi…' : 'Gửi bình luận'}
        </button>
        <span className="text-xs text-ink-mute">
          {body.length}/{COMMENT_MAX}
        </span>
      </div>
      <div aria-live="polite" className="text-sm">
        {state === 'error' && <p className="text-avoid-ink">Không gửi được bình luận. Hãy thử lại.</p>}
        {state === 'too-many' && <p className="text-avoid-ink">{TOO_MANY}</p>}
        {state === 'no-profile' && <p className="text-ink-soft">Cần đặt biệt danh trước khi bình luận.</p>}
        {state === 'profile-error' && <p className="text-avoid-ink">{PROFILE_LOAD_ERROR}</p>}
        {state === 'signed-out' && <p className="text-avoid-ink">{SESSION_EXPIRED}</p>}
      </div>
    </form>
  )
}
