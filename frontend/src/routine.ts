// The routine lives in the browser (no accounts in the MVP). Products are referenced by a
// key; entries are ordered, and an entry's step is its position within its session.

import { useEffect, useState } from 'react'
import {
  api,
  type InciAnalysis,
  type ProductSummary,
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
  /** Where a list not typed or pasted by the user came from. Shown only: checks treat it as pasted. */
  origin?: ProductOrigin
}

/** A list copied off a label photo by an AI model. `confirmed`: the user checked it against the package. */
export type ProductOrigin = { kind: 'photo'; confirmed: boolean }

const INFORMATIONAL: TextNotice['code'][] = ['vietnamese_names', 'drug_facts']

/** The pasted list may not be the whole label, so the check may miss warnings. */
export function maybeIncomplete(product: MyProduct): boolean {
  return (product.notices ?? []).some((n) => !INFORMATIONAL.includes(n.code))
}

/**
 * What the "add product" dialog keeps while it is closed. The dialog unmounts its content, and a
 * pasted list must survive closing it (Esc, a stray click) or switching tabs.
 */
export type AddDraft = {
  tab: 'search' | 'paste'
  name: string
  text: string
  analysis: InciAnalysis | null
  origin: ProductOrigin | null // the pasted list was read off a photo
  photo: string | null // the label photo as a data URL, to compare with; never stored
}

export const EMPTY_ADD_DRAFT: AddDraft = {
  tab: 'search',
  name: '',
  text: '',
  analysis: null,
  origin: null,
  photo: null,
}

export type Entry = { id: string; productKey: string; session: Session; days: number[] }

export type Routine = { products: MyProduct[]; entries: Entry[] }

/** A removed product and its steps, with their positions, so "Hoàn tác" can put them back. */
export type RemovedProduct = { product: MyProduct; index: number; entries: { entry: Entry; index: number }[] }

const STORAGE_KEY = 'skinwise.routine.v1'
const EMPTY: Routine = { products: [], entries: [] }

export function newId(): string {
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

/**
 * A demo routine of products sold in Vietnam, to show what a check looks like: one combination
 * warning, one myth card and usage notes. Not a recommendation; the empty state says so.
 */
const SAMPLE_STEPS: { slug: string; session: Session }[] = [
  { slug: 'vichy-liftactiv-vitamin-c-15-serum', session: 'AM' },
  { slug: 'la-roche-posay-anthelios-uvmune-400-anti-dark-spots-fluid-spf50', session: 'AM' },
  { slug: 'vichy-normaderm-probio-bha-serum', session: 'PM' },
  { slug: 'vichy-liftactiv-b3-pure-retinol-night-cream', session: 'PM' },
]

/** The demo routine from the catalogue, or null if a product is gone (no partial demo). */
export function sampleRoutine(catalogue: ProductSummary[]): Routine | null {
  const bySlug = new Map(catalogue.map((p) => [p.slug, p]))
  const steps = SAMPLE_STEPS.map(({ slug, session }) => ({ product: bySlug.get(slug), session }))
  if (steps.some((s) => !s.product)) return null
  const chosen = new Map(steps.map(({ product }) => [product!.id, product!]))
  return {
    products: [...chosen.values()].map((p) => ({
      key: productKeyFor(p.id),
      name: p.name,
      brand: p.brand,
      productId: p.id,
      inci: null,
      groups: p.groups,
    })),
    entries: steps.map(({ product, session }) => ({
      id: newId(),
      productKey: productKeyFor(product!.id),
      session,
      days: [...ALL_DAYS],
    })),
  }
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
    /** Replace the whole routine (opening a file or a shared link, after the user agreed). */
    replace(next: Routine) {
      setRoutine(next)
    },
    /** Remove a product and its steps; returns what restoreProduct needs to undo it. */
    removeProduct(key: string): RemovedProduct | null {
      const index = routine.products.findIndex((p) => p.key === key)
      if (index < 0) return null
      const removed = {
        product: routine.products[index],
        index,
        entries: routine.entries.flatMap((entry, i) => (entry.productKey === key ? [{ entry, index: i }] : [])),
      }
      setRoutine((r) => ({
        products: r.products.filter((p) => p.key !== key),
        entries: r.entries.filter((e) => e.productKey !== key),
      }))
      return removed
    },
    /** Undo removeProduct: the product and its steps go back where they were. */
    restoreProduct(removed: RemovedProduct) {
      setRoutine((r) => {
        if (r.products.some((p) => p.key === removed.product.key)) return r // added again meanwhile
        const products = [...r.products]
        products.splice(Math.min(removed.index, products.length), 0, removed.product)
        const entries = [...r.entries]
        for (const { entry, index } of removed.entries) entries.splice(Math.min(index, entries.length), 0, entry)
        return { products, entries }
      })
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
  | { kind: 'error'; message: string; retry: () => void }

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
  const [attempt, setAttempt] = useState(0) // bumped by "Thử lại" to send the same request again

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
  }, [body, empty, attempt])

  if (empty) return { kind: 'empty' }
  if (last?.body !== body) return { kind: 'loading', previous: last?.result ?? null }
  if (last.result) return { kind: 'done', result: last.result }
  const retry = () => {
    setLast(null) // shows "loading" until the new answer
    setAttempt((n) => n + 1)
  }
  return { kind: 'error', message: last.error ?? '', retry }
}
