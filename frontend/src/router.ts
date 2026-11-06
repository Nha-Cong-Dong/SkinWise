// Pages by address hash, without a library: every page, post, product and author has its own
// link, and the browser's back button works. Older hashes keep their meaning: "#review" (the
// reviewers' page), "#/routine" (now "Lịch dùng", today's tab), and "#routine=…", "#verify-email?…",
// "#reset-password?…", which belong to the routine page (share.ts, account.ts and App.tsx read
// them); "#results" opens the check tab.

import { useMemo, useSyncExternalStore } from 'react'
import type { SkinType } from './api'

export type BlogFilter = { skin: SkinType | null; product: number | null; sort: 'new' | 'top' }

/** The four tabs of "Lịch dùng": today, the week, the shelf, the check results. */
export type RoutineTab = 'today' | 'week' | 'shelf' | 'check'

export const ROUTINE_TABS: Record<RoutineTab, string> = {
  today: 'hom-nay',
  week: 'lich-tuan',
  shelf: 'tu-do',
  check: 'kiem-tra',
}

export type Route =
  | { page: 'routine'; tab: RoutineTab }
  | { page: 'shelf-product'; key: string } // one product of the shelf, by its routine key
  | { page: 'goals' }
  | { page: 'goal-article'; code: string }
  | { page: 'myths' }
  | { page: 'review' }
  | { page: 'blog'; filter: BlogFilter }
  | { page: 'saved' }
  | { page: 'write'; product: number | null } // product: start the post with this catalogue product
  | { page: 'post'; id: number }
  | { page: 'edit'; id: number }
  | { page: 'product'; id: number }
  | { page: 'author'; handle: string }
  | { page: 'not-found' }

const SKIN_TYPES: SkinType[] = ['oily', 'dry', 'combination', 'normal', 'sensitive']
const LEGACY_ROUTINE = ['#routine=', '#verify-email?', '#reset-password?']

// Keys made by routine.ts: "p12" (catalogue product), "c" + a random id (pasted list).
const PRODUCT_KEY = /^[A-Za-z0-9_-]{1,64}$/

const toId = (text: string | null | undefined): number | null =>
  text && /^[1-9]\d{0,15}$/.test(text) ? Number(text) : null

export function parseHash(hash: string): Route {
  if (hash === '#review') return { page: 'review' }
  if (hash === '#results') return { page: 'routine', tab: 'check' }
  if (hash === '' || hash === '#' || LEGACY_ROUTINE.some((p) => hash.startsWith(p))) {
    return { page: 'routine', tab: 'today' }
  }
  if (!hash.startsWith('#/')) return { page: 'routine', tab: 'today' } // an in-page anchor of the routine page

  const [path, search = ''] = hash.slice(2).split('?', 2)
  const query = new URLSearchParams(search)
  const parts = path.split('/').filter(Boolean)
  const [first, second, third] = parts

  switch (first) {
    case undefined:
    case 'routine': // the address before "Lịch dùng" had tabs
      return parts.length <= 1 ? { page: 'routine', tab: 'today' } : { page: 'not-found' }
    case 'lich-dung': {
      if (second === undefined) return { page: 'routine', tab: 'today' }
      const tab = (Object.keys(ROUTINE_TABS) as RoutineTab[]).find((t) => ROUTINE_TABS[t] === second)
      if (tab === 'shelf' && parts.length === 3 && PRODUCT_KEY.test(third)) return { page: 'shelf-product', key: third }
      return tab && parts.length === 2 ? { page: 'routine', tab } : { page: 'not-found' }
    }
    case 'muc-tieu':
      if (parts.length === 1) return { page: 'goals' }
      return parts.length === 2 && /^[a-z0-9-]{1,64}$/.test(second) ? { page: 'goal-article', code: second } : { page: 'not-found' }
    case 'myth':
      return parts.length === 1 ? { page: 'myths' } : { page: 'not-found' }
    case 'blog': {
      if (second === undefined) {
        const skin = query.get('da')
        return {
          page: 'blog',
          filter: {
            skin: SKIN_TYPES.includes(skin as SkinType) ? (skin as SkinType) : null,
            product: toId(query.get('sp')),
            sort: query.get('sort') === 'top' ? 'top' : 'new',
          },
        }
      }
      if (second === 'da-luu' && third === undefined) return { page: 'saved' }
      if (second === 'viet' && third === undefined) return { page: 'write', product: toId(query.get('sp')) }
      const id = toId(second)
      if (id === null) return { page: 'not-found' }
      if (third === undefined) return { page: 'post', id }
      if (third === 'sua' && parts.length === 3) return { page: 'edit', id }
      return { page: 'not-found' }
    }
    case 'san-pham': {
      const id = toId(second)
      return id !== null && parts.length === 2 ? { page: 'product', id } : { page: 'not-found' }
    }
    case 'tac-gia': {
      let handle = ''
      try {
        handle = decodeURIComponent(second ?? '')
      } catch {
        // A broken escape: no such author.
      }
      return handle && parts.length === 2 ? { page: 'author', handle } : { page: 'not-found' }
    }
    default:
      return { page: 'not-found' }
  }
}

export function href(route: Route): string {
  switch (route.page) {
    case 'routine':
      return `#/lich-dung/${ROUTINE_TABS[route.tab]}`
    case 'shelf-product':
      return `#/lich-dung/${ROUTINE_TABS.shelf}/${route.key}`
    case 'goals':
      return '#/muc-tieu'
    case 'goal-article':
      return `#/muc-tieu/${route.code}`
    case 'myths':
      return '#/myth'
    case 'review':
      return '#review'
    case 'blog': {
      const query = new URLSearchParams()
      if (route.filter.skin) query.set('da', route.filter.skin)
      if (route.filter.product !== null) query.set('sp', String(route.filter.product))
      if (route.filter.sort === 'top') query.set('sort', 'top')
      const search = query.toString()
      return search ? `#/blog?${search}` : '#/blog'
    }
    case 'saved':
      return '#/blog/da-luu'
    case 'write':
      return route.product !== null ? `#/blog/viet?sp=${route.product}` : '#/blog/viet'
    case 'post':
      return `#/blog/${route.id}`
    case 'edit':
      return `#/blog/${route.id}/sua`
    case 'product':
      return `#/san-pham/${route.id}`
    case 'author':
      return `#/tac-gia/${encodeURIComponent(route.handle)}`
    case 'not-found':
      return '#/khong-tim-thay'
  }
}

export const ALL_POSTS: Route = { page: 'blog', filter: { skin: null, product: null, sort: 'new' } }

/** Go to a page; `replace` leaves no history entry (after deleting a post, for one). */
export function navigate(route: Route, { replace = false } = {}): void {
  const target = href(route)
  if (replace) {
    history.replaceState(null, '', target)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = target
  }
}

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange)
  window.addEventListener('popstate', onChange)
  return () => {
    window.removeEventListener('hashchange', onChange)
    window.removeEventListener('popstate', onChange)
  }
}

/** The current page; follows links, back / forward and navigate(). */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  return useMemo(() => parseHash(hash), [hash])
}

/** Pages of the "Review cộng đồng" section of the menu. */
export function isBlogPage(route: Route): boolean {
  return ['blog', 'saved', 'write', 'post', 'edit', 'product', 'author'].includes(route.page)
}
