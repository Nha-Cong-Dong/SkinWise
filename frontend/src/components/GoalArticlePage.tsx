import { useEffect, useState } from 'react'
import { ApiError, api, type ArticleSource, type GoalArticle } from '../api'
import { href } from '../router'
import { Notice } from './Notice'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'missing' } // 404: unknown goal, or no published article
  | { kind: 'error' }
  | { kind: 'done'; article: GoalArticle }

const sectionId = (anchor: string) => `bai-viet-${anchor}`
const sourceId = (n: number) => `bai-viet-nguon-${n}`

/** "2026-11-08" -> "08/11/2026", without going through Date (no time zone shift). */
function formatDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

/**
 * The address uses the hash for pages (router.ts), so in-page links cannot be `href="#…"`:
 * scroll to the element and move focus there, so keyboard and screen reader users follow.
 */
function jumpTo(id: string): void {
  const target = document.getElementById(id)
  if (!target) return
  let reduce = false
  try {
    reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    // No matchMedia: scroll smoothly.
  }
  target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  target.focus({ preventScroll: true })
}

/**
 * A goal's long article: reviewed text shown verbatim, each paragraph numbered to the sources
 * at the end, where every quote can be read word for word. Only for reading: it never changes
 * a warning and suggests no product.
 */
export function GoalArticlePage({ code }: { code: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    api.goalArticle(code).then(
      (article) => live && setState({ kind: 'done', article }),
      (e: unknown) => live && setState({ kind: e instanceof ApiError && e.status === 404 ? 'missing' : 'error' }),
    )
    return () => {
      live = false
    }
  }, [code, attempt])

  const back = (
    <a href={href({ page: 'goals' })} className="text-sm text-link underline-offset-2 hover:underline">
      ← Quay lại Mục tiêu
    </a>
  )

  if (state.kind !== 'done') {
    return (
      <div className="space-y-4">
        {back}
        {state.kind === 'loading' && <p className="text-sm text-ink-mute">Đang tải bài viết…</p>}
        {state.kind === 'missing' && (
          <>
            <h1 className="text-2xl leading-tight font-bold">Chưa có bài viết cho mục tiêu này.</h1>
            <p className="text-[0.9375rem] text-ink-soft">
              Bạn vẫn có thể xem các thẻ thông tin có nguồn ở trang Mục tiêu.
            </p>
          </>
        )}
        {state.kind === 'error' && (
          <p className="text-sm text-avoid-ink">
            Không tải được bài viết.{' '}
            <button
              onClick={() => {
                setState({ kind: 'loading' })
                setAttempt((n) => n + 1)
              }}
              className="text-link underline underline-offset-2"
            >
              Thử lại
            </button>
          </p>
        )}
      </div>
    )
  }

  const { article } = state
  return (
    <article className="space-y-8">
      <header className="space-y-3">
        {back}
        <p className="pt-2 text-sm font-medium text-ink-mute">{article.goal_name_vi}</p>
        <h1 className="text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl">{article.title_vi}</h1>
        <p className="text-sm text-ink-mute">
          Đã duyệt bởi {article.reviewed_by} ngày {formatDay(article.reviewed_at)}
        </p>
        <Notice>{article.notice_vi}</Notice>
      </header>

      {article.sections.length > 0 && (
        <nav aria-labelledby="bai-viet-muc-luc" className="rounded-xl bg-surface p-4 ring-1 ring-line sm:p-5">
          <h2 id="bai-viet-muc-luc" className="text-base font-semibold">
            Mục lục
          </h2>
          <ol className="mt-2 list-decimal space-y-1.5 pl-6 text-[0.9375rem] marker:text-ink-mute">
            {article.sections.map((s) => (
              <li key={s.anchor}>
                <button
                  onClick={() => jumpTo(sectionId(s.anchor))}
                  className="text-left text-link underline-offset-2 hover:underline"
                >
                  {s.heading_vi}
                </button>
              </li>
            ))}
            {article.sources.length > 0 && (
              <li>
                <button
                  onClick={() => jumpTo('bai-viet-nguon')}
                  className="text-left text-link underline-offset-2 hover:underline"
                >
                  Nguồn
                </button>
              </li>
            )}
          </ol>
        </nav>
      )}

      {article.sections.map((s) => (
        <section key={s.anchor} aria-labelledby={sectionId(s.anchor)}>
          <h2
            id={sectionId(s.anchor)}
            tabIndex={-1}
            className="scroll-mt-4 text-2xl leading-tight font-bold text-balance focus:outline-none"
          >
            {s.heading_vi}
          </h2>
          <div className="mt-3 max-w-[65ch] space-y-4">
            {s.paragraphs.map((p, i) => (
              <p key={i} className="text-[1.0625rem] leading-relaxed whitespace-pre-line text-ink-soft">
                {p.text_vi}
                {p.refs.map((n) => (
                  <button
                    key={n}
                    onClick={() => jumpTo(sourceId(n))}
                    aria-label={`Xem nguồn ${n}`}
                    className="ml-0.5 align-super text-xs font-medium text-link hover:underline"
                  >
                    [{n}]
                  </button>
                ))}
              </p>
            ))}
          </div>
        </section>
      ))}

      {article.sources.length > 0 && (
        <section aria-labelledby="bai-viet-nguon" className="border-t border-line pt-6">
          <h2 id="bai-viet-nguon" tabIndex={-1} className="scroll-mt-4 text-xl font-bold focus:outline-none">
            Nguồn
          </h2>
          <ol className="mt-4 space-y-5">
            {article.sources.map((s) => (
              <SourceItem key={s.n} source={s} />
            ))}
          </ol>
        </section>
      )}
    </article>
  )
}

function SourceItem({ source }: { source: ArticleSource }) {
  return (
    <li
      id={sourceId(source.n)}
      tabIndex={-1}
      className="flex scroll-mt-4 gap-3 rounded-lg focus:ring-2 focus:ring-link/40 focus:outline-none"
    >
      <span className="w-7 shrink-0 text-right text-sm font-semibold text-ink-mute">{source.n}.</span>
      <div className="min-w-0 flex-1 text-sm leading-snug">
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-words text-link underline-offset-2 hover:underline"
        >
          {source.title}
        </a>
        <span className="block text-ink-mute">{source.publisher}</span>
        {source.quotes.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-ink-soft select-none hover:text-ink">
              Xem đoạn trích ({source.quotes.length})
            </summary>
            <ul className="mt-2 space-y-3">
              {source.quotes.map((q, i) => (
                <li key={i}>
                  <blockquote className="border-l-2 border-ink/20 pl-3 font-serif text-[0.9375rem] leading-relaxed break-words text-ink-soft italic">
                    “{q}”
                  </blockquote>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </li>
  )
}
