import type { CSSProperties } from 'react'

/**
 * Place of a block in the first-visit rise of its tab (`motion-enter`, ANIMATION.md 5.1): 0 for
 * the header, then the blocks in reading order. The delay is capped in CSS.
 */
export function stagger(i: number): CSSProperties {
  return { '--i': i } as CSSProperties
}
