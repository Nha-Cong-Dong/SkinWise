import type { ReactNode } from 'react'
import { Glyph } from './Icons'

/** Shown when nothing matched: no warning must not read as "safe". */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl bg-surface p-4 text-sm leading-relaxed text-ink-soft ring-1 ring-line">
      <Glyph name="info" className="mt-0.5 size-5 shrink-0 text-ink-mute" />
      <p>{children}</p>
    </div>
  )
}

/** The data may be incomplete, so the check may be missing warnings. Not a rule warning. */
export function DataNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-caution bg-surface p-4 text-sm leading-relaxed text-ink-soft">
      <p className="font-semibold text-caution-ink">{title}</p>
      <div className="mt-1">{children}</div>
    </div>
  )
}
