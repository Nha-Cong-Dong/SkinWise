import type { ReactNode } from 'react'
import type { Severity } from '../api'
import { SEVERITY } from '../labels'
import logoDarkUrl from '../assets/brand/skinwise-logo-dark.svg'
import logoUrl from '../assets/brand/skinwise-logo.svg'

type IconProps = { className?: string }

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** The logo with the word "SkinWise". */
export function Logo({ className }: IconProps) {
  // The design has its own file for the dark theme; only the one that fits is shown.
  return (
    <>
      <img src={logoUrl} alt="SkinWise" className={`${className ?? ''} dark:hidden`} width={293} height={80} />
      <img src={logoDarkUrl} alt="SkinWise" className={`${className ?? ''} hidden dark:inline-block`} width={293} height={80} />
    </>
  )
}

export function SunIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" fill="var(--color-dawn-ink)" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5"
        {...stroke}
        stroke="var(--color-dawn-ink)"
      />
    </svg>
  )
}

export function MoonIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M15.5 3.5a8.5 8.5 0 1 0 5 15.4A9.5 9.5 0 0 1 15.5 3.5z" fill="var(--color-thistle)" />
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
      className={`inline-flex items-center gap-1 rounded-sm py-0.5 pr-1.5 pl-1 text-xs font-semibold whitespace-nowrap ${SEVERITY[severity].badge}`}
    >
      <SeverityIcon severity={severity} className="size-4" />
      {children ?? SEVERITY[severity].label}
    </span>
  )
}

/** Line icons of the theme switch: device (screen), light (sun), dark (moon). Decorative. */
export function ThemeIcon({ name, className }: IconProps & { name: 'system' | 'light' | 'dark' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {name === 'system' && (
        <path d="M4 5.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM9 20.5h6M12 16.5v4" {...stroke} />
      )}
      {name === 'light' && (
        <>
          <circle cx="12" cy="12" r="4" {...stroke} />
          <path
            d="M12 2.75v2M12 19.25v2M2.75 12h2M19.25 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"
            {...stroke}
          />
        </>
      )}
      {name === 'dark' && <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" {...stroke} />}
    </svg>
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
