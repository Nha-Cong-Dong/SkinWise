import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react'
import { Glyph } from './Icons'

type Props = {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
}

/** A dialog's title in the design's Nunito, primary colour. */
export function DialogTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-brand text-2xl leading-tight font-semibold tracking-[-0.01em] text-pretty text-primary sm:text-[1.875rem]">
      {children}
    </h2>
  )
}

/**
 * Native modal dialog: focus trap and Esc come from the browser. Content mounts only while open,
 * so state that must survive closing (a pasted list) lives with the caller; the element marked
 * `data-autofocus` gets focus on opening.
 */
export function Dialog({ open, onClose, title, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId() // names the dialog: a screen reader announces the title, not just "dialog"
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
      aria-labelledby={titleId}
      onClose={onClose}
      onPointerDown={(e) => {
        pressedOnBackdrop.current = onBackdrop(e)
      }}
      onClick={(e) => {
        if (pressedOnBackdrop.current && onBackdrop(e)) onClose()
        pressedOnBackdrop.current = false
      }}
      className="motion-dialog m-auto max-h-[calc(100dvh-2rem)] w-[min(44rem,calc(100%-2rem))] overflow-y-auto overscroll-contain rounded-md bg-surface p-0 text-ink shadow-float"
    >
      {open && (
        <>
          <header className="sticky top-0 z-10 flex items-start gap-4 bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--color-thistle)_24%,var(--color-surface)),var(--color-surface))] px-5 pt-5 pb-3 sm:px-7 sm:pt-6">
            <div id={titleId} className="min-w-0 flex-1">
              {title}
            </div>
            <button
              onClick={onClose}
              aria-label="Đóng"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-wash text-primary hover:bg-wash-strong"
            >
              <Glyph name="close" className="size-5" />
            </button>
          </header>
          <div className="px-5 pt-3 pb-6 sm:px-7 sm:pb-7">{children}</div>
        </>
      )}
    </dialog>
  )
}
