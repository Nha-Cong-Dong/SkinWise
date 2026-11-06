// Helpers for the community review pages. Nothing in a post (text, rating, tags, reports) ever
// reaches the rules or the check engine: the sourced part of a post page only calls the
// existing product, ingredient and routine-check routes.

import { SESSION_EXPIRED, type RoutineCheckRequest } from './api'
import type { MyProduct } from './routine'
import type { PortableRoutine } from './share'

// Limits of PostIn / CommentIn / ReportIn (backend/app/schemas.py).
export const TITLE_MIN = 5
export const TITLE_MAX = 120
export const BODY_MIN = 20
export const BODY_MAX = 10_000
export const MAX_PRODUCTS = 10
export const PRODUCT_NAME_MAX = 120
export const INCI_MAX = 10_000
export const MAX_IMAGES = 4
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const CAPTION_MAX = 200
export const COMMENT_MAX = 2000
export const REPORT_NOTE_MAX = 300
export const PAGE_SIZE = 20

/** ProfileIn.handle after strip + lower. */
export const HANDLE_PATTERN = /^[a-z0-9_.]{2,30}$/
export const normalizeHandle = (text: string) => text.trim().toLowerCase()

/**
 * A rough hint only: the server's auto_flags decides. Catches "trị", "chữa"… as words but not
 * "giá trị" / "trị giá", and anything that looks like a phone number, an email or a link.
 */
const HINT_PATTERNS = [
  /(?<![\p{L}\p{N}])(?<!giá\s)(?:điều\s+trị|đặc\s+trị|trị|chữa|khỏi\s+hẳn|khỏi\s+mụn)(?!\s+giá)(?![\p{L}\p{N}])/iu,
  /(?:\+84|(?<!\d)0)(?:[\s.-]?\d){9}(?!\d)/,
  /[\w.+-]+@[\w-]+\.[\w.-]+/,
  /https?:\/\/|www\.|[\w-]+\.(?:com|vn|net|org|info|me|io|shop|store)(?![\p{L}\p{N}])/iu,
]

export const mayBeFlagged = (text: string) => HINT_PATTERNS.some((p) => p.test(text))

/** The routine attached to a post, as a /routine/check request (step = position in the session). */
export function portableCheckRequest(routine: PortableRoutine): RoutineCheckRequest {
  const entries = routine.entries.filter((e) => e.days.length > 0)
  const used = new Set(entries.map((e) => e.productKey))
  return {
    products: routine.products
      .filter((p) => used.has(p.key))
      .map((p) => (p.productId !== undefined ? { key: p.key, product_id: p.productId } : { key: p.key, inci: p.inci ?? '' })),
    items: (['AM', 'PM'] as const).flatMap((session) =>
      entries
        .filter((e) => e.session === session)
        .map((e, i) => ({ product_key: e.productKey, session, days: e.days, step: i + 1 })),
    ),
  }
}

/** Shown after the name the author gave a pasted list, so it is not read as a catalogue name. */
export const AUTHOR_NAMED = 'tên do người viết đặt'

/**
 * The attached routine's products for the warnings panel. A catalogue product is named from the
 * catalogue (`catalogue`: product id -> "Brand Name"), never by the name the author typed.
 */
export function portableProducts(
  routine: PortableRoutine,
  groups: Map<string, string[]>,
  catalogue: Map<number, string>,
): MyProduct[] {
  return routine.products.map((p) => ({
    key: p.key,
    name:
      p.productId !== undefined
        ? (catalogue.get(p.productId) ?? `Sản phẩm số ${p.productId}`)
        : `${p.name || 'Sản phẩm tự nhập'} (${AUTHOR_NAMED})`,
    brand: null,
    productId: p.productId ?? null,
    inci: p.inci ?? null,
    groups: groups.get(p.key) ?? [],
  }))
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' })

export { SESSION_EXPIRED }
// 429 from the per-user hourly limits of backend/app/blog.py (LIMITS).
export const TOO_MANY = 'Bạn đã gửi khá nhiều trong một giờ qua. Hãy thử lại sau ít phút.'
export const isTooMany = (e: unknown) => (e as { status?: number } | null)?.status === 429

/** The session cookie expired or was signed out elsewhere. */
export const isSignedOut = (e: unknown) => (e as { status?: number } | null)?.status === 401

/** The message for a failed blog action: a 401 means the session ended, anything else `fallback`. */
export const actionError = (e: unknown, fallback: string) => (isSignedOut(e) ? SESSION_EXPIRED : fallback)
