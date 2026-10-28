import { useRef } from 'react'
import type { usePhotoReader } from '../photoReader'

type Props = { reader: ReturnType<typeof usePhotoReader> }

/** Copy the ingredient list off a label photo with an AI model, into the paste box. */
export function ReadFromPhoto({ reader }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const { state, read } = reader

  return (
    <div className="rounded-xl border border-dashed border-ink-mute/40 p-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          onClick={() => input.current?.click()}
          disabled={state === 'loading'}
          className="rounded-full px-4 py-2 text-sm font-medium text-ink ring-1 ring-ink hover:bg-paper disabled:opacity-40"
        >
          {state === 'loading' ? 'Đang đọc ảnh…' : 'Đọc từ ảnh nhãn'}
        </button>
        <span className="text-xs text-ink-mute">hoặc dán ảnh (Ctrl+V) hay bảng thành phần vào ô bên dưới</span>
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
        Chụp gần mặt có chữ “Ingredients” hoặc “Thành phần”, đủ sáng. Ảnh được gửi qua máy chủ SkinWise tới dịch vụ AI
        bên ngoài (Claude của Anthropic) để đọc chữ; SkinWise không lưu ảnh.
      </p>
      <div aria-live="polite" className="text-sm">
        {state === 'loading' && <p className="mt-2 text-ink-mute">Có thể mất vài chục giây.</p>}
        {state === 'none' && (
          <p className="mt-2 text-avoid-ink">
            Không thấy bảng thành phần trong ảnh. Hãy chụp gần, rõ nét mặt có chữ “Ingredients” hoặc “Thành phần”.
          </p>
        )}
        {state === 'bad_image' && <p className="mt-2 text-avoid-ink">Không mở được ảnh này. Hãy chọn ảnh JPEG hoặc PNG.</p>}
        {state === 'signed_out' && (
          <p className="mt-2 text-avoid-ink">Phiên đăng nhập đã hết. Hãy đăng nhập lại để đọc ảnh.</p>
        )}
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
