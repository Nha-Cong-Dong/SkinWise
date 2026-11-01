import { useState, type ReactNode } from 'react'
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
      <Explanation text={rule.explanation_vi} />
      <Sources rule={rule} />
    </article>
  )
}

const LONG_WORDS = 70 // longer explanations start folded
const LEAD_WORDS = 30 // the folded view shows whole sentences up to about this many words

const words = (text: string) => text.split(/\s+/).filter(Boolean).length

/**
 * Where the folded view ends: after the first whole sentences reaching LEAD_WORDS words, or
 * null when the text is short enough to show in full. The text itself is never changed: the
 * folded view is its beginning, cut at a sentence end.
 */
function leadEnd(text: string): number | null {
  if (words(text) <= LONG_WORDS) return null
  const ends = [...text.matchAll(/[.;:](?=\s+\p{Lu})/gu)].map((m) => m.index + 1)
  const end = ends.find((i) => words(text.slice(0, i)) >= LEAD_WORDS)
  return end !== undefined && words(text.slice(end)) >= 15 ? end : null
}

function Explanation({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const end = leadEnd(text)
  return (
    <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
      {end === null || open ? text : text.slice(0, end)}
      {end !== null && (
        <>
          {' '}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="text-sm font-medium text-link underline underline-offset-2"
          >
            {open ? 'Thu gọn' : 'Đọc tiếp'}
          </button>
        </>
      )}
    </p>
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
