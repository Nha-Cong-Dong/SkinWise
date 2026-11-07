import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { Rule } from '../api'
import { EVIDENCE_LABELS, KIND_LABELS, SEVERITY } from '../labels'
import { SeverityBadge } from './Icons'

type Props = {
  rule: Rule
  children?: ReactNode
  /** Show the first lines of a long explanation, with "Xem thêm" (where many cards stack up). */
  collapsible?: boolean
  /** Anchor for a list of cards to jump to (the check tab). */
  id?: string
  /** After the sources (a link to the schedule, on the check tab). */
  footer?: ReactNode
  /** Extra classes on the card (the check tab lifts the card a link pointed at). */
  className?: string
}

/**
 * A rule exactly as reviewed. Title and explanation are shown verbatim; the only rewording is a
 * reviewed plain-language version (`plain_vi`), shown first, with the verbatim explanation one
 * click away on the same card.
 */
export function RuleCard({ rule, children, collapsible = false, id, footer, className = '' }: Props) {
  return (
    <article
      id={id}
      tabIndex={id ? -1 : undefined}
      className={`relative scroll-mt-4 overflow-hidden rounded-md bg-surface py-4 pr-4 pl-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-neutral sm:py-6 sm:pr-6 sm:pl-8 ${className}`}
    >
      {/* The severity bar: colour repeats the badge, the badge's word and icon carry the meaning. */}
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${SEVERITY[rule.severity].bar}`} />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <SeverityBadge severity={rule.severity} />
        <span className="text-xs text-ink-mute">{KIND_LABELS[rule.kind]}</span>
      </div>
      <h3 className="mt-2 text-lg leading-snug font-semibold text-pretty sm:text-xl">{rule.title_vi}</h3>
      {children}
      {rule.plain_vi ? (
        <>
          <p className="mt-3 text-xs font-medium text-ink-mute">Bản dễ hiểu, đã duyệt</p>
          <Explanation text={rule.plain_vi} title={rule.title_vi} collapsible={collapsible} tight />
          <Verbatim text={rule.explanation_vi} title={rule.title_vi} />
        </>
      ) : (
        <Explanation text={rule.explanation_vi} title={rule.title_vi} collapsible={collapsible} />
      )}
      <Sources rule={rule} />
      {footer}
    </article>
  )
}

/**
 * The explanation, clamped to a few lines when collapsible. Clamping only hides the rest from
 * view: the whole text stays in the page (screen readers read all of it) and is never shortened.
 */
function Explanation({
  text,
  title,
  collapsible,
  tight = false,
}: {
  text: string
  title: string
  collapsible: boolean
  /** Sits right under a small label, so less space above. */
  tight?: boolean
}) {
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
        className={`${tight ? 'mt-1' : 'mt-3'} max-w-[68ch] text-base leading-relaxed text-ink ${clamped ? 'line-clamp-4' : ''}`}
      >
        {text}
      </p>
      {collapsible && (overflows || open) && (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={id}
          aria-label={`${open ? 'Thu gọn' : 'Xem thêm'}: ${title}`}
          className="mt-1 min-h-11 text-sm font-medium text-link md:min-h-8 underline-offset-2 hover:underline"
        >
          {open ? 'Thu gọn' : 'Xem thêm'}
        </button>
      )}
    </>
  )
}

/**
 * The verbatim explanation behind a plain-language version: one click to open, never clamped.
 * The region stays in the DOM (hidden while closed) so aria-controls always points at it.
 */
function Verbatim({ text, title }: { text: string; title: string }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${open ? 'Ẩn nguyên văn' : 'Xem nguyên văn'}: ${title}`}
        className="mt-1 block min-h-11 text-sm font-medium text-link md:min-h-8 underline-offset-2 hover:underline"
      >
        {open ? 'Ẩn nguyên văn' : 'Xem nguyên văn'}
      </button>
      <div id={id} hidden={!open} className="mt-1 border-l-2 border-line pl-4">
        <p className="text-xs font-medium text-ink-mute">Nguyên văn đã duyệt theo nguồn:</p>
        <p className="mt-1 max-w-[68ch] text-base leading-relaxed text-ink">{text}</p>
      </div>
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
    <details className="group mt-4 border-t border-line pt-3 text-sm">
      <summary className="flex min-h-11 cursor-pointer list-none md:min-h-8 flex-wrap items-baseline justify-between gap-x-3 [&::-webkit-details-marker]:hidden">
        <span className="font-semibold text-link group-open:text-ink">
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
      <ul className="mt-3 space-y-5">
        {rule.sources.map((s, i) => (
          <li key={i}>
            <figure>
              <blockquote className="border-l-2 border-line pl-4 font-serif text-lg leading-[1.55] break-words text-ink italic">
                “{s.quote}”
              </blockquote>
              <figcaption className="mt-2 pl-[1.125rem] text-xs leading-snug text-ink-mute">
                {s.publisher} ·{' '}
                <a href={s.url} target="_blank" rel="noreferrer" className="text-link underline-offset-2 hover:underline">
                  {s.title}
                </a>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-mute">Đoạn trích giữ nguyên ngôn ngữ gốc của nguồn.</p>
    </details>
  )
}
