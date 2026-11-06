import { api } from '../../api'
import { SKIN_TYPE_LABELS } from '../../labels'
import { ALL_POSTS, href } from '../../router'
import { statusOf, useLoad } from '../../useLoad'
import { Notice } from '../Notice'
import { DemoFooter, LoadError, Loading, PostGrid, textLink } from './parts'

/** #/tac-gia/<handle>: an author's visible posts. Only the nickname and skin type are public. */
export function AuthorPage({ handle }: { handle: string }) {
  const { state: loaded, retry } = useLoad(`author:${handle}`, () => api.author(handle))
  const state =
    loaded.kind === 'ready'
      ? { kind: 'ready' as const, author: loaded.value }
      : loaded.kind === 'error' && statusOf(loaded.error) === 404
        ? { kind: 'missing' as const }
        : loaded.kind === 'error'
          ? { kind: 'error' as const }
          : { kind: 'loading' as const }

  return (
    <div>
      <p className="text-sm">
        <a href={href(ALL_POSTS)} className={textLink}>
          ← Review cộng đồng
        </a>
      </p>
      <div className="mt-4">
        {state.kind === 'loading' && <Loading />}
        {state.kind === 'missing' && <p className="text-sm text-ink-soft">Không tìm thấy người viết này.</p>}
        {state.kind === 'error' && <LoadError onRetry={retry}>Không tải được trang người viết.</LoadError>}
        {state.kind === 'ready' && (
          <>
            <h1 className="text-2xl font-bold">@{state.author.handle}</h1>
            <p className="mt-1 text-sm text-ink-soft">
              {state.author.skin_type && `${SKIN_TYPE_LABELS[state.author.skin_type]} · `}
              {state.author.post_count} bài review
            </p>
            <div className="mt-6">
              {state.author.posts.length === 0 ? (
                <Notice>Chưa có bài review nào.</Notice>
              ) : (
                <PostGrid posts={state.author.posts} />
              )}
            </div>
          </>
        )}
      </div>
      <DemoFooter />
    </div>
  )
}
