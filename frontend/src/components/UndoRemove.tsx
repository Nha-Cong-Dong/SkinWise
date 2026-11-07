import { useEffect, useState } from 'react'
import type { RemovedProduct } from '../routine'

const UNDO_MS = 8000
const LEAVE_MS = 160 // the bar fades out over its last 160ms (--duration-exit)

/**
 * "Đã xoá …" with "Hoàn tác" for a few seconds after a product is removed (instead of asking
 * first). Always in the page, so a screen reader announces the message when it appears; above
 * the results bar and the tab bar that phones show at the bottom of the screen.
 */
export function UndoRemove({
  removed,
  onUndo,
  onExpire,
}: {
  removed: RemovedProduct | null
  onUndo: (removed: RemovedProduct) => void
  onExpire: () => void
}) {
  // The removal whose bar is fading out; the bar rises in 4px when it appears (ANIMATION.md 5.6).
  const [leaving, setLeaving] = useState<RemovedProduct | null>(null)
  useEffect(() => {
    if (!removed) return
    const fade = setTimeout(() => setLeaving(removed), UNDO_MS - LEAVE_MS)
    const timer = setTimeout(onExpire, UNDO_MS)
    return () => {
      clearTimeout(fade)
      clearTimeout(timer)
    }
  }, [removed, onExpire])

  return (
    <div role="status" className="fixed inset-x-3 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-md lg:bottom-6">
      {removed && (
        <div
          key={`${removed.product.key}:${removed.index}`}
          className={`${leaving === removed ? 'motion-leave' : 'motion-tab'} dusk-panel flex items-center gap-3 rounded-md bg-dusk py-2.5 pr-2.5 pl-4 text-sm text-on-dusk shadow-float`}
        >
          <span className="min-w-0 flex-1">
            Đã xoá “{removed.product.name}”
            {removed.entries.length > 0 && ` và ${removed.entries.length} bước trong lịch`}.
          </span>
          <button
            onClick={() => onUndo(removed)}
            className="min-h-11 shrink-0 rounded-full px-3 font-semibold text-thistle hover:bg-on-dusk/10"
          >
            Hoàn tác
          </button>
        </div>
      )}
    </div>
  )
}
