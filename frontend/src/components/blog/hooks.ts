import { useEffect, useState } from 'react'
import { api, type PostQuery, type PostSummary } from '../../api'
import { PAGE_SIZE } from '../../blog'
import { statusOf, useLoad } from '../../useLoad'

/** One post; a 404 covers "no such post" and "waiting for review, and not yours". */
export function usePost(id: number) {
  return useLoad(`post:${id}`, () => api.post(id))
}

export type ListState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; status: number }
  | { kind: 'ready'; items: PostSummary[]; total: number; ratingAvg: number | null; ratingCount: number; more: 'idle' | 'loading' | 'error' }

/** Posts of a query, twenty at a time with "Xem thêm". `query` null: nothing to load yet. */
export function usePostList(query: PostQuery | null) {
  const key = query === null ? null : JSON.stringify(query)
  const [attempt, setAttempt] = useState(0)
  const token = key === null ? null : `${attempt}#${key}`
  const [answer, setAnswer] = useState<{ token: string; list: ListState } | null>(null)

  useEffect(() => {
    if (key === null || token === null) return
    const controller = new AbortController()
    api.posts({ ...(JSON.parse(key) as PostQuery), offset: 0, limit: PAGE_SIZE }, controller.signal).then(
      (list) => setAnswer({ token, list: { kind: 'ready', items: list.items, total: list.total, ratingAvg: list.rating_avg, ratingCount: list.rating_count, more: 'idle' } }),
      (e) => {
        if (!controller.signal.aborted) setAnswer({ token, list: { kind: 'error', status: statusOf(e) } })
      },
    )
    return () => controller.abort()
  }, [key, token])

  const state: ListState = token === null ? { kind: 'idle' } : answer?.token === token ? answer.list : { kind: 'loading' }

  const patch = (change: (list: Extract<ListState, { kind: 'ready' }>) => ListState) =>
    setAnswer((a) => (a && a.token === token && a.list.kind === 'ready' ? { token: a.token, list: change(a.list) } : a))

  const loadMore = () => {
    if (state.kind !== 'ready' || key === null) return
    patch((l) => ({ ...l, more: 'loading' }))
    api.posts({ ...(JSON.parse(key) as PostQuery), offset: state.items.length, limit: PAGE_SIZE }).then(
      (page) =>
        patch((l) => {
          const seen = new Set(l.items.map((p) => p.id)) // a new post may shift the pages
          return { ...l, items: [...l.items, ...page.items.filter((p) => !seen.has(p.id))], total: page.total, more: 'idle' }
        }),
      () => patch((l) => ({ ...l, more: 'error' })),
    )
  }

  return { state, loadMore, retry: () => setAttempt((n) => n + 1) }
}

export type PostListHandle = ReturnType<typeof usePostList>
