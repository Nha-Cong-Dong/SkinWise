// Class names shared by the "Lịch dùng" pages, after the design system (DESIGN.md): one place for
// buttons, fields and segmented controls so the four tabs look the same.

/** Secondary button: thistle wash, primary text. */
export const btn =
  'motion-press inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-primary/20 bg-wash px-5 text-sm font-semibold whitespace-nowrap text-primary hover:bg-wash-strong disabled:opacity-40'

/** Main button of a view. */
export const btnPrimary =
  'motion-press inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-primary bg-primary px-5 text-sm font-semibold whitespace-nowrap text-surface hover:bg-primary-hover disabled:border-transparent disabled:bg-wash-strong disabled:text-ink-mute'

/** Smaller buttons in lists and cards: 44px tall on phones, 36px from md. */
export const sm = 'min-h-11 px-3 md:min-h-9'

/** Text-only button (44px tall on phones, 36px from md). */
export const btnGhost =
  'motion-press inline-flex min-h-11 md:min-h-9 items-center justify-center rounded-full px-3 text-sm font-semibold whitespace-nowrap text-primary hover:bg-thistle/25 disabled:opacity-40'

/** Secondary button that removes something: same shape, red text. */
export const btnDanger =
  'motion-press inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-surface px-5 text-sm font-semibold whitespace-nowrap text-avoid-ink hover:bg-avoid-soft disabled:opacity-40'

/** Text-only button that removes something. */
export const btnGhostDanger =
  'motion-press inline-flex min-h-11 md:min-h-9 items-center justify-center rounded-full px-3 text-sm font-semibold whitespace-nowrap text-avoid-ink hover:bg-avoid-soft disabled:opacity-40'

/** Inputs and text areas: soft 12px corners, a thistle halo on focus. */
export const field =
  'block w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink transition-colors placeholder:text-ink-mute/80 hover:border-thistle focus:border-primary/60 focus:ring-4 focus:ring-thistle/35 focus:outline-none focus-visible:outline-none'

/** A drop-down list: a field with a drawn chevron (index.css .select-field). */
export const selectField = `${field} select-field`

/** A segmented control: the box, then each option. */
/** A soft pill track; the chosen option lifts out in white (no heavy fill), as the session switch. */
export const segBox = 'grid auto-cols-fr grid-flow-col gap-1 rounded-full bg-wash p-1'
export const segOption = (on: boolean) =>
  `motion-press flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 text-[0.8125rem] font-semibold whitespace-nowrap transition-colors ${
    on ? 'bg-surface text-primary shadow-[0_1px_3px_rgb(47_42_85/0.12)]' : 'text-ink-soft hover:text-ink'
  }`

/** Small caption text. */
export const caption = 'text-xs text-ink-mute'
