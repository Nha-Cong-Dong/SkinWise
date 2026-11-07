import { useEffect, useState } from 'react'
import { api, type ProductSummary } from '../../api'
import { INCI_MAX, MAX_PRODUCTS, PRODUCT_NAME_MAX } from '../../blog'
import type { MyProduct } from '../../routine'
import { GroupChips } from '../GroupChips'
import { Glyph } from '../Icons'
import { field, secondary, small } from './styles'
import { segBox, segOption } from '../ui'
import { pickedKey, type Picked } from './picked'

type Props = {
  picked: Picked[]
  setPicked: (change: (list: Picked[]) => Picked[]) => void
  myProducts: MyProduct[]
}

/**
 * Choose 1–10 products: search the catalogue, take one from the user's shelf ("Tủ đồ của tôi": a
 * catalogue product by its id, a pasted list by its name and ingredients), or paste a list.
 */
export function ProductPicker({ picked, setPicked, myProducts }: Props) {
  const [tab, setTab] = useState<'search' | 'mine' | 'paste'>('search')
  const full = picked.length >= MAX_PRODUCTS
  const has = new Set(picked.filter((p) => p.productId !== null).map((p) => p.productId))
  const add = (p: Picked) => setPicked((list) => (list.length >= MAX_PRODUCTS || list.some((x) => x.key === p.key) ? list : [...list, p]))

  return (
    <div className="space-y-3">
      {picked.length > 0 ? (
        <ol className="space-y-2">
          {picked.map((p, n) => (
            <li key={p.key} className="flex items-start gap-3 rounded-md border border-line bg-surface p-3">
              <span className="pt-0.5 text-xs text-ink-soft tabular-nums">{n + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink-soft">{p.productId !== null ? p.brand : 'Bảng thành phần tự dán'}</p>
                <p className="text-sm leading-snug font-medium">{p.name}</p>
                {p.productId !== null && (
                  <div className="mt-1">
                    <GroupChips codes={p.groups} />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPicked((list) => list.filter((x) => x.key !== p.key))}
                aria-label={`Bỏ ${p.name}`}
                className="motion-press -m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-thistle/25 hover:text-ink md:size-9"
              >
                <Glyph name="close" className="size-4" />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-ink-soft">Chưa chọn sản phẩm nào. Bài review cần ít nhất một sản phẩm.</p>
      )}

      {full ? (
        <p className="text-sm text-ink-soft">Đã đủ {MAX_PRODUCTS} sản phẩm, số tối đa cho một bài.</p>
      ) : (
        <div className="rounded-md border border-line bg-paper p-3.5">
          <div className={segBox} role="tablist" aria-label="Cách thêm sản phẩm">
            {(
              [
                ['search', 'Tìm sản phẩm'],
                ['mine', 'Tủ đồ của tôi'],
                ['paste', 'Dán thành phần'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={segOption(tab === value)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'search' && <Search has={has} onAdd={add} />}
          {tab === 'mine' && <Mine products={myProducts} has={has} picked={picked} onAdd={add} />}
          {tab === 'paste' && <Paste onAdd={add} />}
        </div>
      )}
    </div>
  )
}

function Search({ has, onAdd }: { has: Set<number>; onAdd: (p: Picked) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductSummary[] | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setState('loading')
      api.searchProducts(query, controller.signal).then(
        (r) => {
          setResults(r)
          setState('ready')
        },
        (e) => e.name !== 'AbortError' && setState('error'),
      )
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  return (
    <div className="mt-3">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Tên hãng hoặc sản phẩm, gõ không dấu cũng được"
        aria-label="Tìm sản phẩm"
        className={field}
      />
      {state === 'loading' && results === null && <p className="mt-3 text-sm text-ink-soft">Đang tải…</p>}
      {state === 'error' && <p className="mt-3 text-sm text-avoid-ink">Không tải được danh sách sản phẩm.</p>}
      {results?.length === 0 && (
        <p className="mt-3 text-sm text-ink-soft">Không tìm thấy. Bạn có thể dán bảng thành phần in trên bao bì.</p>
      )}
      <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto">
        {results?.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-soft">{p.brand}</p>
              <p className="text-sm leading-snug font-medium">{p.name}</p>
            </div>
            <button
              type="button"
              disabled={has.has(p.id)}
              aria-label={`${has.has(p.id) ? 'Đã chọn' : 'Chọn'} ${p.brand} ${p.name}`}
              onClick={() => onAdd({ key: pickedKey({ productId: p.id }), productId: p.id, name: p.name, brand: p.brand, groups: p.groups })}
              className={`${secondary} ${small}`}
            >
              {has.has(p.id) ? 'Đã chọn' : 'Chọn'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Mine({
  products,
  has,
  picked,
  onAdd,
}: {
  products: MyProduct[]
  has: Set<number>
  picked: Picked[]
  onAdd: (p: Picked) => void
}) {
  if (products.length === 0) {
    return (
      <p className="mt-3 text-sm text-ink-soft">
        Tủ đồ đang trống. Thêm sản phẩm ở trang Lịch dùng, hoặc tìm sản phẩm hay dán thành phần ở hai thẻ bên cạnh.
      </p>
    )
  }
  const pastedTaken = new Set(picked.filter((p) => p.productId === null).map((p) => (p.productId === null ? p.inci : '')))
  return (
    <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto">
      {products.map((p) => {
        const taken = p.productId !== null ? has.has(p.productId) : pastedTaken.has(p.inci ?? '')
        return (
          <li key={p.key} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-soft">{p.brand ?? 'Bảng thành phần tự dán'}</p>
              <p className="text-sm leading-snug font-medium">{p.name}</p>
            </div>
            <button
              type="button"
              disabled={taken}
              aria-label={`${taken ? 'Đã chọn' : 'Chọn'} ${p.name}`}
              onClick={() =>
                onAdd(
                  p.productId !== null
                    ? { key: pickedKey(p), productId: p.productId, name: p.name, brand: p.brand ?? '', groups: p.groups }
                    : { key: pickedKey(p), productId: null, name: p.name.slice(0, PRODUCT_NAME_MAX), inci: p.inci ?? '' },
                )
              }
              className={`${secondary} ${small}`}
            >
              {taken ? 'Đã chọn' : 'Chọn'}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Paste({ onAdd }: { onAdd: (p: Picked) => void }) {
  const [name, setName] = useState('')
  const [inci, setInci] = useState('')
  const ok = name.trim().length > 0 && inci.trim().length > 0 && inci.length <= INCI_MAX
  return (
    <div className="mt-3 space-y-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={PRODUCT_NAME_MAX}
        placeholder="Tên sản phẩm"
        aria-label="Tên sản phẩm"
        className={field}
      />
      <textarea
        value={inci}
        onChange={(e) => setInci(e.target.value)}
        maxLength={INCI_MAX}
        rows={4}
        placeholder="Ingredients: Aqua, Glycerin, Niacinamide, …"
        aria-label="Bảng thành phần"
        className={`${field} text-sm leading-relaxed`}
      />
      <button
        type="button"
        disabled={!ok}
        onClick={() => {
          onAdd({ key: pickedKey({ productId: null }), productId: null, name: name.trim(), inci: inci.trim() })
          setName('')
          setInci('')
        }}
        className={secondary}
      >
        Thêm sản phẩm này
      </button>
    </div>
  )
}
