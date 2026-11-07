import { api } from '../../api'
import { SKIN_TYPE_LABELS } from '../../labels'
import { ALL_POSTS, href } from '../../router'
import { statusOf, useLoad } from '../../useLoad'
import { Notice } from '../Notice'
import { Avatar, DemoFooter, LoadError, Loading, PostGrid } from './parts'
import { BlogShell } from './Shell'

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
    <BlogShell spot={null} title="Người viết" heading={false} back={{ href: href(ALL_POSTS), label: 'Về danh sách bài review' }}>
      <div>
        {state.kind === 'loading' && <Loading />}
        {state.kind === 'missing' && <p className="text-sm text-ink-soft">Không tìm thấy người viết này.</p>}
        {state.kind === 'error' && <LoadError onRetry={retry}>Không tải được trang người viết.</LoadError>}
        {state.kind === 'ready' && (
          <>
            <div className="flex items-center gap-3">
              <Avatar handle={state.author.handle} />
              <div className="min-w-0">
                <h1 className="text-2xl leading-tight font-bold break-words">{state.author.handle}</h1>
                <p className="text-sm text-ink-soft">
                  {state.author.skin_type && `${SKIN_TYPE_LABELS[state.author.skin_type]} · `}
                  {state.author.post_count} bài review
                </p>
              </div>
            </div>
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
    </BlogShell>
  )
}
