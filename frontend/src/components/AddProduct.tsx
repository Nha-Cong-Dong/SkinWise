import { useEffect, useState } from 'react'
import { api, type InciAnalysis, type ProductSummary } from '../api'
import { productKeyFor, type RoutineActions } from '../routine'
import { GroupChips } from './GroupChips'
import { IngredientList } from './IngredientList'

type Props = { actions: RoutineActions }

export function AddProduct({ actions }: Props) {
  const [tab, setTab] = useState<'search' | 'paste'>('search')
  return (
    <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="font-semibold text-slate-900">Thêm sản phẩm</h2>
      <div className="mt-3 flex gap-1 rounded-md bg-slate-100 p-1 text-sm" role="tablist">
        {(
          [
            ['search', 'Tìm sản phẩm có sẵn'],
            ['paste', 'Dán bảng thành phần'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`flex-1 rounded px-3 py-1.5 ${tab === value ? 'bg-white font-medium shadow-sm' : 'text-slate-600'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'search' ? <SearchProducts actions={actions} /> : <PasteInci actions={actions} />}
    </section>
  )
}

function SearchProducts({ actions }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductSummary[] | null>(null)
  const [error, setError] = useState(false)
  const added = new Set(actions.routine.products.map((p) => p.key))

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      api
        .searchProducts(query, controller.signal)
        .then((r) => {
          setResults(r)
          setError(false)
        })
        .catch((e) => {
          if (e.name !== 'AbortError') setError(true)
        })
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
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-100 focus:outline-none"
      />
      {error && <p className="mt-2 text-sm text-red-700">Không tải được danh sách sản phẩm.</p>}
      {results?.length === 0 && (
        <p className="mt-2 text-sm text-slate-500">
          Không tìm thấy. Bạn có thể dán bảng thành phần in trên bao bì ở thẻ bên cạnh.
        </p>
      )}
      <ul className="mt-2 max-h-80 divide-y divide-slate-100 overflow-y-auto">
        {results?.map((p) => {
          const isAdded = added.has(productKeyFor(p.id))
          return (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500">{p.brand}</p>
                <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                <div className="mt-1">
                  <GroupChips codes={p.groups} empty="Không có hoạt chất trong danh sách theo dõi" />
                </div>
              </div>
              <button
                disabled={isAdded}
                onClick={() =>
                  actions.addProduct({ name: p.name, brand: p.brand, productId: p.id, inci: null, groups: p.groups })
                }
                className="shrink-0 rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-500"
              >
                {isAdded ? 'Đã thêm' : 'Thêm'}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function PasteInci({ actions }: Props) {
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [analysis, setAnalysis] = useState<InciAnalysis | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'added'>('idle')

  const analyze = () => {
    setState('loading')
    api
      .analyzeInci(text)
      .then((a) => {
        setAnalysis(a)
        setState('idle')
      })
      .catch(() => setState('error'))
  }

  const add = () => {
    if (!analysis) return
    actions.addProduct({
      name: name.trim() || 'Sản phẩm tự nhập',
      brand: null,
      productId: null,
      inci: text.trim(),
      groups: analysis.groups,
      notices: analysis.notices,
    })
    setName('')
    setText('')
    setAnalysis(null)
    setState('added')
  }

  return (
    <div className="mt-3 space-y-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tên sản phẩm (để bạn dễ nhận ra)"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-100 focus:outline-none"
      />
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setAnalysis(null)
          setState('idle')
        }}
        rows={5}
        placeholder="Ingredients: Aqua, Glycerin, Niacinamide, …"
        className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs focus:border-rose-400 focus:ring-2 focus:ring-rose-100 focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          onClick={analyze}
          disabled={!text.trim() || state === 'loading'}
          className="rounded-md border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
        >
          {state === 'loading' ? 'Đang phân tích…' : 'Phân tích'}
        </button>
        {analysis && (
          <button
            onClick={add}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700"
          >
            Thêm vào sản phẩm của tôi
          </button>
        )}
      </div>
      {state === 'error' && <p className="text-sm text-red-700">Không phân tích được bảng thành phần.</p>}
      {state === 'added' && <p className="text-sm text-emerald-700">Đã thêm vào “Sản phẩm của tôi”.</p>}
      {analysis && <AnalysisPreview analysis={analysis} />}
    </div>
  )
}

function AnalysisPreview({ analysis }: { analysis: InciAnalysis }) {
  return (
    <div className="rounded-md bg-slate-50 p-3 text-sm">
      {analysis.notices.map((n) => (
        <p key={n.code} className="mb-2 rounded-md bg-amber-50 p-2 text-amber-900 ring-1 ring-amber-200">
          {n.message_vi}
        </p>
      ))}
      <p className="font-medium text-slate-700">Hoạt chất nhận ra:</p>
      <div className="mt-1">
        <GroupChips codes={analysis.groups} empty="Không có hoạt chất nào trong danh sách SkinWise theo dõi." />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Nhận ra {analysis.ingredients.length - analysis.unresolved_count}/{analysis.ingredients.length} thành phần.
        {analysis.unresolved_count > 0 &&
          ' Thành phần không nhận ra có thể do gõ sai, tên không theo chuẩn INCI, hoặc là chất SkinWise chưa biết.'}
      </p>
      <div className="mt-2">
        <IngredientList ingredients={analysis.ingredients} />
      </div>
    </div>
  )
}
