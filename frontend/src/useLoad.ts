// One GET per key, with loading / error / ready states. "Loading" is derived (the last answer
// belongs to another key), so no state is set synchronously inside the effect.

import { useEffect, useRef, useState } from 'react'

export type Load<T> = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; error: unknown } | { kind: 'ready'; value: T }

/** `key` null: nothing to load (idle). A new key, or retry(), loads again; older answers are dropped. */
export function useLoad<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0)
  const token = key === null ? null : `${attempt}#${key}`
  const [answer, setAnswer] = useState<{ token: string; result: Load<T> } | null>(null)
  const loader = useRef(load)
  useEffect(() => {
    loader.current = load
  })

  useEffect(() => {
    if (token === null) return
    const controller = new AbortController()
    loader.current(controller.signal).then(
      (value) => setAnswer({ token, result: { kind: 'ready', value } }),
      (error) => {
        if (!controller.signal.aborted) setAnswer({ token, result: { kind: 'error', error } })
      },
    )
    return () => controller.abort()
  }, [token])

  const state: Load<T> =
    token === null ? { kind: 'idle' } : answer?.token === token ? answer.result : { kind: 'loading' }

  return {
    state,
    retry: () => setAttempt((n) => n + 1),
    /** Change the loaded value in place (after a like, a new comment…). */
    update: (change: (value: T) => T) =>
      setAnswer((a) =>
        a && a.token === token && a.result.kind === 'ready' ? { token: a.token, result: { kind: 'ready', value: change(a.result.value) } } : a,
      ),
  }
}

/** The HTTP status of a failed call, or 0 when the server did not answer. */
export const statusOf = (error: unknown) => (error as { status?: number } | null)?.status ?? 0
