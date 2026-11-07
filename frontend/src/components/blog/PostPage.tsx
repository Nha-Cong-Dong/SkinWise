import { useState, type ReactNode } from 'react'
import { api, imageSrc, type ImageOut, type PostDetail } from '../../api'
import { actionError as errorText, formatDate } from '../../blog'
import { SKIN_TYPE_LABELS, flagReasons } from '../../labels'
import { ALL_POSTS, href, navigate } from '../../router'
import type { Routine, RoutineActions } from '../../routine'
import { ImportError, parsePortable, restore } from '../../share'
import { statusOf } from '../../useLoad'
import { Dialog, DialogTitle } from '../Dialog'
import { ReplaceConfirm } from '../ShareRoutine'
import { Comments } from './Comments'
import { usePost } from './hooks'
import { BlogIcon } from './icons'
import { ReportDialog, type ReportTarget } from './ReportDialog'
import { SourcedInfo } from './SourcedInfo'
import { Avatar, DemoFooter, DisclosureTag, LoadError, Loading, Stars } from './parts'
import { quiet, secondary, textLink } from './styles'
import { BlogShell } from './Shell'

const BACK = { href: href(ALL_POSTS), label: 'Về danh sách bài review' }

/** Said next to every post: a review is someone's experience, not checked information. */
const PERSONAL = 'Trải nghiệm cá nhân, không phải thông tin đã kiểm chứng.'

export function PostMissing() {
  return (
    <div className="space-y-3 text-sm text-ink-soft">
      <p>Không tìm thấy bài viết này. Bài có thể đã bị xoá hoặc đang chờ duyệt.</p>
      <a href={href(ALL_POSTS)} className={textLink}>
        Về danh sách bài review
      </a>
    </div>
  )
}

function Frame({ children, rail }: { children: ReactNode; rail?: ReactNode }) {
  return (
    <BlogShell spot={null} title="Bài đánh giá" heading={false} back={BACK} rail={rail} railLabel="Về bài này" railAfter>
      {children}
    </BlogShell>
  )
}

type Trying = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; routine: Routine; dropped: string[] }

const action =
  'motion-press inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-ink-soft hover:bg-thistle/25 hover:text-ink md:min-h-9 disabled:opacity-40'

export function PostPage({ id, actions }: { id: number; actions: RoutineActions }) {
  const { state, update: change, retry } = usePost(id)
  const [report, setReport] = useState<ReportTarget | null>(null)
  const [trying, setTrying] = useState<Trying | null>(null)
  const [busy, setBusy] = useState<'like' | 'save' | 'delete' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  if (state.kind === 'error' && statusOf(state.error) === 404) {
    return (
      <Frame>
        <PostMissing />
      </Frame>
    )
  }
  if (state.kind === 'error') {
    return (
      <Frame>
        <LoadError onRetry={retry}>Không tải được bài viết.</LoadError>
      </Frame>
    )
  }
  if (state.kind !== 'ready') {
    return (
      <Frame>
        <Loading />
      </Frame>
    )
  }
  const post = state.value

  const update = (fields: Partial<PostDetail>) => change((p) => ({ ...p, ...fields }))

  const toggleLike = () => {
    setBusy('like')
    setActionError(null)
    api
      .like(post.id, !post.liked)
      .then((r) => update({ liked: r.liked, like_count: r.like_count }), (e) => setActionError(errorText(e, 'Không thích được bài này. Hãy thử lại.')))
      .finally(() => setBusy(null))
  }

  const toggleSave = () => {
    setBusy('save')
    setActionError(null)
    api
      .save(post.id, !post.saved)
      .then((r) => update({ saved: r.saved }), (e) => setActionError(errorText(e, 'Không lưu được bài này. Hãy thử lại.')))
      .finally(() => setBusy(null))
  }

  const remove = () => {
    if (!confirm('Xoá bài viết này? Ảnh và bình luận của bài cũng bị xoá.')) return
    setBusy('delete')
    setActionError(null)
    api.deletePost(post.id).then(
      () => navigate(ALL_POSTS, { replace: true }),
      (e) => {
        setBusy(null)
        setActionError(errorText(e, 'Không xoá được bài viết. Hãy thử lại.'))
      },
    )
  }

  const tryRoutine = () => {
    if (!post.routine) return
    setTrying({ kind: 'loading' })
    let portable
    try {
      portable = parsePortable(post.routine)
    } catch (e) {
      setTrying({ kind: 'error', message: e instanceof ImportError ? e.message : 'Không mở được routine.' })
      return
    }
    restore(portable).then(
      (r) => setTrying({ kind: 'ready', ...r }),
      (e) => setTrying({ kind: 'error', message: e instanceof ImportError ? e.message : 'Không mở được routine.' }),
    )
  }

  const about = (
    <section aria-labelledby="about-title" className="space-y-3 rounded-md border border-line bg-surface p-4 text-sm leading-relaxed text-ink-soft">
      <h2 id="about-title" className="text-base font-bold text-ink">
        Về bài này
      </h2>
      {post.disclosure !== 'none' && (
        <p>
          <DisclosureTag disclosure={post.disclosure} />{' '}
          {post.disclosure === 'gifted' ? 'Người viết cho biết sản phẩm được tặng.' : 'Người viết cho biết bài có tài trợ.'}
        </p>
      )}
      <p>{PERSONAL} SkinWise không kiểm tra nội dung bài viết.</p>
      <div className="-ml-3 flex flex-wrap gap-1 border-t border-line pt-3">
        {post.is_mine ? (
          <>
            <a href={href({ page: 'edit', id: post.id })} className={quiet}>
              Sửa bài
            </a>
            <button onClick={remove} disabled={busy !== null} className={quiet}>
              {busy === 'delete' ? 'Đang xoá…' : 'Xoá bài'}
            </button>
          </>
        ) : (
          <button onClick={() => setReport({ kind: 'post', id: post.id })} className={quiet}>
            Báo cáo bài viết
          </button>
        )}
      </div>
    </section>
  )

  return (
    <Frame rail={about}>
      <div className="space-y-6">
        {post.is_mine && post.status === 'pending' && (
          <p className="rounded-md border border-line bg-surface p-4 text-sm leading-relaxed text-ink-soft">
            Bài viết đang chờ duyệt vì có nội dung cần kiểm tra: {flagReasons(post.flags)}. Người khác chưa thấy bài này.
          </p>
        )}
        {post.is_mine && post.status === 'hidden' && (
          <p className="rounded-md border border-line bg-surface p-4 text-sm leading-relaxed text-ink-soft">
            Bài viết đang tạm ẩn vì có nhiều báo cáo, chờ người duyệt xem lại.
          </p>
        )}

        <article
          aria-labelledby="post-title"
          className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 rounded-md border border-line bg-surface px-4 py-5 sm:px-6"
        >
          <Avatar handle={post.author.handle} />
          <div className="min-w-0 space-y-2">
            <p className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-0.5">
              <a href={href({ page: 'author', handle: post.author.handle })} className="inline-flex min-h-11 items-center md:min-h-0 font-semibold break-all text-ink hover:underline">
                {post.author.handle}
              </a>
              <span className="text-xs text-ink-soft">
                {post.skin_type && `${SKIN_TYPE_LABELS[post.skin_type]} · `}
                {formatDate(post.created_at)}
                {post.updated_at !== post.created_at && ` · sửa ${formatDate(post.updated_at)}`}
              </span>
              <DisclosureTag disclosure={post.disclosure} />
            </p>
            <h1 id="post-title" className="text-2xl leading-tight font-bold text-pretty">
              {post.title}
            </h1>
            <p className="text-xs text-ink-soft">{PERSONAL}</p>
            {post.rating !== null && <Stars rating={post.rating} className="text-base" />}
            {/* Plain text: React escapes it, so no HTML runs and links are not clickable. */}
            <div className="pt-1 text-base leading-relaxed break-words whitespace-pre-wrap text-ink">{post.body}</div>
            {post.images.length > 0 && <ImageGrid images={post.images} />}
            {post.products.length > 0 && (
              <div className="flex flex-col gap-0.5 rounded-md border border-line px-3.5 py-2.5">
                <span className="text-xs text-ink-soft">Sản phẩm trong bài</span>
                <span className="text-sm">
                  {post.products.map((p, n) => (
                    <span key={p.position}>
                      {n > 0 && ' · '}
                      {p.product_id !== null ? (
                        <a href={href({ page: 'product', id: p.product_id })} className={`inline-flex min-h-11 items-center md:min-h-0 ${textLink}`}>
                          {p.brand ? `${p.brand} ${p.name}` : p.name}
                        </a>
                      ) : (
                        p.name
                      )}
                    </span>
                  ))}
                </span>
                {post.has_routine && (
                  <span className="self-start rounded-full bg-thistle/40 px-2 text-xs leading-relaxed font-semibold text-thistle-ink">
                    Có lịch dùng
                  </span>
                )}
              </div>
            )}
            <div className="-ml-3 flex flex-wrap items-center gap-1 pt-1">
              <button
                onClick={toggleLike}
                disabled={busy !== null}
                aria-pressed={post.liked}
                className={`${action} ${post.liked ? 'font-semibold text-primary' : ''}`}
              >
                <BlogIcon name="heart" filled={post.liked} className="size-[1.125rem]" />
                {post.liked ? 'Đã thích' : 'Thích'} · {post.like_count}
              </button>
              <button onClick={() => document.getElementById('comments-title')?.scrollIntoView({ block: 'start' })} className={action}>
                <BlogIcon name="comment" className="size-[1.125rem]" />
                Bình luận · {post.comment_count}
              </button>
              <button
                onClick={toggleSave}
                disabled={busy !== null}
                aria-pressed={post.saved}
                className={`${action} ${post.saved ? 'font-semibold text-primary' : ''}`}
              >
                <BlogIcon name="bookmark" filled={post.saved} className="size-[1.125rem]" />
                {post.saved ? 'Đã lưu' : 'Lưu'}
              </button>
              {post.routine && (
                <button onClick={tryRoutine} className={`${secondary} sm:ml-auto`}>
                  Thử lịch dùng này
                </button>
              )}
            </div>
            <div aria-live="polite">{actionError && <p className="text-sm text-avoid-ink">{actionError}</p>}</div>
          </div>
        </article>

        <SourcedInfo post={post} />

        <Comments postId={post.id} onReport={setReport} />
        <DemoFooter />
      </div>

      <ReportDialog target={report} onClose={() => setReport(null)} />
      <Dialog
        open={trying !== null}
        onClose={() => setTrying(null)}
        title={<DialogTitle>Thử lịch dùng của {post.author.handle}</DialogTitle>}
      >
        {trying?.kind === 'loading' && <Loading>Đang mở lịch dùng…</Loading>}
        {trying?.kind === 'error' && <p className="text-sm text-avoid-ink">{trying.message}</p>}
        {trying?.kind === 'ready' && (
          <ReplaceConfirm
            incoming={trying}
            current={actions.routine}
            onAccept={() => {
              actions.replace(trying.routine)
              setTrying(null)
              navigate({ page: 'routine', tab: 'week' })
            }}
            onCancel={() => setTrying(null)}
          />
        )}
      </Dialog>
    </Frame>
  )
}

function ImageGrid({ images }: { images: ImageOut[] }) {
  const [viewing, setViewing] = useState<number | null>(null)
  const alt = (image: ImageOut, n: number) => image.caption || `Ảnh ${n + 1} của bài viết`
  const shown = viewing !== null ? images[viewing] : null
  return (
    <>
      <ul className={`mt-2 grid gap-2 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {images.map((image, n) => (
          <li key={image.id}>
            <figure>
              <button
                onClick={() => setViewing(n)}
                aria-label={`Xem lớn: ${alt(image, n)}`}
                className="block w-full overflow-hidden rounded-md border border-line bg-paper hover:border-ink-soft"
              >
                <img
                  src={imageSrc(image)}
                  alt={alt(image, n)}
                  width={image.width}
                  height={image.height}
                  loading="lazy"
                  className={`w-full object-cover ${images.length === 1 ? 'max-h-[28rem]' : 'aspect-square'}`}
                />
              </button>
              {image.caption && <figcaption className="mt-1 text-xs text-ink-soft">{image.caption}</figcaption>}
            </figure>
          </li>
        ))}
      </ul>
      <Dialog
        open={shown !== null}
        onClose={() => setViewing(null)}
        title={<h2 className="text-base font-semibold">{shown && viewing !== null && alt(shown, viewing)}</h2>}
      >
        {shown && viewing !== null && (
          <div>
            <img
              src={imageSrc(shown)}
              alt={alt(shown, viewing)}
              width={shown.width}
              height={shown.height}
              className="mx-auto max-h-[70dvh] w-auto max-w-full rounded-md"
            />
            {images.length > 1 && (
              <div className="mt-3 flex justify-between text-sm">
                <button onClick={() => setViewing((viewing + images.length - 1) % images.length)} className={secondary}>
                  ← Ảnh trước
                </button>
                <span className="self-center text-ink-soft">
                  {viewing + 1}/{images.length}
                </span>
                <button onClick={() => setViewing((viewing + 1) % images.length)} className={secondary}>
                  Ảnh sau →
                </button>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </>
  )
}
