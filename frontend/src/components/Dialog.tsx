import { useEffect, useRef, type ReactNode } from 'react'
import { Glyph } from './Icons'

type Props = {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
}

/**
 * Native modal dialog: focus trap and Esc come from the browser. Content mounts only while open;
 * the element marked `data-autofocus` gets focus on opening.
 */
export function Dialog({ open, onClose, title, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

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
      // The dialog element itself only receives clicks on the backdrop.
      onClick={(e) => e.target === ref.current && onClose()}
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
