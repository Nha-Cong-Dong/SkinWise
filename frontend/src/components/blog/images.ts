import { ApiError, api, imageSrc, type ImageOut } from '../../api'
import { IMAGE_MAX_BYTES, IMAGE_TYPES, MAX_IMAGES, SESSION_EXPIRED } from '../../blog'
import { newId } from '../../routine'

/**
 * A photo of the post. A new photo is sent to the server when the post is saved (with its
 * caption, which cannot change once uploaded); a photo already on the post keeps its caption.
 */
export type ImageItem = {
  key: string
  preview: string // object URL of a new file, or the uploaded image's address
  file: File | null // null: already on the post
  caption: string
  uploaded: { id: number; caption: string } | null
  status: 'idle' | 'uploading' | 'error'
  error: string | null
}

export const fromExisting = (image: ImageOut): ImageItem => ({
  key: `i${image.id}`,
  preview: imageSrc(image),
  file: null,
  caption: image.caption ?? '',
  uploaded: { id: image.id, caption: image.caption ?? '' },
  status: 'idle',
  error: null,
})

const TOO_BIG = 'Ảnh lớn hơn 5 MB.'
const NOT_IMAGE = 'Tệp này không phải ảnh JPEG, PNG hay WebP.'

export function uploadError(e: unknown): string {
  const status = e instanceof ApiError ? e.status : 0
  if (status === 401) return SESSION_EXPIRED
  if (status === 413) return TOO_BIG
  if (status === 415 && e instanceof ApiError && e.message === 'image too large in pixels') return 'Ảnh có độ phân giải quá lớn.'
  if (status === 415) return NOT_IMAGE
  if (status === 429) return 'Bạn đã tải lên quá nhiều ảnh, hãy thử lại sau.'
  if (status === 422) return 'Chú thích hoặc tệp ảnh chưa hợp lệ.'
  return 'Không tải ảnh lên được. Hãy thử lại.'
}

/**
 * Upload the photos that are not on the server yet (or whose caption changed): ids in order,
 * null when one failed, 'signed-out' when the session ended (the rest are not tried).
 */
export async function uploadAll(
  items: ImageItem[],
  setItems: (change: (list: ImageItem[]) => ImageItem[]) => void,
): Promise<number[] | null | 'signed-out'> {
  const patch = (key: string, change: Partial<ImageItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...change } : i)))
  const ids: number[] = []
  let failed = false
  for (const item of items) {
    const caption = item.caption.trim()
    if (item.uploaded && (item.file === null || item.uploaded.caption === caption)) {
      ids.push(item.uploaded.id)
      continue
    }
    if (!item.file) continue
    patch(item.key, { status: 'uploading', error: null })
    try {
      const image = await api.uploadImage(item.file, caption)
      patch(item.key, { status: 'idle', uploaded: { id: image.id, caption } })
      ids.push(image.id)
    } catch (e) {
      patch(item.key, { status: 'error', error: uploadError(e) })
      if ((e as { status?: number } | null)?.status === 401) return 'signed-out'
      failed = true
    }
  }
  return failed ? null : ids
}

/** Files from a file picker, a drop or a paste; the ones the server would refuse are named at once. */
export function addFiles(files: File[], items: ImageItem[]): { added: ImageItem[]; problem: string | null } {
  let problem: string | null = null
  const added: ImageItem[] = []
  for (const file of files) {
    if (items.length + added.length >= MAX_IMAGES) {
      problem = `Chỉ thêm được tối đa ${MAX_IMAGES} ảnh.`
      break
    }
    if (!IMAGE_TYPES.includes(file.type)) {
      problem = NOT_IMAGE
      continue
    }
    if (file.size > IMAGE_MAX_BYTES) {
      problem = TOO_BIG
      continue
    }
    added.push({
      key: `n${newId()}`,
      preview: URL.createObjectURL(file),
      file,
      caption: '',
      uploaded: null,
      status: 'idle',
      error: null,
    })
  }
  return { added, problem }
}
