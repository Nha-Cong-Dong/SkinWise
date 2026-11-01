import { useEffect, useState } from 'react'
import { api, type ProductSummary } from '../../api'
import { INCI_MAX, MAX_PRODUCTS, PRODUCT_NAME_MAX } from '../../blog'
import type { MyProduct } from '../../routine'
import { GroupChips } from '../GroupChips'
import { Glyph } from '../Icons'
import { field, quiet, secondary } from './parts'
import { pickedKey, type Picked } from './picked'

type Props = {
  picked: Picked[]
  setPicked: (change: (list: Picked[]) => Picked[]) => void
  myProducts: MyProduct[]
}

/** Choose 1–10 products: search the catalogue, take one from "Sản phẩm của tôi", or paste a list. */
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
            <li key={p.key} className="flex items-start gap-3 rounded-xl bg-surface p-3 ring-1 ring-line">
              <span className="pt-0.5 text-xs text-ink-mute tabular-nums">{n + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink-mute">{p.productId !== null ? p.brand : 'Bảng thành phần tự dán'}</p>
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
                className="rounded-full p-1 text-ink-mute hover:bg-paper hover:text-ink"
              >
                <Glyph name="close" className="size-4" />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-ink-mute">Chưa chọn sản phẩm nào. Bài review cần ít nhất một sản phẩm.</p>
      )}

      {full ? (
        <p className="text-sm text-ink-mute">Đã đủ {MAX_PRODUCTS} sản phẩm, số tối đa cho một bài.</p>
      ) : (
        <div className="rounded-xl border border-dashed border-ink-mute/40 p-3.5">
          <div className="flex gap-1 rounded-full bg-paper p-1 text-sm" role="tablist">
            {(
              [
                ['search', 'Tìm sản phẩm'],
                ['mine', 'Sản phẩm của tôi'],
                ['paste', 'Dán thành phần'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`flex-1 rounded-full px-2 py-1.5 ${tab === value ? 'bg-ink font-medium text-white' : 'text-ink-soft hover:text-ink'}`}
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
      {state === 'loading' && results === null && <p className="mt-3 text-sm text-ink-mute">Đang tải…</p>}
      {state === 'error' && <p className="mt-3 text-sm text-avoid-ink">Không tải được danh sách sản phẩm.</p>}
      {results?.length === 0 && (
        <p className="mt-3 text-sm text-ink-mute">Không tìm thấy. Bạn có thể dán bảng thành phần in trên bao bì.</p>
      )}
      <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto">
        {results?.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-mute">{p.brand}</p>
              <p className="text-sm leading-snug font-medium">{p.name}</p>
            </div>
            <button
              type="button"
              disabled={has.has(p.id)}
              onClick={() => onAdd({ key: pickedKey({ productId: p.id }), productId: p.id, name: p.name, brand: p.brand, groups: p.groups })}
              className={quiet}
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
    return <p className="mt-3 text-sm text-ink-mute">“Sản phẩm của tôi” đang trống.</p>
  }
  const pastedTaken = new Set(picked.filter((p) => p.productId === null).map((p) => (p.productId === null ? p.inci : '')))
  return (
    <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto">
      {products.map((p) => {
        const taken = p.productId !== null ? has.has(p.productId) : pastedTaken.has(p.inci ?? '')
        return (
          <li key={p.key} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-mute">{p.brand ?? 'Bảng thành phần tự dán'}</p>
              <p className="text-sm leading-snug font-medium">{p.name}</p>
            </div>
            <button
              type="button"
              disabled={taken}
              onClick={() =>
                onAdd(
                  p.productId !== null
                    ? { key: pickedKey(p), productId: p.productId, name: p.name, brand: p.brand ?? '', groups: p.groups }
                    : { key: pickedKey(p), productId: null, name: p.name.slice(0, PRODUCT_NAME_MAX), inci: p.inci ?? '' },
                )
              }
              className={quiet}
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
