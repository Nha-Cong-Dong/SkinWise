// Keeping the routine in step with the server for the signed-in user (plan/h-accounts.md §6).
// The browser keeps working on its own copy (routine.ts); a write names the server version it
// started from, and a 409 means another device wrote since: the user picks which copy to keep.
// Nothing is overwritten silently.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ApiError, api, type StoredRoutine } from './api'
import type { Routine, RoutineActions } from './routine'

const META_KEY = 'skinwise.sync.v1'
const PUSH_DELAY = 1500 // ms after the last change

/** Whose routine this browser holds, which server version it started from, unsent changes. */
type Meta = { email: string; baseVersion: number; dirty: boolean }

function loadMeta(): Meta | null {
  try {
    const meta = JSON.parse(localStorage.getItem(META_KEY) ?? 'null')
    return typeof meta?.email === 'string' && Number.isInteger(meta?.baseVersion) ? meta : null
  } catch {
    return null
  }
}

function saveMeta(meta: Meta | null): void {
  try {
    if (meta) localStorage.setItem(META_KEY, JSON.stringify(meta))
    else localStorage.removeItem(META_KEY)
  } catch {
    // Storage blocked: sync still works for this visit.
  }
}

export type ServerCopy = { routine: Routine; version: number; updatedAt: string | null }

/** A short line for the header: where the routine stands with the server. */
export function syncLabel(state: SyncState): string | null {
  switch (state.kind) {
    case 'off':
      return null
    case 'syncing':
      return 'Đang lưu…'
    case 'synced':
      return 'Đã lưu'
    case 'offline':
      return 'Chưa lưu được (mất kết nối)'
    case 'conflict':
      return 'Cần chọn bản routine'
  }
}

export type SyncState =
  | { kind: 'off' } // not signed in
  | { kind: 'syncing' }
  | { kind: 'synced'; at: string | null }
  | { kind: 'offline' } // the last attempt failed; retried on the next change or focus
  | { kind: 'conflict'; server: ServerCopy } // both copies changed: the user chooses

const isEmpty = (r: Routine) => r.products.length === 0 && r.entries.length === 0

const toServer = (r: Routine): NonNullable<StoredRoutine['data']> => ({
  products: r.products.map(({ key, name, brand, productId, inci, groups, notices, origin }) => ({
    key, name, brand, productId, inci, groups, notices: notices ?? [], ...(origin && { origin }),
  })), // prettier-ignore
  entries: r.entries.map(({ id, productKey, session, days }) => ({ id, productKey, session, days })),
})

const fromServer = (s: StoredRoutine): ServerCopy => ({
  routine: s.data
    ? {
        ...s.data,
        // The server may answer `origin: null`; the routine has no origin then.
        products: s.data.products.map(({ origin, ...p }) => ({ ...p, ...(origin && { origin }) })),
      }
    : { products: [], entries: [] },
  version: s.version,
  updatedAt: s.updated_at,
})

const same = (a: Routine, b: Routine) => JSON.stringify(toServer(a)) === JSON.stringify(toServer(b))

export function useRoutineSync(actions: RoutineActions, email: string | null) {
  // Until the first reconcile answers, the routine is not known to be saved.
  const [state, setState] = useState<SyncState>({ kind: 'syncing' })
  // Refs keep the callbacks stable: `actions` is a new object on every render.
  const actionsRef = useRef(actions)
  const routine = useRef(actions.routine)
  const kind = useRef(state.kind)
  useLayoutEffect(() => {
    actionsRef.current = actions
    routine.current = actions.routine
    kind.current = state.kind
  })
  const meta = useRef<Meta | null>(loadMeta())
  // The routine last put in place by sync itself (server copy, or emptied): not a user's change.
  const placed = useRef<Routine | null>(null)
  const ready = useRef(false) // reconciled with the server since signing in
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inflight = useRef<Promise<void> | null>(null) // the write being sent; one at a time

  const setMeta = (next: Meta | null) => {
    meta.current = next
    saveMeta(next)
  }

  const place = (next: Routine) => {
    placed.current = next
    routine.current = next
    actionsRef.current.replace(next)
  }

  const apply = useCallback(
    (server: ServerCopy) => {
      place(server.routine)
      setMeta({ email: email!, baseVersion: server.version, dirty: false })
      setState({ kind: 'synced', at: server.updatedAt })
    },
    [email],
  )

  /** The write being sent, if any, has answered (and any write queued behind it). */
  const settled = async () => {
    while (inflight.current) await inflight.current
  }

  const push = useCallback(
    async (baseVersion?: number) => {
      // Two writes at once would both name the same base version, and the second would read as
      // a conflict with the first. Wait, then read the base version the first one left.
      const waited = inflight.current !== null
      // Inline, not `await settled()`: the extra tick of an async helper would let another call
      // start its write between the loop ending and this one claiming `inflight`.
      while (inflight.current) await inflight.current
      if (!email || !meta.current) return
      if (waited && baseVersion === undefined && !meta.current.dirty) return // already sent
      const base = baseVersion ?? meta.current.baseVersion
      const sent = routine.current
      const run = (async () => {
        setState({ kind: 'syncing' })
        try {
          const saved = await api.saveRoutine(toServer(sent), base)
          if (meta.current?.email !== email) return // forgotten meanwhile (signed out, account deleted)
          // A change made while this write was on its way is still unsent.
          setMeta({ email, baseVersion: saved.version, dirty: routine.current !== sent })
          setState({ kind: 'synced', at: saved.updated_at })
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) {
            setState({ kind: 'conflict', server: fromServer(e.body as StoredRoutine) })
          } else {
            setState({ kind: 'offline' })
          }
        }
      })()
      inflight.current = run
      try {
        await run
      } finally {
        if (inflight.current === run) inflight.current = null
      }
    },
    [email],
  )

  /** Compare with the server and do the one safe thing, or ask. */
  const reconcile = useCallback(async () => {
    if (!email) return
    await settled() // compare with what the server holds after the write being sent
    let server: ServerCopy
    try {
      server = fromServer(await api.myRoutine())
    } catch {
      setState({ kind: 'offline' })
      return
    }
    ready.current = true
    const m = meta.current
    if (m && m.email !== email) {
      // Another account's routine is on this device (shared browser): never upload it.
      place({ products: [], entries: [] })
      setMeta(null)
    }
    const local = routine.current
    const fresh = !meta.current // first sync of this browser for this account
    if (fresh) {
      if (server.version === 0) {
        setMeta({ email, baseVersion: 0, dirty: !isEmpty(local) })
        if (!isEmpty(local)) await push(0) // first sign-in: this device's routine becomes the account's
        else setState({ kind: 'synced', at: null })
      } else if (isEmpty(local) || same(local, server.routine)) {
        apply(server)
      } else {
        setMeta({ email, baseVersion: 0, dirty: true })
        setState({ kind: 'conflict', server })
      }
    } else if (server.version === meta.current!.baseVersion) {
      if (meta.current!.dirty) await push()
      else setState({ kind: 'synced', at: server.updatedAt })
    } else if (!meta.current!.dirty || same(local, server.routine)) {
      apply(server)
    } else {
      setState({ kind: 'conflict', server })
    }
  }, [apply, email, push])

  // Sign-in starts with a reconcile, and so does coming back to the tab; signing out stops.
  useEffect(() => {
    ready.current = false
    if (!email) return
    // Syncing with the server is what this effect is for; reconcile sets state only after
    // the request answers, which the rule cannot see through the callback.
    // eslint-disable-next-line react/set-state-in-effect
    void reconcile()
    const onFocus = () => void reconcile()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [email, reconcile])

  // Every change by the user is sent after a short pause.
  useEffect(() => {
    if (actions.routine === placed.current) return
    if (!email || !ready.current || meta.current?.email !== email) return
    setMeta({ ...meta.current, dirty: true })
    if (kind.current === 'conflict') return // wait for the user's choice
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void push(), PUSH_DELAY)
    return () => clearTimeout(timer.current)
    // The sync state is read through a ref: a change of state must not send the routine again.
  }, [actions.routine, email, push])

  return {
    state: email ? state : ({ kind: 'off' } as SyncState),
    /** Conflict: keep this device's copy, replacing the one other devices saved. */
    keepThisDevice: () => {
      if (state.kind === 'conflict') void push(state.server.version)
    },
    /** Conflict: take the synced copy, dropping this device's changes. */
    useSynced: () => {
      if (state.kind === 'conflict') apply(state.server)
    },
    /** Before signing out: send what is not sent yet. False if it could not be sent. */
    flush: async (): Promise<boolean> => {
      clearTimeout(timer.current) // a write waiting for its pause goes now
      await settled()
      if (!meta.current?.dirty) return true
      await push()
      return !meta.current?.dirty
    },
    /** After signing out or deleting the account: this device forgets the routine. */
    forget: () => {
      clearTimeout(timer.current)
      place({ products: [], entries: [] })
      setMeta(null)
    },
  }
}
