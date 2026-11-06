import type { PostProductIn } from '../../api'
import { newId } from '../../routine'

/** A product attached to a post: from the catalogue, or a name with a pasted ingredient list. */
export type Picked =
  | { key: string; productId: number; name: string; brand: string; groups: string[] }
  | { key: string; productId: null; name: string; inci: string }

export const pickedKey = (p: { productId: number | null }) => (p.productId !== null ? `p${p.productId}` : `c${newId()}`)

export function toPostProduct(p: Picked): PostProductIn {
  return p.productId !== null ? { product_id: p.productId } : { name: p.name.trim(), inci: p.inci.trim() }
}
