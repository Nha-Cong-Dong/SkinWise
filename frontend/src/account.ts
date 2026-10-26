// The signed-in user. Signing in is required to use the app; reviewers use #review, which has
// its own sign-in. Design: plan/h-accounts.md.

import { useCallback, useEffect, useState } from 'react'
import { ApiError, api, type Me } from './api'

/** The privacy policy shown on the sign-in form; must match POLICY_VERSION in backend/app/accounts.py. */
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
    // A sign-in link opened from the email lands in another tab; this one catches up on focus.
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])

  return { state, refresh, signedIn: (me: Me) => setState({ kind: 'signed-in', me }) }
}

/** The token of a sign-in link opened in this tab ("#sign-in?token=…"), or null. */
export function signInToken(hash: string): string | null {
  if (!hash.startsWith('#sign-in?')) return null
  return new URLSearchParams(hash.slice('#sign-in?'.length)).get('token')
}
