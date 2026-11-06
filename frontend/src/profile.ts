// The signed-in user's community profile: a nickname (required to post or comment) and an
// optional skin type. The email is never shown next to a post.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { ApiError, api, type Profile } from './api'

export type ProfileState = { kind: 'loading' } | { kind: 'ready'; profile: Profile } | { kind: 'error' }

export type ProfileApi = {
  state: ProfileState
  /**
   * The profile with a nickname; opens the profile dialog first when there is none yet.
   * Resolves to null when the user closes the dialog without saving, and to 'error' when the
   * profile could not be loaded (the dialog is not opened: saving it could replace a nickname
   * the user already has). `fresh`: ask the server again (after a 403).
   */
  require: (fresh?: boolean) => Promise<Profile | 'error' | null>
  /** Open the profile dialog to change the nickname or skin type. */
  edit: () => void
  /** Load the profile again after an error. */
  reload: () => void
}

export const ProfileContext = createContext<ProfileApi>({
  state: { kind: 'loading' },
  require: async () => null,
  edit: () => {},
  reload: () => {},
})

export const useProfile = () => useContext(ProfileContext)

export const PROFILE_LOAD_ERROR = 'Không tải được hồ sơ, hãy thử lại.'

/** A 403 from creating a post or comment: the user has no nickname yet. */
export const isProfileRequired = (e: unknown) => e instanceof ApiError && e.status === 403

/** App-level owner of the profile and its dialog. `account`: the signed-in email, null when signed out. */
export function useProfileOwner(account: string | null) {
  // Tagged with the account it belongs to: another account's profile is never shown.
  const [loaded, setLoaded] = useState<{ account: string; state: ProfileState } | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const waiting = useRef<((profile: Profile | null) => void)[]>([])
  const state: ProfileState = account !== null && loaded?.account === account ? loaded.state : { kind: 'loading' }

  const load = useCallback((): Promise<Profile | 'error'> => {
    if (account === null) return Promise.resolve('error' as const)
    return api.profile().then(
      (profile) => {
        setLoaded({ account, state: { kind: 'ready', profile } })
        return profile
      },
      () => {
        setLoaded({ account, state: { kind: 'error' } })
        return 'error' as const
      },
    )
  }, [account])

  useEffect(() => {
    void load()
  }, [load])

  const settle = (profile: Profile | null) => {
    const resolvers = waiting.current
    waiting.current = []
    for (const resolve of resolvers) resolve(profile)
  }

  const require = async (fresh = false): Promise<Profile | 'error' | null> => {
    const known = state.kind === 'ready' && !fresh ? state.profile : await load()
    if (known === 'error') return 'error'
    if (known.handle) return known
    setDialogOpen(true)
    return new Promise((resolve) => waiting.current.push(resolve))
  }

  const value: ProfileApi = {
    state,
    require,
    edit: () => state.kind === 'ready' && setDialogOpen(true),
    reload: () => void load(),
  }

  return {
    value,
    dialog: {
      open: dialogOpen,
      profile: state.kind === 'ready' ? state.profile : null,
      onSaved: (profile: Profile) => {
        if (account !== null) setLoaded({ account, state: { kind: 'ready', profile } })
        setDialogOpen(false)
        settle(profile)
      },
      onClose: () => {
        setDialogOpen(false)
        settle(null)
      },
    },
  }
}
