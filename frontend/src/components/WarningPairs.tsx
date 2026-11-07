import type { Warning } from '../api'
import { warningProducts } from '../routine'

/**
 * The products and days of the warnings in one rule's card: a line for a single pair, a list when
 * the rule was raised for several pairs. Every pair is shown; none is merged into another.
 */
export function WarningPairs({
  warnings,
  names,
  when,
}: {
  warnings: Warning[]
  names: Map<string, string>
  when: (w: Warning) => string
}) {
  if (warnings.length === 1) {
    return (
      <p className="mt-1 text-xs text-ink-mute">
        {warningProducts(warnings[0], names)} · {when(warnings[0])}
      </p>
    )
  }
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-ink-mute">
      {warnings.map((w) => (
        <li key={w.product_keys.join('+')}>
          {warningProducts(w, names)} · {when(w)}
        </li>
      ))}
    </ul>
  )
}
