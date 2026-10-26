import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import { Glyph } from './Icons'

type Props = {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
}

/**
 * Native modal dialog: focus trap and Esc come from the browser. Content mounts only while open,
 * so state that must survive closing (a pasted list) lives with the caller; the element marked
 * `data-autofocus` gets focus on opening.
 */
export function Dialog({ open, onClose, title, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const pressedOnBackdrop = useRef(false)

  // The <dialog> element is the target of backdrop clicks, but also of a text selection
  // dragged out of a field and released over the backdrop, and of clicks on its own scrollbar.
  // Only a press and a release both outside its box are a click on the backdrop.
  const onBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    const box = ref.current?.getBoundingClientRect()
    return (
      e.target === ref.current &&
      box !== undefined &&
      (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom)
    )
  }

  useEffect(() => {
    const dialog = ref.current
    if (open && dialog && !dialog.open) {
      dialog.showModal()
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    if (!open && dialog?.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onPointerDown={(e) => {
        pressedOnBackdrop.current = onBackdrop(e)
      }}
      onClick={(e) => {
        if (pressedOnBackdrop.current && onBackdrop(e)) onClose()
        pressedOnBackdrop.current = false
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(44rem,calc(100%-2rem))] overflow-y-auto overscroll-contain rounded-2xl bg-surface p-0 text-ink shadow-2xl shadow-ink/30"
    >
      {open && (
        <>
          <header className="sticky top-0 z-10 flex items-start gap-4 border-b border-line bg-surface px-5 py-4">
            <div className="min-w-0 flex-1">{title}</div>
            <button
              onClick={onClose}
              aria-label="Đóng"
              className="-m-1 rounded-full p-1.5 text-ink-mute hover:bg-paper hover:text-ink"
            >
              <Glyph name="close" className="size-5" />
            </button>
          </header>
          <div className="px-5 pt-4 pb-6">{children}</div>
        </>
      )}
    </dialog>
  )
}
