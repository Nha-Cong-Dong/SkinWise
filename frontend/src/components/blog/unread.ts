// The number of unread notifications ("Hoạt động"), shared by every place that shows it. Asked
// for when a page using it mounts and when the address changes, never on a timer. Forgotten when
// nothing shows it any more (signing out unmounts the pages) and on a 401, so another account
// never sees this one's number.

import { useEffect, useSyncExternalStore } from 'react'
import { SIGNED_OUT_EVENT, api } from '../../api'
import { href, useRoute } from '../../router'

let count: number | null = null
let generation = 0 // bumped by every set: an older answer that arrives later is dropped
let asking = false
const listeners = new Set<() => void>()

function set(value: number | null) {
  generation += 1
  count = value
  for (const listener of listeners) listener()
}

/** Ask the server again (one request at a time). */
export function refreshUnread(): void {
  if (asking) return
  asking = true
  const started = generation
  api.activity(1).then(
    (r) => {
      if (generation === started) set(r.unread_count)
    },
    () => {
      // Not shown when it cannot be loaded; the activity page has its own error state.
    },
  ).finally(() => {
    asking = false
  })
}

/** After reading notifications: the count the server returned. */
export const setUnread = (value: number) => set(value)

window.addEventListener(SIGNED_OUT_EVENT, () => set(null))

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) set(null)
  }
}

/** Unread notifications; null until known. Refreshed on mount and whenever the route changes. */
export function useUnreadCount(): number | null {
  const where = href(useRoute())
  useEffect(() => {
    refreshUnread()
  }, [where])
  return useSyncExternalStore(subscribe, () => count)
}
