// The routine lives in the browser (no accounts in the MVP). Products are referenced by a
// key; entries are ordered, and an entry's step is its position within its session.

import { useEffect, useState } from 'react'
import {
  api,
  type InciAnalysis,
  type RoutineCheckRequest,
  type RoutineCheckResponse,
  type Session,
  type TextNotice,
  type Warning,
} from './api'
import { ALL_DAYS } from './labels'

export type MyProduct = {
  key: string
  name: string
  brand: string | null
  productId: number | null // seeded product
  inci: string | null // pasted ingredient list
  groups: string[]
  /** Notices from analysing a pasted list (missing in routines saved before they existed). */
  notices?: TextNotice[]
}

const INFORMATIONAL: TextNotice['code'][] = ['vietnamese_names', 'drug_facts']

/** The pasted list may not be the whole label, so the check may miss warnings. */
export function maybeIncomplete(product: MyProduct): boolean {
  return (product.notices ?? []).some((n) => !INFORMATIONAL.includes(n.code))
}

/**
 * What the "add product" dialog keeps while it is closed. The dialog unmounts its content, and a
 * pasted list must survive closing it (Esc, a stray click) or switching tabs.
 */
export type AddDraft = { tab: 'search' | 'paste'; name: string; text: string; analysis: InciAnalysis | null }

export const EMPTY_ADD_DRAFT: AddDraft = { tab: 'search', name: '', text: '', analysis: null }

export type Entry = { id: string; productKey: string; session: Session; days: number[] }

export type Routine = { products: MyProduct[]; entries: Entry[] }

const STORAGE_KEY = 'skinwise.routine.v1'
const EMPTY: Routine = { products: [], entries: [] }

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
}

function load(): Routine {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (Array.isArray(parsed?.products) && Array.isArray(parsed?.entries)) return parsed
  } catch {
    // Storage blocked or corrupt: start empty.
  }
  return EMPTY
}

function save(routine: Routine): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routine))
  } catch {
    // Storage blocked (private window, quota): the routine still works for this visit.
  }
}

export function productKeyFor(productId: number): string {
  return `p${productId}`
}

export function sessionEntries(routine: Routine, session: Session): Entry[] {
  return routine.entries.filter((e) => e.session === session)
}

export function toCheckRequest(routine: Routine): RoutineCheckRequest {
  const known = new Set(routine.products.map((p) => p.key))
  const entries = routine.entries.filter((e) => known.has(e.productKey) && e.days.length > 0)
  const used = new Set(entries.map((e) => e.productKey))
  return {
    products: routine.products
      .filter((p) => used.has(p.key))
      .map((p) =>
        p.productId !== null ? { key: p.key, product_id: p.productId } : { key: p.key, inci: p.inci ?? '' },
      ),
    items: (['AM', 'PM'] as const).flatMap((session) =>
      entries
        .filter((e) => e.session === session)
        .map((e, i) => ({ product_key: e.productKey, session, days: e.days, step: i + 1 })),
    ),
  }
}

export function useRoutine() {
  const [routine, setRoutine] = useState<Routine>(load)
  useEffect(() => save(routine), [routine])

  const updateEntry = (id: string, change: (e: Entry) => Entry) =>
    setRoutine((r) => ({ ...r, entries: r.entries.map((e) => (e.id === id ? change(e) : e)) }))

  return {
    routine,
    addProduct(product: Omit<MyProduct, 'key'> & { key?: string }): string {
      const key = product.key ?? (product.productId !== null ? productKeyFor(product.productId) : `c${newId()}`)
      setRoutine((r) => (r.products.some((p) => p.key === key) ? r : { ...r, products: [...r.products, { ...product, key }] }))
      return key
    },
    removeProduct(key: string) {
      setRoutine((r) => ({
        products: r.products.filter((p) => p.key !== key),
        entries: r.entries.filter((e) => e.productKey !== key),
      }))
    },
    addEntry(productKey: string, session: Session) {
      setRoutine((r) => ({
        ...r,
        entries: [...r.entries, { id: newId(), productKey, session, days: [...ALL_DAYS] }],
      }))
    },
    removeEntry(id: string) {
      setRoutine((r) => ({ ...r, entries: r.entries.filter((e) => e.id !== id) }))
    },
    /** Swap with the previous (-1) or next (+1) entry of the same session. */
    moveEntry(id: string, direction: -1 | 1) {
      setRoutine((r) => {
        const entry = r.entries.find((e) => e.id === id)
        if (!entry) return r
        const same = sessionEntries(r, entry.session)
        const other = same[same.indexOf(entry) + direction]
        if (!other) return r
        const entries = [...r.entries]
        const i = entries.indexOf(entry)
        const j = entries.indexOf(other)
        ;[entries[i], entries[j]] = [entries[j], entries[i]]
        return { ...r, entries }
      })
    },
    toggleDay(id: string, day: number) {
      updateEntry(id, (e) => ({
        ...e,
        days: e.days.includes(day) ? e.days.filter((d) => d !== day) : [...e.days, day].sort((a, b) => a - b),
      }))
    },
    setDays(id: string, days: number[]) {
      updateEntry(id, (e) => ({ ...e, days }))
    },
  }
}

export type RoutineActions = ReturnType<typeof useRoutine>

export type CheckState =
  | { kind: 'empty' } // nothing scheduled yet
  | { kind: 'loading'; previous: RoutineCheckResponse | null }
  | { kind: 'done'; result: RoutineCheckResponse }
  | { kind: 'error'; message: string }

/** The result to show: the last finished check, kept while a newer one runs. */
export function currentResult(state: CheckState): RoutineCheckResponse | null {
  return state.kind === 'done' ? state.result : state.kind === 'loading' ? state.previous : null
}

/**
 * A "Lưu ý khi dùng" note is about one product's active group, not a combination, so it does
 * not mark products on the schedule or count among the warnings.
 */
export function isUsageNote(w: Warning): boolean {
  return w.rule.kind === 'usage'
}

/** Re-check the routine whenever it changes (debounced; a newer check cancels an older one). */
export function useRoutineCheck(routine: Routine): CheckState {
  const request = toCheckRequest(routine)
  const body = JSON.stringify(request)
  const empty = request.items.length === 0
  // The last finished check and the request it answered; loading = it answered an older request.
  const [last, setLast] = useState<{ body: string; result?: RoutineCheckResponse; error?: string } | null>(null)

  useEffect(() => {
    if (empty) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      api
        .checkRoutine(JSON.parse(body), controller.signal)
        .then((result) => setLast({ body, result }))
        .catch((e) => {
          if (e.name !== 'AbortError') setLast({ body, error: e.message })
        })
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [body, empty])

  if (empty) return { kind: 'empty' }
  if (last?.body !== body) return { kind: 'loading', previous: last?.result ?? null }
  return last.result ? { kind: 'done', result: last.result } : { kind: 'error', message: last.error ?? '' }
}
