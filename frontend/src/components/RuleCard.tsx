import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { Rule } from '../api'
import { EVIDENCE_LABELS, KIND_LABELS } from '../labels'
import { SeverityBadge } from './Icons'

type Props = {
  rule: Rule
  children?: ReactNode
  /** Show the first lines of a long explanation, with "Xem thêm" (where many cards stack up). */
  collapsible?: boolean
}

/** A rule exactly as reviewed: title and explanation are shown verbatim, never reworded. */
export function RuleCard({ rule, children, collapsible = false }: Props) {
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
      <Explanation text={rule.explanation_vi} title={rule.title_vi} collapsible={collapsible} />
      <Sources rule={rule} />
    </article>
  )
}

/**
 * The explanation, clamped to a few lines when collapsible. Clamping only hides the rest from
 * view: the whole text stays in the page (screen readers read all of it) and is never shortened.
 */
function Explanation({ text, title, collapsible }: { text: string; title: string; collapsible: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const id = useId()
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!collapsible || !el || typeof ResizeObserver === 'undefined') return
    // Called once on observe and again on every resize: is text hidden by the clamp?
    const observer = new ResizeObserver(() => setOverflows(el.scrollHeight > el.clientHeight + 1))
    observer.observe(el)
    return () => observer.disconnect()
  }, [collapsible, text])

  const clamped = collapsible && !open
  return (
    <>
      <p
        ref={ref}
        id={id}
        className={`mt-3 text-[0.9375rem] leading-relaxed text-ink-soft ${clamped ? 'line-clamp-4' : ''}`}
      >
        {text}
      </p>
      {collapsible && (overflows || open) && (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={id}
          aria-label={`${open ? 'Thu gọn' : 'Xem thêm'}: ${title}`}
          className="mt-1 min-h-8 text-sm font-medium text-link underline-offset-2 hover:underline"
        >
          {open ? 'Thu gọn' : 'Xem thêm'}
        </button>
      )}
    </>
  )
}

/** "2026-10-22" -> "22/10/2026", without going through Date (no time zone shift). */
function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
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
        <span className="text-xs text-ink-mute">
          Mức bằng chứng: {EVIDENCE_LABELS[rule.evidence_level]}
          {rule.reviewed_at && (
            <span title="Ngày người duyệt đọc các nguồn này và bật luật">
              {' '}
              · đã duyệt {formatDate(rule.reviewed_at)}
            </span>
          )}
        </span>
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
