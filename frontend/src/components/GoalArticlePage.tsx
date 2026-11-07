import { useEffect, useState } from 'react'
import { ApiError, api, type ArticleSource, type GoalArticle } from '../api'
import { FEEDBACK_URL } from '../labels'
import { href } from '../router'
import { btn, btnGhost } from './ui'
import { stagger } from './motion'

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
    <a href={href({ page: 'goals' })} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">
      ← Quay lại Mục tiêu
    </a>
  )

  if (state.kind !== 'done') {
    return (
      <div className="space-y-4">
        {back}
        {state.kind === 'loading' && <p className="motion-loading text-sm text-ink-mute">Đang tải bài viết…</p>}
        {state.kind === 'missing' && (
          <>
            <h1 className="text-3xl">Chưa có bài viết cho mục tiêu này.</h1>
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
    <article data-motion="enter">
      <header className="motion-enter max-w-[56rem]">
        {back}
        <p className="mt-2">
          <span className="rounded-full bg-thistle px-2.5 py-0.5 text-xs font-semibold text-thistle-ink">
            {article.goal_name_vi}
          </span>
        </p>
        <h1 className="mt-3 text-3xl text-balance lg:text-4xl">{article.title_vi}</h1>
        <p className="mt-2 text-sm text-ink-mute">
          Đã duyệt bởi {article.reviewed_by} ngày {formatDay(article.reviewed_at)}
        </p>
      </header>

      <div
        className="motion-enter mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10"
        style={stagger(1)}
      >
        {article.sections.length > 0 ? (
          <nav aria-labelledby="bai-viet-muc-luc" className="rounded-md bg-surface p-4 lg:sticky lg:top-4 lg:bg-transparent lg:p-0">
            <h2
              id="bai-viet-muc-luc"
              className="px-2.5 font-sans text-xs font-bold tracking-[0.04em] text-ink-mute uppercase"
            >
              Mục lục
            </h2>
            <ol className="mt-1.5 flex flex-col gap-0.5">
              {article.sections.map((s, i) => (
                <li key={s.anchor}>
                  <button
                    onClick={() => jumpTo(sectionId(s.anchor))}
                    className="flex min-h-11 w-full items-baseline gap-2 rounded-md px-2.5 py-1.5 text-left text-sm leading-snug text-ink-soft hover:bg-wash hover:text-primary lg:min-h-0"
                  >
                    <b className="min-w-3.5 font-semibold tabular-nums">{i + 1}</b>
                    {s.heading_vi}
                  </button>
                </li>
              ))}
              {article.sources.length > 0 && (
                <li>
                  <button
                    onClick={() => jumpTo('bai-viet-nguon')}
                    className="flex min-h-11 w-full items-baseline gap-2 rounded-md px-2.5 py-1.5 text-left text-sm leading-snug text-ink-soft hover:bg-wash hover:text-primary lg:min-h-0"
                  >
                    <b className="min-w-3.5 font-semibold tabular-nums">{article.sections.length + 1}</b>
                    Nguồn
                  </button>
                </li>
              )}
            </ol>
          </nav>
        ) : (
          <span className="hidden lg:block" />
        )}

        <div className="flex max-w-[45rem] min-w-0 flex-col gap-5">
          <div className="rounded-md border border-line bg-surface px-4 py-3">
            <p className="text-[0.9375rem] leading-relaxed">{article.notice_vi}</p>
          </div>

          {article.sections.map((s) => (
            <section key={s.anchor} aria-labelledby={sectionId(s.anchor)} className="flex flex-col gap-5">
              <h2
                id={sectionId(s.anchor)}
                tabIndex={-1}
                className="mt-7 scroll-mt-4 text-2xl text-balance focus:outline-none lg:text-[1.75rem]"
              >
                {s.heading_vi}
              </h2>
              {s.paragraphs.map((p, i) => (
                <p key={i} className="text-[1.0625rem] leading-[1.8] whitespace-pre-line text-ink">
                  {p.text_vi}
                  {p.refs.map((n) => (
                    <button
                      key={n}
                      onClick={() => jumpTo(sourceId(n))}
                      aria-label={`Xem nguồn ${n}`}
                      className="ml-0.5 align-super text-xs font-semibold text-primary hover:underline"
                    >
                      [{n}]
                    </button>
                  ))}
                </p>
              ))}
            </section>
          ))}

          {article.sources.length > 0 && (
            <section aria-labelledby="bai-viet-nguon" className="flex flex-col gap-4">
              <h2
                id="bai-viet-nguon"
                tabIndex={-1}
                className="mt-7 scroll-mt-4 text-2xl focus:outline-none lg:text-[1.75rem]"
              >
                Nguồn
              </h2>
              <ol className="flex flex-col gap-2.5">
                {article.sources.map((s) => (
                  <SourceItem key={s.n} source={s} />
                ))}
              </ol>
            </section>
          )}

          <div className="mt-2 flex flex-wrap gap-2">
            <a href={href({ page: 'goals' })} className={btn}>
              ← Mục tiêu khác
            </a>
            <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" className={btnGhost}>
              Báo nội dung chưa đúng
            </a>
          </div>
          <p className="text-xs text-ink-mute">
            Báo qua GitHub Issues (cần tài khoản GitHub; nội dung hiện công khai, đừng ghi email, số điện thoại hay ảnh da của bạn).
          </p>
        </div>
      </div>
    </article>
  )
}

function SourceItem({ source }: { source: ArticleSource }) {
  return (
    <li
      id={sourceId(source.n)}
      tabIndex={-1}
      className="grid scroll-mt-4 grid-cols-[2rem_minmax(0,1fr)] gap-2 rounded-md bg-surface px-4 py-3.5 focus:ring-2 focus:ring-primary focus:outline-none"
    >
      <span className="text-sm font-semibold text-primary tabular-nums">[{source.n}]</span>
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
            <summary className="flex min-h-11 cursor-pointer items-center text-ink-soft select-none hover:text-ink md:min-h-0">
              Xem đoạn trích ({source.quotes.length})
            </summary>
            <ul className="mt-2 space-y-3">
              {source.quotes.map((q, i) => (
                <li key={i}>
                  <blockquote className="border-l-2 border-line pl-4 font-serif text-lg leading-[1.55] break-words text-ink italic">
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
