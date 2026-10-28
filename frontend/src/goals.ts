// The skin goals the user picked. They may be health data (Law 91/2025), so they stay in this
// browser only: never sent to the server, never synced with the account. The device may be
// shared, so signing out or deleting the account clears them (`clearSelectedGoals`), as it
// clears the routine.

import { useEffect, useState } from 'react'
import type { Group } from './api'
import type { MyProduct, Routine } from './routine'

const STORAGE_KEY = 'skinwise.goals'
const CLEARED_EVENT = 'skinwise:goals-cleared'

function load(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (Array.isArray(parsed)) return parsed.filter((c): c is string => typeof c === 'string')
  } catch {
    // Storage blocked or corrupt: nothing selected.
  }
  return []
}

function save(codes: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(codes))
  } catch {
    // Storage blocked (private window, quota): the choice still works for this visit.
  }
}

/** After signing out or deleting the account: the next person on this device must not see them. */
export function clearSelectedGoals(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked: nothing was stored.
  }
  window.dispatchEvent(new Event(CLEARED_EVENT)) // a mounted goals page drops its selection too
}

/**
 * The selected goal codes. `known`: the codes /goals returns, once loaded; a stored code that
 * no longer exists is ignored and dropped on the next change.
 */
export function useSelectedGoals(known: string[] | null) {
  const [stored, setStored] = useState<string[]>(load)

  useEffect(() => {
    const onCleared = () => setStored([])
    window.addEventListener(CLEARED_EVENT, onCleared)
    return () => window.removeEventListener(CLEARED_EVENT, onCleared)
  }, [])
  const selected = known ? stored.filter((c) => known.includes(c)) : stored

  const toggle = (code: string) => {
    const next = selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]
    setStored(next)
    save(next)
  }

  return { selected, toggle }
}

/** A group with its umbrella groups (BHA -> EXFOLIANT_ACID), as /rules matches them. */
function withAncestors(code: string, groups: Map<string, Group>): string[] {
  const out: string[] = []
  let current: string | null | undefined = code
  while (current && !out.includes(current)) {
    out.push(current)
    current = groups.get(current)?.parent_code
  }
  return out
}

/**
 * The products scheduled in the routine that have `group`, or a narrower group of it (an
 * EXFOLIANT_ACID item matches an AHA product). Only products with at least one day in the
 * schedule count, as for the routine check.
 */
export function productsWithGroup(routine: Routine, group: string, groups: Map<string, Group>): MyProduct[] {
  const scheduled = new Set(routine.entries.filter((e) => e.days.length > 0).map((e) => e.productKey))
  return routine.products.filter(
    (p) => scheduled.has(p.key) && p.groups.some((g) => withAncestors(g, groups).includes(group)),
  )
}
