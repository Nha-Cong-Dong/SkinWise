import type { ReactNode } from 'react'
import type { Severity } from '../api'
import { SEVERITY } from '../labels'

type IconProps = { className?: string }

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** Half sun, half night: the two sessions of a routine. */
export function Mark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="var(--color-night)" />
      <path d="M16 1a15 15 0 0 0 0 30z" fill="var(--color-sun)" />
      <path d="M22.5 10.5a5.5 5.5 0 1 0 2.6 9.9 6.5 6.5 0 0 1-2.6-9.9z" fill="var(--color-moon)" />
    </svg>
  )
}

export function SunIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" fill="var(--color-sun)" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5"
        {...stroke}
        stroke="var(--color-sun)"
      />
    </svg>
  )
}

export function MoonIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M15.5 3.5a8.5 8.5 0 1 0 5 15.4A9.5 9.5 0 0 1 15.5 3.5z" fill="var(--color-moon)" />
    </svg>
  )
}

export function SeverityIcon({ severity, className }: IconProps & { severity: Severity }) {
  const paths: Record<Severity, string> = {
    avoid: 'M7.5 12h9',
    caution: 'M12 9v4.5M12 16.6v.1',
    info: 'M12 11v5.5M12 7.6v.1',
    safe: 'M8 12.3l2.7 2.7L16 9.6',
  }
  return (
    <svg viewBox="0 0 24 24" className={`${SEVERITY[severity].mark} ${className ?? ''}`} aria-hidden="true">
      {severity === 'caution' ? (
        <path d="M12 3.5 21.5 20h-19z" {...stroke} />
      ) : (
        <circle cx="12" cy="12" r="9" {...stroke} />
      )}
      <path d={paths[severity]} {...stroke} strokeWidth={2.25} />
    </svg>
  )
}

export function SeverityBadge({ severity, children }: { severity: Severity; children?: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full py-0.5 pr-2 pl-1 text-xs font-semibold whitespace-nowrap ${SEVERITY[severity].badge}`}
    >
      <SeverityIcon severity={severity} className="size-4" />
      {children ?? SEVERITY[severity].label}
    </span>
  )
}

const glyphs = {
  up: 'M12 18V6M6.5 11.5 12 6l5.5 5.5',
  down: 'M12 6v12M6.5 12.5 12 18l5.5-5.5',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  plus: 'M12 5.5v13M5.5 12h13',
  info: 'M12 11v5.5M12 7.6v.1',
  share: 'M12 14.5V4.5M8 8.5l4-4 4 4M6.5 12v6a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-6',
}

export function Glyph({ name, className }: IconProps & { name: keyof typeof glyphs }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {name === 'info' && <circle cx="12" cy="12" r="9" {...stroke} />}
      <path d={glyphs[name]} {...stroke} strokeWidth={name === 'info' ? 2.25 : 1.75} />
    </svg>
  )
}
