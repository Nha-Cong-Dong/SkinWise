import { setThemeChoice, useThemeChoice, type ThemeChoice } from '../theme'
import { ThemeIcon } from './Icons'

const OPTIONS: [ThemeChoice, string][] = [
  ['system', 'Giao diện theo máy'],
  ['light', 'Giao diện sáng'],
  ['dark', 'Giao diện tối'],
]

/** Three icon buttons: device / light / dark. The choice stays in this browser only. */
export function ThemeSwitch({ className = '' }: { className?: string }) {
  const choice = useThemeChoice()
  return (
    <div
      role="group"
      aria-label="Giao diện"
      className={`inline-grid grid-flow-col gap-0.5 rounded-md border border-line bg-neutral p-0.5 ${className}`}
    >
      {OPTIONS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={choice === value}
          aria-label={label}
          title={label}
          onClick={() => setThemeChoice(value)}
          className={`motion-press inline-flex size-11 items-center justify-center rounded-sm md:size-9 ${
            choice === value ? 'bg-surface text-ink' : 'text-ink-mute hover:text-ink'
          }`}
        >
          <ThemeIcon name={value} className="size-5" />
        </button>
      ))}
    </div>
  )
}
