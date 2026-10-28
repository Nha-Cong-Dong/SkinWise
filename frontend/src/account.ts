// The signed-in user. Signing in is required to use the app; reviewers use #review, which has
// its own sign-in. Design: plan/h-accounts.md.

import { useCallback, useEffect, useState } from 'react'
import { ApiError, api, type Me } from './api'

/** The privacy policy shown on the form that creates an account; must match POLICY_VERSION in backend/app/accounts.py. */
export const POLICY_VERSION = '2026-10-26-draft'

export type AccountState =
  | { kind: 'checking' }
  | { kind: 'signed-out' }
  | { kind: 'signed-in'; me: Me }
  | { kind: 'unreachable' } // the server did not answer

export function useAccount() {
  const [state, setState] = useState<AccountState>({ kind: 'checking' })

  const refresh = useCallback(
    () =>
      api.me().then(
        (me) => setState({ kind: 'signed-in', me }),
        (e) => setState(e instanceof ApiError && e.status === 401 ? { kind: 'signed-out' } : { kind: 'unreachable' }),
      ),
    [],
  )

  useEffect(() => {
    void refresh()
    // A verification or reset link opened from the email signs in another tab; this one catches up on focus.
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])

  return { state, refresh, signedIn: (me: Me) => setState({ kind: 'signed-in', me }) }
}

/**
 * A link from an email, opened in this tab: "#verify-email?token=…" or "#reset-password?token=…".
 * Opening it does nothing by itself; the user acts on it with a button (mail scanners open links
 * on their own and would use up the single-use token).
 */
export type EmailLink = { kind: 'verify-email' | 'reset-password'; token: string }

export function emailLink(hash: string): EmailLink | null {
  for (const kind of ['verify-email', 'reset-password'] as const) {
    const prefix = `#${kind}?`
    if (!hash.startsWith(prefix)) continue
    const token = new URLSearchParams(hash.slice(prefix.length)).get('token')
    return token ? { kind, token } : null
  }
  return null
}
