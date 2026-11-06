import { useState } from 'react'
import { api, type Severity } from '../api'
import { SESSION_LABELS } from '../labels'
import { href } from '../router'
import {
  currentResult,
  maybeIncomplete,
  sampleRoutine,
  type CheckState,
  type LabelGroups,
  type MyProduct,
  type RoutineActions,
} from '../routine'
import { GroupChips } from './GroupChips'
import { Glyph, SeverityBadge } from './Icons'
import { ProductImage } from './ProductImage'
import { scheduleOf } from './shelf'
import { btn, btnGhost, btnGhostDanger, btnPrimary, field, sm } from './ui'

type Props = {
  actions: RoutineActions
  onAdd: () => void
  /** Label lines behind each product's groups (product key), from the last check. */
  found: Map<string, LabelGroups>
  /** Most severe combination warning each product key is part of. */
  flagged: Map<string, Severity>
  /** The routine check, for the "Có lưu ý" filter. */
  check: CheckState
  /** Remove a product and its steps (the page offers "Hoàn tác"). */
  onRemove: (key: string) => void
}

type ShelfFilter = 'all' | 'used' | 'unscheduled' | 'noted'

const FILTERS: [ShelfFilter, string][] = [
  ['all', 'Tất cả'],
  ['used', 'Đang dùng'],
  ['unscheduled', 'Chưa xếp lịch'],
  ['noted', 'Có lưu ý'],
]

/** Lower case, without Vietnamese marks ("Đậu" -> "dau"), for the shelf search. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
}

/** "Tủ đồ": every product the user added, ready to place in a session. */
export function MyProducts({ actions, onAdd, found, flagged, check, onRemove }: Props) {
  const { products } = actions.routine
  // Search and filter live only while the page is open.
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ShelfFilter>('all')
  const scheduled = new Set(actions.routine.entries.map((e) => e.productKey))
  const result = currentResult(check)
  // Exactly the products the check put in a warning (or usage note); unknown until a check has answered.
  const noted = result ? new Set(result.warnings.flatMap((w) => w.product_keys)) : null
  const keep: Record<ShelfFilter, (p: MyProduct) => boolean> = {
    all: () => true,
    used: (p) => scheduled.has(p.key),
    unscheduled: (p) => !scheduled.has(p.key),
    noted: (p) => noted?.has(p.key) ?? false,
  }
  const words = fold(query).split(/\s+/).filter(Boolean)
  const matches = (p: MyProduct) => {
    const text = fold(`${p.name} ${p.brand ?? ''}`)
    return words.every((w) => text.includes(w))
  }
  const searched = products.filter(matches)
  const shown = searched.filter(keep[filter])
  // "Có lưu ý" before a check has answered: say why the list is empty instead of "no match".
  const notedPending = filter === 'noted' && noted === null
  const [sample, setSample] = useState<'idle' | 'loading' | 'error'>('idle')

  const trySample = () => {
    setSample('loading')
    api.searchProducts('').then(
      (catalogue) => {
        const routine = sampleRoutine(catalogue)
        if (routine) actions.replace(routine)
        setSample(routine ? 'idle' : 'error')
      },
      () => setSample('error'),
    )
  }

  return (
    <section aria-labelledby="products-title">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-ink-mute">{products.length} sản phẩm</p>
          <h1 id="products-title" className="text-3xl lg:text-4xl">
            Tủ đồ
          </h1>
        </div>
        {products.length > 0 && (
          <button onClick={onAdd} className={btnPrimary}>
            <Glyph name="plus" className="size-4" />
            Thêm sản phẩm
          </button>
        )}
      </header>
      {products.length === 0 ? (
        <div className="mt-6 max-w-2xl rounded-md border border-dashed border-ink-mute/40 bg-surface p-5">
          <p className="text-sm leading-relaxed text-ink-soft">
            Thêm những sản phẩm bạn đang dùng: tìm trong danh sách có sẵn, hoặc dán bảng thành phần in trên bao bì.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={onAdd} className={btnPrimary}>
              <Glyph name="plus" className="size-4" />
              Thêm sản phẩm
            </button>
            <button onClick={trySample} disabled={sample === 'loading'} className={btn}>
              {sample === 'loading' ? 'Đang tải…' : 'Thử với routine mẫu'}
            </button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-mute">
            Routine mẫu gồm 4 sản phẩm bán ở Việt Nam, chỉ để xem SkinWise kiểm tra thế nào, không phải gợi ý cách dùng.
            Bạn có thể xoá từng sản phẩm bất cứ lúc nào.
          </p>
          {sample === 'error' && (
            <p className="mt-2 text-sm text-avoid-ink">Không tải được routine mẫu. Hãy thử lại sau.</p>
          )}
        </div>
      ) : (
        <>
        <div className="mt-6 flex flex-wrap items-end gap-4">
          <label className="w-full text-xs font-semibold sm:max-w-sm">
            Tìm trong tủ
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tên sản phẩm hoặc tên hãng"
              className={`${field} mt-1 font-normal`}
            />
          </label>
          <div role="group" aria-label="Lọc" className="flex flex-wrap gap-2">
            {FILTERS.map(([value, label]) => {
              const n = value === 'noted' && noted === null ? null : searched.filter(keep[value]).length
              return (
                <button
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={`inline-flex min-h-11 shrink-0 items-center rounded-md border px-3 text-xs font-semibold whitespace-nowrap ${
                    filter === value
                      ? 'border-primary bg-primary text-surface'
                      : 'border-line bg-surface text-primary hover:border-primary'
                  }`}
                >
                  {label}
                  {n !== null && <span className="ml-1.5 tabular-nums opacity-80">{n}</span>}
                </button>
              )
            })}
          </div>
        </div>
        {notedPending ? (
          <p className="mt-6 text-sm text-ink-soft" role="status">
            {check.kind === 'loading'
              ? 'Đang kiểm tra lịch dùng…'
              : check.kind === 'error'
                ? 'Chưa kiểm tra được lịch dùng, nên chưa biết sản phẩm nào có lưu ý.'
                : 'Lịch dùng chưa có bước nào nên chưa có kết quả kiểm tra.'}
          </p>
        ) : shown.length === 0 ? (
          <p className="mt-6 text-sm text-ink-soft" role="status">
            Không có sản phẩm khớp
            {query.trim() ? ` với “${query.trim()}”` : ''}
            {filter !== 'all' ? ` trong mục “${FILTERS.find(([v]) => v === filter)![1]}”` : ''}.
          </p>
        ) : (
        <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {shown.map((p) => (
            <ProductRow
              key={p.key}
              product={p}
              found={found.get(p.key)}
              severity={flagged.get(p.key)}
              actions={actions}
              onRemove={() => onRemove(p.key)}
            />
          ))}
        </ul>
        )}
        </>
      )}
    </section>
  )
}

type RowProps = {
  product: MyProduct
  found: LabelGroups | undefined
  severity: Severity | undefined
  actions: RoutineActions
  onRemove: () => void
}

// Buttons repeat on every card, so their accessible names include the product (aria-label, which
// starts with the visible word).
function ProductRow({ product, found, severity, actions, onRemove }: RowProps) {
  const detail = href({ page: 'shelf-product', key: product.key })
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-md bg-surface p-4 lg:p-5">
      <div className="flex min-w-0 gap-3">
        <ProductImage image={null} name={product.name} size="sm" />
        <a href={detail} className="min-w-0 leading-snug text-pretty text-ink hover:text-primary">
          <span className="block text-xs text-ink-mute">{product.brand ?? 'Tự nhập bảng thành phần'}</span>
          <span className="font-semibold break-words">{product.name}</span>
        </a>
      </div>
      {product.origin?.kind === 'photo' && (
        <p className="-mt-2 text-xs text-ink-mute">Đọc từ ảnh nhãn bằng AI, bạn đã so với bao bì</p>
      )}
      {maybeIncomplete(product) && (
        <p className="-mt-2 text-xs text-caution-ink">Bảng thành phần có thể chưa đầy đủ, cảnh báo có thể bị thiếu</p>
      )}
      <GroupChips codes={product.groups} found={found} empty="Không có hoạt chất trong danh sách theo dõi" />
      <p className="flex flex-wrap items-center gap-2 text-xs text-ink-mute">
        {severity && <SeverityBadge severity={severity} />}
        {scheduleOf(product, actions)}
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
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
        <span className="flex-1" />
        <a href={detail} aria-label={`Thành phần của “${product.name}”`} className={btnGhost}>
          Thành phần
        </a>
        <button
          onClick={onRemove}
          aria-label={`Xoá “${product.name}”`}
          className={btnGhostDanger}
        >
          Xoá
        </button>
      </div>
    </li>
  )
}
