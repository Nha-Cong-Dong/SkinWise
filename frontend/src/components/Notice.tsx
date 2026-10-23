import type { ReactNode } from 'react'

/** Shown when nothing matched: no warning must not read as "safe". */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-100 p-4 text-sm leading-relaxed text-slate-700 ring-1 ring-slate-200">
      {children}
    </div>
  )
}
