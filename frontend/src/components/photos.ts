import { useEffect, useState, useSyncExternalStore } from 'react'
import { api, ApiError, type ProductImageOut } from '../api'
import type { MyProduct } from '../routine'

/**
 * What ProductImage shows: a catalogue photo (with its Open Beauty Facts credit), the user's own
 * photo (no credit), or nothing (the initial).
 */
export type ProductPhoto = { url: string; credit: ProductImageOut | null }

// Photo addresses that failed to load (deleted, cleaned up, signed out): the tile shows the
// initial instead, and the credit line goes with the photo. Shared by every place showing it.
const failed = new Set<string>()
const failListeners = new Set<() => void>()

export function markPhotoFailed(url: string): void {
  if (failed.has(url)) return
  failed.add(url)
  failListeners.forEach((l) => l())
}

const subscribeFailed = (onChange: () => void) => {
  failListeners.add(onChange)
  return () => {
    failListeners.delete(onChange)
  }
}

/** False once this photo has failed to load anywhere on the page. */
export function usePhotoShows(photo: ProductPhoto | null): boolean {
  const url = photo?.url ?? ''
  return useSyncExternalStore(subscribeFailed, () => photo !== null && !failed.has(url))
}

/** The photo for a catalogue product, or null. */
export const cataloguePhoto = (image: ProductImageOut | null | undefined): ProductPhoto | null =>
  image ? { url: `/api${image.url}`, credit: image } : null

/** The user's own photo of a typed-in product, or null. */
export const userPhoto = (photoId: number | undefined): ProductPhoto | null =>
  photoId !== undefined ? { url: `/api/me/product-photos/${photoId}`, credit: null } : null

// Catalogue photos by product id, loaded once per page load (GET /products is public and small).
let catalogue: Promise<Map<number, ProductImageOut>> | null = null

function loadCatalogue(): Promise<Map<number, ProductImageOut>> {
  catalogue ??= api.searchProducts('').then(
    (list) => new Map(list.flatMap((p) => (p.image ? [[p.id, p.image] as const] : []))),
    () => {
      catalogue = null // try again next time
      return new Map()
    },
  )
  return catalogue
}

/** Catalogue photos by product id; empty until loaded, and when the list cannot be loaded. */
export function useCatalogueImages(): Map<number, ProductImageOut> {
  const [images, setImages] = useState<Map<number, ProductImageOut>>(new Map())
  useEffect(() => {
    let live = true
    void loadCatalogue().then((m) => live && setImages(m))
    return () => {
      live = false
    }
  }, [])
  return images
}

/** The photo to show for a shelf product: its catalogue photo, or the user's own. */
export function photoOf(product: MyProduct, images: Map<number, ProductImageOut>): ProductPhoto | null {
  return product.productId !== null ? cataloguePhoto(images.get(product.productId)) : userPhoto(product.photoId)
}

/** What to tell the user when a photo cannot be uploaded or deleted. */
export function photoError(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Không kết nối được máy chủ. Hãy thử lại.'
  switch (e.status) {
    case 401:
      return 'Phiên đăng nhập đã hết. Hãy đăng nhập lại.'
    case 409:
      return 'Tài khoản đã có 60 ảnh sản phẩm, mức tối đa. Hãy xoá ảnh ở sản phẩm khác rồi thử lại.'
    case 413:
      return 'Ảnh lớn hơn 5 MB. Hãy chọn ảnh nhỏ hơn.'
    case 415:
      return 'Chỉ nhận ảnh JPEG, PNG hoặc WebP, tối đa 100 megapixel.'
    case 429:
      return 'Bạn đã tải nhiều ảnh trong một giờ. Hãy thử lại sau.'
    default:
      return 'Không lưu được ảnh. Hãy thử lại.'
  }
}
