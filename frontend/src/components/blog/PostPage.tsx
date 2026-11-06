import { useState } from 'react'
import { api, imageSrc, type ImageOut, type PostDetail } from '../../api'
import { actionError as errorText, formatDate } from '../../blog'
import { SKIN_TYPE_LABELS, flagReasons } from '../../labels'
import { ALL_POSTS, href, navigate } from '../../router'
import type { Routine, RoutineActions } from '../../routine'
import { ImportError, parsePortable, restore } from '../../share'
import { statusOf } from '../../useLoad'
import { Dialog } from '../Dialog'
import { ReplaceConfirm } from '../ShareRoutine'
import { Comments } from './Comments'
import { usePost } from './hooks'
import { ReportDialog, type ReportTarget } from './ReportDialog'
import { SourcedInfo } from './SourcedInfo'
import { DemoFooter, DisclosureTag, LoadError, Loading, Stars, quiet, secondary, textLink } from './parts'

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

type Trying = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; routine: Routine; dropped: string[] }

export function PostPage({ id, actions }: { id: number; actions: RoutineActions }) {
  const { state, update: change, retry } = usePost(id)
  const [report, setReport] = useState<ReportTarget | null>(null)
  const [trying, setTrying] = useState<Trying | null>(null)
  const [busy, setBusy] = useState<'like' | 'save' | 'delete' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  if (state.kind === 'error' && statusOf(state.error) === 404) return <PostMissing />
  if (state.kind === 'error') return <LoadError onRetry={retry}>Không tải được bài viết.</LoadError>
  if (state.kind !== 'ready') return <Loading />
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

  return (
    <article className="space-y-6">
      <p className="text-sm">
        <a href={href(ALL_POSTS)} className={textLink}>
          ← Review cộng đồng
        </a>
      </p>

      {post.is_mine && post.status === 'pending' && (
        <p className="rounded-md bg-surface p-4 text-sm leading-relaxed text-ink-soft ring-1 ring-line">
          Bài viết đang chờ duyệt vì có nội dung cần kiểm tra: {flagReasons(post.flags)}. Người khác chưa thấy bài này.
        </p>
      )}
      {post.is_mine && post.status === 'hidden' && (
        <p className="rounded-md bg-surface p-4 text-sm leading-relaxed text-ink-soft ring-1 ring-line">
          Bài viết đang tạm ẩn vì có nhiều báo cáo, chờ người duyệt xem lại.
        </p>
      )}

      <header>
        <h1 className="text-2xl leading-tight font-bold text-pretty sm:text-3xl">{post.title}</h1>
        <p className="mt-2 text-sm text-ink-mute">
          {formatDate(post.created_at)}
          {post.updated_at !== post.created_at && ` · sửa ${formatDate(post.updated_at)}`}
        </p>
      </header>

      <section aria-labelledby="personal-title" className="rounded-md bg-paper p-5 ring-1 ring-line sm:p-6">
        <h2 id="personal-title" className="text-lg font-bold">
          Trải nghiệm cá nhân của{' '}
          <a href={href({ page: 'author', handle: post.author.handle })} className={textLink}>
            @{post.author.handle}
          </a>
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-mute">
          Đây là cảm nhận của người viết, không phải thông tin đã kiểm chứng. SkinWise không kiểm tra nội dung bài viết.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {post.rating !== null && <Stars rating={post.rating} className="text-base" />}
          {post.skin_type && <span className="text-ink-soft">{SKIN_TYPE_LABELS[post.skin_type]}</span>}
          <DisclosureTag disclosure={post.disclosure} />
        </div>
        {/* Plain text: React escapes it, so no HTML runs and links are not clickable. */}
        <div className="mt-4 text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap text-ink">{post.body}</div>
        {post.images.length > 0 && <ImageGrid images={post.images} />}
      </section>

      <SourcedInfo post={post} />

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={toggleLike} disabled={busy !== null} aria-pressed={post.liked} className={quiet}>
          {post.liked ? '♥ Đã thích' : '♡ Thích'} · {post.like_count}
        </button>
        <button onClick={toggleSave} disabled={busy !== null} aria-pressed={post.saved} className={quiet}>
          {post.saved ? 'Đã lưu' : 'Lưu'}
        </button>
        {post.routine && (
          <button onClick={tryRoutine} className={secondary}>
            Thử routine này
          </button>
        )}
        <span className="flex-1" />
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
            Báo cáo
          </button>
        )}
      </div>
      {actionError && <p className="text-sm text-avoid-ink">{actionError}</p>}

      <Comments postId={post.id} onReport={setReport} />
      <DemoFooter />

      <ReportDialog target={report} onClose={() => setReport(null)} />
      <Dialog
        open={trying !== null}
        onClose={() => setTrying(null)}
        title={<h2 className="text-xl font-bold">Thử routine của @{post.author.handle}</h2>}
      >
        {trying?.kind === 'loading' && <Loading>Đang mở routine…</Loading>}
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
    </article>
  )
}

function ImageGrid({ images }: { images: ImageOut[] }) {
  const [viewing, setViewing] = useState<number | null>(null)
  const alt = (image: ImageOut, n: number) => image.caption || `Ảnh ${n + 1} của bài viết`
  const shown = viewing !== null ? images[viewing] : null
  return (
    <>
      <ul className={`mt-4 grid gap-2 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {images.map((image, n) => (
          <li key={image.id}>
            <figure>
              <button
                onClick={() => setViewing(n)}
                aria-label={`Xem lớn: ${alt(image, n)}`}
                className="block w-full overflow-hidden rounded-md bg-surface ring-1 ring-line hover:ring-ink-mute"
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
                <button onClick={() => setViewing((viewing + images.length - 1) % images.length)} className={quiet}>
                  ← Ảnh trước
                </button>
                <span className="self-center text-ink-mute">
                  {viewing + 1}/{images.length}
                </span>
                <button onClick={() => setViewing((viewing + 1) % images.length)} className={quiet}>
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
