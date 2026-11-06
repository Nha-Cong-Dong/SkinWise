import { useEffect, useRef, useState } from 'react'
import { CAPTION_MAX, IMAGE_TYPES, MAX_IMAGES } from '../../blog'
import { Glyph } from '../Icons'
import type { ImageItem } from './images'
import { field } from './parts'

type Props = {
  items: ImageItem[]
  setItems: (change: (list: ImageItem[]) => ImageItem[]) => void
  problem: string | null
  onFiles: (files: File[]) => void
  disabled: boolean
}

/** Pick, drop or paste (Ctrl+V on the form) up to four photos; preview, caption, order, remove. */
export function ImageUploader({ items, setItems, problem, onFiles, disabled }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  // Object URLs of new files are released when the form goes away.
  const previews = useRef<string[]>([])
  useEffect(() => {
    previews.current = items.filter((i) => i.file).map((i) => i.preview)
  }, [items])
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), [])

  const remove = (item: ImageItem) => {
    if (item.file) URL.revokeObjectURL(item.preview)
    setItems((list) => list.filter((i) => i.key !== item.key))
  }
  const move = (index: number, by: -1 | 1) =>
    setItems((list) => {
      const next = [...list]
      const j = index + by
      if (j < 0 || j >= next.length) return list
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          if (!disabled) onFiles(Array.from(e.dataTransfer.files))
        }}
        className={`rounded-xl border border-dashed p-3.5 ${over ? 'border-link bg-surface' : 'border-ink-mute/40'}`}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={disabled || items.length >= MAX_IMAGES}
            className="rounded-full px-4 py-2 text-sm font-medium text-ink ring-1 ring-ink hover:bg-paper disabled:opacity-40"
          >
            Chọn ảnh
          </button>
          <span className="text-xs text-ink-mute">hoặc kéo thả ảnh vào đây, hay dán ảnh (Ctrl+V)</span>
        </div>
        <input
          ref={input}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = '' // the same photo can be picked again
            onFiles(files)
          }}
        />
        <p className="mt-2 text-xs leading-relaxed text-ink-mute">
          Tối đa 4 ảnh, mỗi ảnh tối đa 5 MB (JPEG, PNG, WebP). Không đăng ảnh có khuôn mặt người khác, số điện thoại hay
          thông tin cá nhân. Thông tin vị trí trong ảnh sẽ được xoá.
        </p>
        {problem && (
          <p className="mt-2 text-sm text-avoid-ink" aria-live="polite">
            {problem}
          </p>
        )}
      </div>

      {items.length > 0 && (
        <ol className="mt-3 grid gap-3 sm:grid-cols-2">
          {items.map((item, n) => (
            <li key={item.key} className="rounded-xl bg-surface p-2.5 ring-1 ring-line">
              <div className="relative">
                <img
                  src={item.preview}
                  alt={item.caption.trim() || `Ảnh ${n + 1} của bài viết`}
                  className="aspect-[4/3] w-full rounded-lg bg-paper object-cover"
                />
                {item.status === 'uploading' && (
                  <span className="absolute inset-x-2 bottom-2 rounded-full bg-surface/90 px-2 py-0.5 text-center text-xs text-ink">
                    Đang tải lên…
                  </span>
                )}
              </div>
              {item.file ? (
                <input
                  value={item.caption}
                  onChange={(e) => {
                    const caption = e.target.value
                    setItems((list) => list.map((i) => (i.key === item.key ? { ...i, caption } : i)))
                  }}
                  maxLength={CAPTION_MAX}
                  placeholder="Chú thích (không bắt buộc)"
                  aria-label={`Chú thích ảnh ${n + 1}`}
                  disabled={disabled}
                  className={`mt-2 ${field} py-1.5 text-sm`}
                />
              ) : (
                item.caption && <p className="mt-2 text-xs text-ink-soft">{item.caption}</p>
              )}
              {item.error && <p className="mt-1 text-xs text-avoid-ink">{item.error}</p>}
              <div className="mt-2 flex items-center gap-1 text-xs text-ink-mute">
                <span className="mr-auto">Ảnh {n + 1}{n === 0 && ' · ảnh bìa'}</span>
                <button
                  type="button"
                  onClick={() => move(n, -1)}
                  disabled={disabled || n === 0}
                  aria-label="Đưa lên trước"
                  className="rounded-full p-1 hover:bg-paper hover:text-ink disabled:opacity-30"
                >
                  <Glyph name="up" className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(n, 1)}
                  disabled={disabled || n === items.length - 1}
                  aria-label="Đưa xuống sau"
                  className="rounded-full p-1 hover:bg-paper hover:text-ink disabled:opacity-30"
                >
                  <Glyph name="down" className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(item)}
                  disabled={disabled}
                  className="rounded-full px-2 py-1 hover:bg-paper hover:text-ink disabled:opacity-30"
                >
                  Xoá
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
