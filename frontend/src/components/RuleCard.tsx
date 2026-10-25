import type { ReactNode } from 'react'
import type { Rule } from '../api'
import { EVIDENCE_LABELS, KIND_LABELS, SEVERITY } from '../labels'

/** A rule exactly as reviewed: title and explanation are shown verbatim, never reworded. */
export function RuleCard({ rule, children }: { rule: Rule; children?: ReactNode }) {
  const severity = SEVERITY[rule.severity]
  return (
    <article className={`rounded-lg border-l-4 bg-white p-4 shadow-sm ring-1 ring-slate-200 ${severity.border}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded px-2 py-0.5 font-semibold ${severity.badge}`}>{severity.label}</span>
        <span className="text-slate-500">{KIND_LABELS[rule.kind]}</span>
      </div>
      <h3 className="mt-2 font-semibold text-slate-900">{rule.title_vi}</h3>
      {children}
      <p className="mt-2 text-sm leading-relaxed text-slate-700">{rule.explanation_vi}</p>
      <p className="mt-2 text-xs text-slate-500">Mức bằng chứng: {EVIDENCE_LABELS[rule.evidence_level]}</p>
      <Sources rule={rule} />
    </article>
  )
}

function Sources({ rule }: { rule: Rule }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-rose-700 hover:underline">
        Nguồn ({rule.sources.length} đoạn trích)
      </summary>
      <ul className="mt-2 space-y-3">
        {rule.sources.map((s, i) => (
          <li key={i}>
            <blockquote className="border-l-2 border-slate-300 pl-3 text-slate-600 italic">“{s.quote}”</blockquote>
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block text-xs text-slate-500 hover:text-rose-700 hover:underline"
            >
              {s.publisher} — {s.title}
            </a>
          </li>
        ))}
      </ul>
    </details>
  )
}
