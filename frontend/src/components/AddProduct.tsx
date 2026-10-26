import { useEffect, useState } from 'react'
import { api, type InciAnalysis, type ProductSummary } from '../api'
import { APPLICATION_LABELS } from '../labels'
import { productKeyFor, type RoutineActions } from '../routine'
import { GroupChips } from './GroupChips'
import { IngredientList } from './IngredientList'
import { DataNote } from './Notice'

type Props = { actions: RoutineActions }

const field =
  'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[0.9375rem] placeholder:text-ink-mute/80 focus:border-link focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-link/20'

/** Content of the "add product" dialog: search the catalogue or paste an ingredient list. */
export function AddProduct({ actions }: Props) {
  const [tab, setTab] = useState<'search' | 'paste'>('search')
  return (
    <div>
      <div className="flex gap-1 rounded-full bg-paper p-1 text-sm" role="tablist">
        {(
          [
            ['search', 'Tìm sản phẩm'],
            ['paste', 'Dán thành phần'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`flex-1 rounded-full px-3 py-1.5 ${tab === value ? 'bg-ink font-medium text-white' : 'text-ink-soft hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'search' ? <SearchProducts actions={actions} /> : <PasteInci actions={actions} />}
    </div>
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
    <div className="mt-4">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Tên hãng hoặc sản phẩm, gõ không dấu cũng được"
        aria-label="Tìm sản phẩm"
        data-autofocus
        className={field}
      />
      {error && <p className="mt-3 text-sm text-avoid-ink">Không tải được danh sách sản phẩm.</p>}
      {results?.length === 0 && (
        <p className="mt-3 text-sm text-ink-mute">
          Không tìm thấy. Bạn có thể dán bảng thành phần in trên bao bì ở thẻ bên cạnh.
        </p>
      )}
      <ul className="mt-2 divide-y divide-line">
        {results?.map((p) => {
          const isAdded = added.has(productKeyFor(p.id))
          return (
            <li key={p.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink-mute">
                  {p.brand}
                  {p.application && <span className="ml-2">{APPLICATION_LABELS[p.application]}</span>}
                </p>
                <p className="text-sm leading-snug font-medium">{p.name}</p>
                <div className="mt-1">
                  <GroupChips codes={p.groups} empty="Không có hoạt chất trong danh sách theo dõi" />
                </div>
              </div>
              <button
                disabled={isAdded}
                onClick={() =>
                  actions.addProduct({ name: p.name, brand: p.brand, productId: p.id, inci: null, groups: p.groups })
                }
                className="shrink-0 rounded-full bg-ink px-3.5 py-1.5 text-sm font-medium text-white hover:bg-link disabled:bg-paper disabled:text-ink-mute"
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

  const analyze = (input = text) => {
    setState('loading')
    api
      .analyzeInci(input)
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
    <div className="mt-4 space-y-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tên sản phẩm (để bạn dễ nhận ra)"
        aria-label="Tên sản phẩm"
        className={field}
      />
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setAnalysis(null)
          setState('idle')
        }}
        rows={6}
        placeholder="Ingredients: Aqua, Glycerin, Niacinamide, …"
        aria-label="Bảng thành phần"
        className={`${field} text-sm leading-relaxed`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => analyze()}
          disabled={!text.trim() || state === 'loading'}
          className="rounded-full px-4 py-2 text-sm font-medium text-ink ring-1 ring-ink hover:bg-paper disabled:opacity-40"
        >
          {state === 'loading' ? 'Đang phân tích…' : 'Phân tích'}
        </button>
        {analysis && (
          <button onClick={add} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-link">
            Thêm vào sản phẩm của tôi
          </button>
        )}
        {state === 'added' && <p className="text-sm text-safe-ink">Đã thêm vào “Sản phẩm của tôi”.</p>}
      </div>
      {state === 'error' && <p className="text-sm text-avoid-ink">Không phân tích được bảng thành phần.</p>}
      {analysis && (
        <AnalysisPreview
          analysis={analysis}
          onSuggest={(rawName, suggestion) => {
            const fixed = text.replace(rawName, suggestion)
            setText(fixed)
            analyze(fixed)
          }}
        />
      )}
    </div>
  )
}

function AnalysisPreview({
  analysis,
  onSuggest,
}: {
  analysis: InciAnalysis
  onSuggest: (rawName: string, suggestion: string) => void
}) {
  const misspelledActives = analysis.ingredients.filter((i) => i.suggestions.some((s) => s.groups.length))
  return (
    <div className="space-y-3 border-t border-line pt-4 text-sm">
      {analysis.notices.map((n) => (
        <DataNote key={n.code} title="Lưu ý về văn bản đã dán">
          {n.message_vi}
        </DataNote>
      ))}
      <div>
        <p className="font-semibold">Hoạt chất nhận ra</p>
        <div className="mt-1.5">
          <GroupChips codes={analysis.groups} empty="Không có hoạt chất nào trong danh sách SkinWise theo dõi." />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-mute">
          Nhận ra {analysis.ingredients.length - analysis.unresolved_count}/{analysis.ingredients.length} thành phần.
          {analysis.unresolved_count > 0 &&
            ' Thành phần không nhận ra có thể do gõ sai, tên không theo chuẩn INCI, hoặc là chất SkinWise chưa biết.'}
        </p>
      </div>
      {misspelledActives.length > 0 && (
        <DataNote title="Có thể có hoạt chất bị gõ sai">
          {misspelledActives.map((i) => `“${i.raw_name}”`).join(', ')} không có trong danh sách, nhưng gần giống tên
          hoạt chất. Nếu gõ sai, hãy bấm vào tên gợi ý bên dưới để sửa; SkinWise không tự sửa và chưa tính chất này khi
          kiểm tra.
        </DataNote>
      )}
      <IngredientList
        ingredients={analysis.ingredients}
        onePercentMarker={analysis.one_percent_marker}
        onSuggest={onSuggest}
      />
    </div>
  )
}
