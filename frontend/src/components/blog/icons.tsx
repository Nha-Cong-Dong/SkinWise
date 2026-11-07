// Line icons of the review pages (24px grid, 1.75 stroke, currentColor), drawn after the design's
// side menu and action row. Decorative: every use has a text label next to it or an aria-label.

const paths = {
  feed: 'M4.5 10.5 12 4.5l7.5 6V19a1 1 0 0 1-1 1h-4v-5.5h-5V20h-4a1 1 0 0 1-1-1z',
  pen: 'M14.5 5.5l4 4M5 19l1-4.5L15.5 5a1.4 1.4 0 0 1 2 0l1.5 1.5a1.4 1.4 0 0 1 0 2L9.5 18 5 19z',
  user: 'M12 12a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5zM5 20c.8-3.4 3.6-5.5 7-5.5s6.2 2.1 7 5.5',
  bookmark: 'M7 4.5h10a.5.5 0 0 1 .5.5v14.5L12 16l-5.5 3.5V5a.5.5 0 0 1 .5-.5z',
  heart:
    'M12 19.5s-7-4.3-7-9.4A3.9 3.9 0 0 1 8.9 6.2c1.3 0 2.4.6 3.1 1.6.7-1 1.8-1.6 3.1-1.6A3.9 3.9 0 0 1 19 10.1c0 5.1-7 9.4-7 9.4z',
  drop: 'M12 4c3 3.6 5.5 6.6 5.5 9.5a5.5 5.5 0 0 1-11 0C6.5 10.6 9 7.6 12 4z',
  bell: 'M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5zM10 20.5h4',
  comment: 'M5 6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-4 3.5V16h0A1 1 0 0 1 5 15z',
  reply: 'M10 7 5 11.5l5 4.5M5.5 11.5H14a5 5 0 0 1 5 5v1',
  search: 'M10.75 17a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5zM15.25 15.25 19.5 19.5',
  back: 'M14.5 6 8.5 12l6 6',
}

export type BlogIconName = keyof typeof paths

export function BlogIcon({ name, filled = false, className }: { name: BlogIconName; filled?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? 'size-5'} aria-hidden="true">
      <path
        d={paths[name]}
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
