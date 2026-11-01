// An unsent post kept in sessionStorage (this tab only), so an expired session or a slip of the
// back button does not lose it. Photos are not kept (files cannot be stored). Cleared when the
// post is saved and when the user signs out or deletes the account.

import type { Disclosure, SkinType } from '../../api'
import type { Picked } from './picked'

export type RoutineChoice = 'none' | 'current' | 'kept'

export type PostDraft = {
  account: string // the email it belongs to: never offered to another account on this device
  title: string
  body: string
  rating: number | null
  skin: SkinType | null
  disclosure: Disclosure
  picked: Picked[]
  choice: RoutineChoice
}

const PREFIX = 'skinwise.blog-draft.'

const keyFor = (postId: number | null) => `${PREFIX}${postId ?? 'new'}`

export function loadDraft(postId: number | null, account: string): PostDraft | null {
  try {
    const draft = JSON.parse(sessionStorage.getItem(keyFor(postId)) ?? 'null') as PostDraft | null
    if (draft && draft.account === account && typeof draft.title === 'string' && Array.isArray(draft.picked)) return draft
  } catch {
    // Storage blocked or corrupt: no draft.
  }
  return null
}

export function saveDraft(postId: number | null, draft: PostDraft): void {
  try {
    sessionStorage.setItem(keyFor(postId), JSON.stringify(draft))
  } catch {
    // Storage blocked or full: the form still works, without a draft.
  }
}

export function clearDraft(postId: number | null): void {
  try {
    sessionStorage.removeItem(keyFor(postId))
  } catch {
    // Storage blocked: nothing was kept.
  }
}

/** Every post draft in this tab (signing out, deleting the account). */
export function clearAllDrafts(): void {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(PREFIX)) sessionStorage.removeItem(key)
    }
  } catch {
    // Storage blocked: nothing was kept.
  }
}
