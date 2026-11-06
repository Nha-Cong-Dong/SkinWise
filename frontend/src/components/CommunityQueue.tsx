import { useEffect, useState } from 'react'
import type { ModerationItem, ReportReason, ReviewApi } from '../api'
import { FLAG_LABELS, REPORT_REASON_LABELS } from '../labels'
import { useLoad } from '../useLoad'

type Guard = <T>(promise: Promise<T>) => Promise<T>
type Status = 'pending' | 'hidden'

/** "Cộng đồng" tab of #review: posts and comments that wait (auto flags) or were hidden (reports). */
export function CommunityQueue({ client, guard }: { client: ReviewApi; guard: Guard }) {
  const [status, setStatus] = useState<Status>('pending')
  // A new reviewer session remounts the board, so the status alone is the key.
  const { state, update, retry } = useLoad(`queue:${status}`, () => guard(client.blogQueue(status)))
  const items = state.kind === 'ready' ? state.value : null
  const error = state.kind === 'error'

  return (
    <section className="space-y-4">
      <p className="text-sm text-slate-500">
        Bài và bình luận chờ duyệt vì dính cờ tự động, hoặc bị ẩn vì có từ 3 người báo cáo. “Cho hiện” đưa nội dung trở
        lại cho mọi người; “Gỡ” xoá khỏi mọi danh sách.
      </p>
      <div className="flex gap-1 text-sm">
        {(
          [
            ['pending', 'Chờ duyệt'],
            ['hidden', 'Bị ẩn do báo cáo'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setStatus(value)}
            aria-pressed={status === value}
            className={`rounded-full px-3 py-1 ring-1 ${status === value ? 'bg-slate-800 text-white ring-slate-800' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {items === null && !error && <p className="text-sm text-slate-500">Đang tải…</p>}
      {error && (
        <p className="text-sm text-red-700">
          Không tải được hàng chờ.{' '}
          <button onClick={retry} className="underline">
            Thử lại
          </button>
        </p>
      )}
      {items?.length === 0 && <p className="text-sm text-slate-500">Không có nội dung nào.</p>}
      {items?.map((item) => (
        <QueueCard
          key={`${item.kind}:${item.id}`}
          item={item}
          client={client}
          guard={guard}
          onDone={() => update((list) => list.filter((i) => !(i.kind === item.kind && i.id === item.id)))}
        />
      ))}
    </section>
  )
}

function QueueCard({
  item,
  client,
  guard,
  onDone,
}: {
  item: ModerationItem
  client: ReviewApi
  guard: Guard
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const act = (action: 'approve' | 'remove') => {
    if (action === 'remove' && !confirm('Gỡ nội dung này? Người dùng sẽ không thấy nữa.')) return
    setBusy(true)
    setError(false)
    guard(client.moderate(item.kind, item.id, action)).then(onDone, () => {
      setBusy(false)
      setError(true)
    })
  }

  return (
    <article className="rounded-md bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="flex flex-wrap gap-x-3 text-xs text-slate-500">
        <span className="font-medium text-slate-700">{item.kind === 'post' ? 'Bài viết' : 'Bình luận'}</span>
        <span>@{item.author}</span>
        <span>{new Date(item.created_at).toLocaleString('vi-VN')}</span>
        {item.kind === 'comment' && <span>trong bài số {item.post_id}</span>}
      </p>
      {item.title && <h3 className="mt-2 font-semibold text-slate-900">{item.title}</h3>}
      <p className="mt-1 max-h-64 overflow-y-auto text-sm break-words whitespace-pre-wrap text-slate-700">{item.body}</p>
      {item.images.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {item.images.map((image, n) => (
            <li key={image.id}>
              <ReviewerImage id={image.id} alt={image.caption || `Ảnh ${n + 1} của bài viết`} client={client} guard={guard} />
              {image.caption && <p className="mt-1 text-xs break-words text-slate-600">{image.caption}</p>}
            </li>
          ))}
        </ul>
      )}
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-slate-500">Cờ tự động</dt>
        <dd>{item.flags.length ? item.flags.map((f) => FLAG_LABELS[f] ?? f).join('; ') : 'Không có'}</dd>
        <dt className="text-slate-500">Báo cáo</dt>
        <dd>
          {item.report_count}
          {item.report_reasons.length > 0 &&
            `: ${item.report_reasons.map((r) => REPORT_REASON_LABELS[r as ReportReason] ?? r).join('; ')}`}
        </dd>
        {item.report_notes.length > 0 && (
          <>
            <dt className="text-slate-500">Ghi chú báo cáo</dt>
            <dd>
              <ul className="space-y-1">
                {item.report_notes.map((note, n) => (
                  <li key={n} className="break-words whitespace-pre-wrap">
                    “{note}”
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <button
          onClick={() => act('approve')}
          disabled={busy}
          className="rounded-md bg-slate-800 px-3 py-1.5 font-medium text-white hover:bg-slate-700 disabled:opacity-40"
        >
          Cho hiện
        </button>
        <button
          onClick={() => act('remove')}
          disabled={busy}
          className="rounded-md px-3 py-1.5 font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-40"
        >
          Gỡ
        </button>
        {error && <span className="text-red-700">Không thực hiện được. Hãy thử lại.</span>}
      </div>
    </article>
  )
}

/** A post photo for the reviewer: fetched with the reviewer's token, shown from an object URL. */
function ReviewerImage({ id, alt, client, guard }: { id: number; alt: string; client: ReviewApi; guard: Guard }) {
  const [shown, setShown] = useState<{ id: number; url: string | null } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let url: string | null = null
    guard(client.image(id, controller.signal)).then(
      (blob) => {
        url = URL.createObjectURL(blob)
        setShown({ id, url })
      },
      () => {
        if (!controller.signal.aborted) setShown({ id, url: null })
      },
    )
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [id, client, guard])

  if (shown?.id !== id) {
    return <div className="aspect-square w-full animate-pulse rounded-md bg-slate-100" aria-label="Đang tải ảnh" />
  }
  if (shown.url === null) {
    return <p className="flex aspect-square items-center justify-center rounded-md bg-slate-100 p-2 text-center text-xs text-red-700">Không tải được ảnh.</p>
  }
  return (
    <a href={shown.url} target="_blank" rel="noreferrer">
      <img src={shown.url} alt={alt} className="aspect-square w-full rounded-md bg-slate-100 object-cover ring-1 ring-slate-200" />
    </a>
  )
}
