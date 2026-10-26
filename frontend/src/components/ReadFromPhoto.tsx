import { useRef, useState } from 'react'
import { api, ApiError } from '../api'

// Claude reads at most 2576 px on the long edge and 4784 tiles of 28×28 px. A bigger photo is
// scaled down on arrival anyway, after a slower upload.
const MAX_EDGE = 2576
const MAX_PIXELS = 4784 * 28 * 28 * 0.98

/** The photo as a JPEG no bigger than the model reads, as base64 and as a data URL. */
async function prepare(file: File): Promise<{ data: string; preview: string }> {
  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(width * scale))
  canvas.height = Math.max(1, Math.floor(height * scale))
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const preview = canvas.toDataURL('image/jpeg', 0.9)
  return { data: preview.slice(preview.indexOf(',') + 1), preview }
}

type State = 'idle' | 'loading' | 'none' | 'bad_image' | 'off' | 'error'

type Props = {
  /** The text read off the photo, for the user to check, and the photo to check it against. */
  onRead: (text: string, photo: string) => void
  /** Asked before sending a photo; false keeps what the user already pasted. */
  mayReplace: () => boolean
}

/** Copy the ingredient list off a label photo with an AI model, into the paste box. */
export function ReadFromPhoto({ onRead, mayReplace }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<State>('idle')

  const read = async (file: File) => {
    setState('loading')
    let image: { data: string; preview: string }
    try {
      image = await prepare(file)
    } catch {
      setState('bad_image')
      return
    }
    api.readLabel({ media_type: 'image/jpeg', data: image.data }).then(
      (reading) => {
        if (!reading.found) {
          setState('none')
          return
        }
        setState('idle')
        onRead(reading.text, image.preview)
      },
      (e) => {
        const status = e instanceof ApiError ? e.status : 0
        setState(status === 503 ? 'off' : status === 422 ? 'bad_image' : 'error')
      },
    )
  }

  return (
    <div className="rounded-xl border border-dashed border-ink-mute/40 p-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          onClick={() => mayReplace() && input.current?.click()}
          disabled={state === 'loading'}
          className="rounded-full px-4 py-2 text-sm font-medium text-ink ring-1 ring-ink hover:bg-paper disabled:opacity-40"
        >
          {state === 'loading' ? 'Đang đọc ảnh…' : 'Đọc từ ảnh nhãn'}
        </button>
        <span className="text-xs text-ink-mute">hoặc dán bảng thành phần vào ô bên dưới</span>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = '' // the same photo can be picked again
          if (file) read(file)
        }}
      />
      <p className="mt-2 text-xs leading-relaxed text-ink-mute">
        Chụp gần mặt có chữ “Ingredients” hoặc “Thành phần”, đủ sáng. Ảnh được gửi qua máy chủ SkinWise tới Anthropic
        (dịch vụ AI) để đọc chữ; SkinWise không lưu ảnh.
      </p>
      <div aria-live="polite" className="text-sm">
        {state === 'loading' && <p className="mt-2 text-ink-mute">Có thể mất vài chục giây.</p>}
        {state === 'none' && (
          <p className="mt-2 text-avoid-ink">
            Không thấy bảng thành phần trong ảnh. Hãy chụp gần, rõ nét mặt có chữ “Ingredients” hoặc “Thành phần”.
          </p>
        )}
        {state === 'bad_image' && <p className="mt-2 text-avoid-ink">Không mở được ảnh này. Hãy chọn ảnh JPEG hoặc PNG.</p>}
        {state === 'off' && (
          <p className="mt-2 text-avoid-ink">Máy chủ này chưa bật chức năng đọc ảnh. Hãy dán bảng thành phần.</p>
        )}
        {state === 'error' && (
          <p className="mt-2 text-avoid-ink">Không đọc được ảnh lúc này. Hãy thử lại, hoặc dán bảng thành phần.</p>
        )}
      </div>
    </div>
  )
}
