import { setThemeChoice, useIsDark } from '../theme'
import { ThemeIcon } from './Icons'

/**
 * One button that flips light / dark. The page follows the device until the first press; the
 * choice stays in this browser only. The icon shows the theme in use.
 */
export function ThemeSwitch({ className = '' }: { className?: string }) {
  const dark = useIsDark()
  const label = dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setThemeChoice(dark ? 'light' : 'dark')}
      className={`motion-press inline-flex size-11 items-center justify-center rounded-full text-ink-soft hover:bg-thistle/25 hover:text-ink md:size-10 ${className}`}
    >
      <ThemeIcon name={dark ? 'dark' : 'light'} className="size-5" />
    </button>
  )
}
