import { useEffect, useRef, useState } from 'react'
import { ApiError, api, requestError, SUGGESTIONS_TRUNCATED_VI, type InciAnalysis, type ProductDetail } from '../api'
import { useGroupName } from '../groups'
import { APPLICATION_LABELS, KIND_LABELS, SESSION_LABELS, SEVERITY, VERIFICATION_LABELS, formatOccurrences } from '../labels'
import { href, navigate } from '../router'
import {
  currentResult,
  isUsageNote,
  maybeIncomplete,
  type CheckState,
  type LabelGroups,
  type MyProduct,
  type RoutineActions,
} from '../routine'
import { GroupChips, UNORDERED_NOTE } from './GroupChips'
import { SeverityBadge } from './Icons'
import { IngredientList } from './IngredientList'
import { scheduleOf } from './shelf'
import { DataNote } from './Notice'
import { cataloguePhoto, photoError, userPhoto } from './photos'
import { PhotoCredit, ProductImage } from './ProductImage'
import { btn, btnDanger, btnGhostDanger, sm } from './ui'
import { stagger } from './motion'

type Props = {
  productKey: string
  actions: RoutineActions
  /** Label lines behind each product's groups (product key), from the last check. */
  found: Map<string, LabelGroups>
  check: CheckState
  /** Remove a product and its steps (App offers "Hoàn tác"). */
  onRemove: (key: string) => void
}

const shelf = href({ page: 'routine', tab: 'shelf' })

/** One product of the shelf: its actives, label, place in the schedule and warnings. */
export function ProductDetailPage({ productKey, ...rest }: Props) {
  const product = rest.actions.routine.products.find((p) => p.key === productKey)
  if (!product) {
    return (
      <div className="space-y-3">
        <a href={shelf} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">
          ← Tủ đồ
        </a>
        <h1 className="text-3xl">Không tìm thấy sản phẩm này trong tủ đồ.</h1>
        <p className="text-ink-soft">Sản phẩm có thể đã bị xoá, hoặc link được mở trên thiết bị khác.</p>
      </div>
    )
  }
  return <Detail key={product.key} product={product} {...rest} />
}

function Detail({ product, actions, found, check, onRemove }: Omit<Props, 'productKey'> & { product: MyProduct }) {
  const [detail, setDetail] = useState<ProductDetail | null>(null)
  const [detailError, setDetailError] = useState(false)
  const productId = product.productId

  useEffect(() => {
    if (productId === null) return
    let live = true
    api.product(productId).then(
      (d) => live && setDetail(d),
      () => live && setDetailError(true),
    )
    return () => {
      live = false
    }
  }, [productId])

  const lines = found.get(product.key)
  const photo = productId !== null ? cataloguePhoto(detail?.image) : userPhoto(product.photoId)
  const meta = [product.brand ?? 'Tự nhập bảng thành phần', detail?.application && APPLICATION_LABELS[detail.application]]
    .filter(Boolean)
    .join(' · ')

  return (
    <div data-motion="enter">
      <a href={shelf} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">
        ← Tủ đồ
      </a>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] lg:gap-10">
        <div className="motion-enter flex min-w-0 flex-col gap-8">
          <header className="flex items-start gap-4">
            <ProductImage image={photo} name={product.name} size="lg" />
            <div className="min-w-0">
              <p className="text-xs text-ink-mute">{meta}</p>
              <h1 className="text-3xl break-words lg:text-4xl">{product.name}</h1>
              {product.origin?.kind === 'photo' && (
                <p className="mt-1 text-xs text-ink-mute">Đọc từ ảnh nhãn bằng AI, bạn đã so với bao bì</p>
              )}
              {maybeIncomplete(product) && (
                <p className="mt-1 text-xs text-caution-ink">
                  Bảng thành phần có thể chưa đầy đủ, cảnh báo có thể bị thiếu
                </p>
              )}
              {productId === null && <OwnPhoto product={product} actions={actions} />}
            </div>
          </header>
          {/* The photo's credit on its own line under the header: under a 96px photo it would wrap
              to four lines. */}
          <PhotoCredit image={photo} className="-mt-6" />

          <TrackedActives product={product} lines={lines} />

          <section aria-labelledby="label-title" className="rounded-md bg-surface p-4 sm:p-6">
            <h2 id="label-title" className="font-sans text-sm font-semibold">
              Bảng thành phần{lines ? ` · ${lines.count} dòng` : ''}
            </h2>
            <div className="mt-3">
              {productId !== null ? (
                detailError ? (
                  <p className="text-sm text-avoid-ink">Không tải được bảng thành phần.</p>
                ) : !detail ? (
                  <p className="motion-loading text-sm text-ink-mute">Đang tải…</p>
                ) : (
                  <>
                    <p className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-mute">
                      <span>{VERIFICATION_LABELS[detail.verification_status] ?? detail.verification_status}</span>
                      {detail.source_url && (
                        <a
                          href={detail.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-link underline-offset-2 hover:underline"
                        >
                          Lấy từ trang của hãng
                          {detail.source_retrieved_at &&
                            ` (${new Date(detail.source_retrieved_at).toLocaleDateString('vi-VN')})`}
                        </a>
                      )}
                    </p>
                    <IngredientList ingredients={detail.ingredients} onePercentMarker={detail.one_percent_marker} />
                  </>
                )
              ) : (
                <PastedIngredients inci={product.inci ?? ''} />
              )}
            </div>
          </section>
        </div>

        {/* Schedule, warnings (with the "no warning" line) and actions: one block. */}
        <aside className="motion-enter flex min-w-0 flex-col gap-4" style={stagger(1)}>
          <section aria-labelledby="in-schedule" className="rounded-md bg-surface p-5">
            <h2 id="in-schedule" className="font-sans text-sm font-semibold">
              Trong lịch dùng
            </h2>
            <p className="mt-1">{scheduleOf(product, actions)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(['AM', 'PM'] as const).map((session) => (
                <button
                  key={session}
                  onClick={() => actions.addEntry(product.key, session)}
                  aria-label={`${SESSION_LABELS[session]}: thêm “${product.name}” vào buổi ${SESSION_LABELS[session].toLowerCase()}`}
                  className={`${btn} ${sm}`}
                >
                  + {SESSION_LABELS[session]}
                </button>
              ))}
            </div>
            <a
              href={href({ page: 'routine', tab: 'week' })}
              className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
            >
              Sắp xếp trong lịch tuần ›
            </a>
          </section>

          <RelatedWarnings product={product} actions={actions} check={check} />

          {productId !== null && (
            <a
              href={href({ page: 'blog', filter: { skin: null, product: productId, sort: 'new' } })}
              className="flex flex-col rounded-md bg-surface p-5 text-ink hover:text-primary"
            >
              <span className="text-sm font-semibold">Đánh giá về sản phẩm này ›</span>
              <span className="text-xs text-ink-mute">Bài từ người dùng · trải nghiệm cá nhân</span>
            </a>
          )}

          <button
            onClick={() => {
              onRemove(product.key)
              navigate({ page: 'routine', tab: 'shelf' }, { replace: true })
            }}
            className={btnDanger}
          >
            Xoá khỏi tủ
          </button>
        </aside>
      </div>
    </div>
  )
}

/**
 * The tracked groups, each with the label line behind it and its place on the label, from the
 * last routine check. Display only; before a check (or for a product not in the schedule) the
 * groups alone.
 */
function TrackedActives({ product, lines }: { product: MyProduct; lines: LabelGroups | undefined }) {
  const name = useGroupName()
  const rows = lines?.ingredients ?? []
  const first = rows[0]
  return (
    <section aria-labelledby="actives-title">
      <h2 id="actives-title" className="font-sans text-sm font-semibold">
        Hoạt chất SkinWise theo dõi
      </h2>
      {rows.length > 0 && lines ? (
        <>
          <ul className="mt-2 flex flex-col gap-2">
            {rows.map((l) => (
              <li key={`${l.group}:${l.position}`} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="rounded-full bg-thistle px-2 py-px text-xs font-semibold text-thistle-ink">
                  {name(l.group)}
                </span>
                <span className="break-words">{l.name}</span>
                {lines.ordered && (
                  <span className="text-xs text-ink-mute">
                    dòng {l.position}/{lines.count}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 max-w-[72ch] text-xs leading-relaxed text-ink-mute">
            {lines.ordered && first
              ? `"dòng ${first.position}/${lines.count}" nghĩa là chất đó ở dòng thứ ${first.position} trong ${lines.count} dòng của bảng thành phần. `
              : `${UNORDERED_NOTE} `}
            Bảng thành phần không ghi nồng độ, nên có chất này không có nghĩa là đủ lượng để có tác dụng.
          </p>
        </>
      ) : (
        <div className="mt-2">
          <GroupChips codes={product.groups} empty="Không có hoạt chất trong danh sách theo dõi" />
        </div>
      )}
    </section>
  )
}

/** Warnings of the last check that name this product, with the way to their full card. */
function RelatedWarnings({ product, actions, check }: { product: MyProduct; actions: RoutineActions; check: CheckState }) {
  const result = currentResult(check)
  const names = new Map(actions.routine.products.map((p) => [p.key, p.name]))
  const checked = result?.products.some((p) => p.key === product.key) ?? false
  const warnings = (result?.warnings ?? []).filter((w) => w.product_keys.includes(product.key))
  if (!checked) {
    return (
      <p className="text-sm text-ink-soft">
        Sản phẩm chưa có trong lịch dùng (hoặc chưa kiểm tra xong), nên chưa được kiểm tra kết hợp.
      </p>
    )
  }
  if (warnings.length === 0) {
    return <p className="text-sm text-ink-soft">Chưa có cảnh báo, không có nghĩa là chắc chắn an toàn.</p>
  }
  return (
    <>
      {warnings.map((w) => (
        <article
          key={`${w.rule.key}:${w.product_keys.join('+')}`}
          className="relative overflow-hidden rounded-md bg-surface py-4 pr-4 pl-6"
        >
          <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${SEVERITY[w.rule.severity].bar}`} />
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={w.rule.severity} />
            <span className="text-xs text-ink-mute">{KIND_LABELS[w.rule.kind]}</span>
          </div>
          <h3 className="mt-2 leading-snug font-semibold text-pretty">{w.rule.title_vi}</h3>
          <p className="mt-1 text-xs text-ink-mute">
            {w.product_keys.map((k) => names.get(k) ?? k).join(isUsageNote(w) ? ', ' : ' + ')} ·{' '}
            {formatOccurrences(w.occurrences)}
          </p>
          <a
            href={href({ page: 'routine', tab: 'check' })}
            className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
          >
            Xem giải thích và nguồn ›
          </a>
        </article>
      ))}
    </>
  )
}

function PastedIngredients({ inci }: { inci: string }) {
  const [analysis, setAnalysis] = useState<InciAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    api.analyzeInci(inci).then(
      (a) => live && setAnalysis(a),
      (e) => live && setError(requestError(e, 'Không phân tích được bảng thành phần.')),
    )
    return () => {
      live = false
    }
  }, [inci])

  if (error) return <p className="text-sm text-avoid-ink">{error}</p>
  if (!analysis) return <p className="motion-loading text-sm text-ink-mute">Đang tải…</p>
  return (
    <>
      {analysis.suggestions_truncated && (
        <div className="mb-3">
          <DataNote title="Chưa kiểm hết bảng thành phần">{SUGGESTIONS_TRUNCATED_VI}</DataNote>
        </div>
      )}
      <IngredientList ingredients={analysis.ingredients} onePercentMarker={analysis.one_percent_marker} />
    </>
  )
}

/**
 * "Thêm ảnh / Đổi ảnh / Xoá ảnh" for a product the user typed in (POST /me/product-photos). One
 * photo per product: a new one replaces the old on the server. The photo id stays in the routine
 * and is never put in a shared file or link.
 */
function OwnPhoto({ product, actions }: { product: MyProduct; actions: RoutineActions }) {
  const input = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string }>({
    kind: 'idle',
  })
  const busy = state.kind === 'busy'
  const current = product.photoId

  const upload = async (file: File) => {
    setState({ kind: 'busy' })
    try {
      let saved
      try {
        saved = await api.uploadProductPhoto(file, current)
      } catch (e) {
        // The old photo is gone already (cleaned up): upload without replacing it.
        if (!(e instanceof ApiError && e.status === 404 && current !== undefined)) throw e
        saved = await api.uploadProductPhoto(file)
      }
      actions.setProductPhoto(product.key, saved.id)
      setState({ kind: 'idle' })
    } catch (e) {
      setState({ kind: 'error', message: photoError(e) })
    }
  }

  const remove = async () => {
    if (current === undefined) return
    setState({ kind: 'busy' })
    try {
      await api.deleteProductPhoto(current)
    } catch (e) {
      // 404: already gone; the routine just forgets it.
      if (!(e instanceof ApiError && e.status === 404)) return setState({ kind: 'error', message: photoError(e) })
    }
    actions.setProductPhoto(product.key, undefined)
    setState({ kind: 'idle' })
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => input.current?.click()} disabled={busy} className={`${btn} ${sm}`}>
          {busy ? 'Đang lưu ảnh…' : current === undefined ? 'Thêm ảnh' : 'Đổi ảnh'}
        </button>
        {current !== undefined && (
          <button onClick={() => void remove()} disabled={busy} className={btnGhostDanger}>
            Xoá ảnh
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = '' // the same photo can be picked again
          if (file) void upload(file)
        }}
      />
      <p className="mt-1.5 max-w-[48ch] text-xs leading-relaxed text-ink-mute">
        Chỉ chụp sản phẩm, đừng chụp mặt, da hay giấy tờ có thông tin cá nhân. Ảnh chỉ bạn xem được, không có trong
        file hay link chia sẻ routine.
      </p>
      <div aria-live="polite">
        {state.kind === 'error' && <p className="mt-1 text-sm text-avoid-ink">{state.message}</p>}
      </div>
    </div>
  )
}
