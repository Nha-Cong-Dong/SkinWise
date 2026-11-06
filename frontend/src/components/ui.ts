// Class names shared by the "Lịch dùng" pages, after the design system (DESIGN.md): one place for
// buttons, fields and segmented controls so the four tabs look the same.

/** Secondary button: thistle wash, primary text. */
export const btn =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-primary/20 bg-thistle/30 px-5 text-sm font-semibold whitespace-nowrap text-primary hover:bg-thistle/50 disabled:opacity-40'

/** Main button of a view. */
export const btnPrimary =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-primary bg-primary px-5 text-sm font-semibold whitespace-nowrap text-surface hover:bg-primary-hover disabled:opacity-40'

/** Smaller buttons in lists and cards: 44px tall on phones, 36px from md. */
export const sm = 'min-h-11 px-3 md:min-h-9'

/** Text-only button (44px tall on phones, 36px from md). */
export const btnGhost =
  'inline-flex min-h-11 md:min-h-9 items-center justify-center rounded-full px-3 text-sm font-semibold whitespace-nowrap text-primary hover:bg-thistle/25 disabled:opacity-40'

/** Secondary button that removes something: same shape, red text. */
export const btnDanger =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-surface px-5 text-sm font-semibold whitespace-nowrap text-avoid-ink hover:bg-avoid-soft disabled:opacity-40'

/** Text-only button that removes something. */
export const btnGhostDanger =
  'inline-flex min-h-11 md:min-h-9 items-center justify-center rounded-full px-3 text-sm font-semibold whitespace-nowrap text-avoid-ink hover:bg-avoid-soft disabled:opacity-40'

/** Inputs and text areas: 4px corners (what is typed exactly), a thistle halo on focus. */
export const field =
  'block w-full rounded-sm border border-line bg-surface px-3 py-2.5 text-base text-ink placeholder:text-ink-mute/80 focus:border-primary/60 focus:ring-4 focus:ring-thistle/35 focus:outline-none focus-visible:outline-none'

/** A segmented control: the box, then each option. */
export const segBox = 'grid auto-cols-fr grid-flow-col gap-1 rounded-md border border-line bg-surface p-1'
export const segOption = (on: boolean) =>
  `flex min-h-11 items-center justify-center gap-1.5 rounded-sm px-3 text-xs font-semibold whitespace-nowrap ${
    on ? 'bg-primary text-surface' : 'text-ink-soft hover:bg-thistle/25 hover:text-ink'
  }`

/** Small caption text. */
export const caption = 'text-xs text-ink-mute'
