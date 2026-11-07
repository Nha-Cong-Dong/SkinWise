import { useEffect, useState, type CSSProperties, type RefObject } from 'react'

/**
 * Place of a block in the first-visit rise of its tab (`motion-enter`, ANIMATION.md 5.1): 0 for
 * the header, then the blocks in reading order. The delay is capped in CSS.
 */
export function stagger(i: number): CSSProperties {
  return { '--i': i } as CSSProperties
}

/**
 * Whether what a link pointed at is still lit (`.motion-spotlight`, ANIMATION.md 5.9): from the
 * moment `target` is set until the user's next click, tap or key press anywhere on the page
 * (except inside `keep`, e.g. the banner that explains the lit steps). A new `target` lights again.
 * Scrolling does not count: the user may need to scroll to look at it.
 */
export function useSpotlight(target: string | null, keep?: RefObject<HTMLElement | null>): boolean {
  const [dismissed, setDismissed] = useState<string | null>(null)
  useEffect(() => {
    if (target === null) return
    const off = (e: Event) => {
      if (keep?.current && e.target instanceof Node && keep.current.contains(e.target)) return
      setDismissed(target)
    }
    document.addEventListener('pointerdown', off, true)
    document.addEventListener('keydown', off, true)
    return () => {
      document.removeEventListener('pointerdown', off, true)
      document.removeEventListener('keydown', off, true)
    }
  }, [target, keep])
  return target !== null && dismissed !== target
}

/** Classes of an element a link pointed at: lifted while lit, settling back once dismissed. */
export function spotClass(pointed: boolean, lit: boolean): string {
  if (!pointed) return ''
  return lit ? 'motion-spotlight' : 'motion-spotlight spotlight-off'
}
