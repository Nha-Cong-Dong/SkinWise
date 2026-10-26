import type { ReactNode } from 'react'
import type { Rule } from '../api'
import { EVIDENCE_LABELS, KIND_LABELS } from '../labels'
import { SeverityBadge } from './Icons'

/** A rule exactly as reviewed: title and explanation are shown verbatim, never reworded. */
export function RuleCard({ rule, children }: { rule: Rule; children?: ReactNode }) {
  return (
    <article
      className={`rounded-xl bg-surface p-4 ring-1 ${rule.severity === 'avoid' ? 'ring-2 ring-avoid/60' : 'ring-line'}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <SeverityBadge severity={rule.severity} />
        <span className="text-xs text-ink-mute">{KIND_LABELS[rule.kind]}</span>
      </div>
      <h3 className="mt-2 text-base leading-snug font-semibold text-pretty">{rule.title_vi}</h3>
      {children}
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">{rule.explanation_vi}</p>
      <Sources rule={rule} />
    </article>
  )
}

function Sources({ rule }: { rule: Rule }) {
  return (
    <details className="group mt-3 border-t border-line pt-2 text-sm">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-3 [&::-webkit-details-marker]:hidden">
        <span className="font-medium text-link group-open:text-ink">
          <span className="inline-block transition-transform group-open:rotate-90" aria-hidden="true">
            ›
          </span>{' '}
          Nguồn ({rule.sources.length} đoạn trích)
        </span>
        <span className="text-xs text-ink-mute">Mức bằng chứng: {EVIDENCE_LABELS[rule.evidence_level]}</span>
      </summary>
      <ul className="mt-3 space-y-4">
        {rule.sources.map((s, i) => (
          <li key={i}>
            <blockquote className="border-l-2 border-ink/20 pl-3 font-serif text-[0.9375rem] leading-relaxed text-ink-soft italic">
              “{s.quote}”
            </blockquote>
            <p className="mt-1.5 pl-3.5 text-xs leading-snug">
              <a href={s.url} target="_blank" rel="noreferrer" className="text-link underline-offset-2 hover:underline">
                {s.title}
              </a>
              <span className="block text-ink-mute">{s.publisher}</span>
            </p>
          </li>
        ))}
      </ul>
    </details>
  )
}
