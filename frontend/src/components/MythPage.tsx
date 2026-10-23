import { useContext, useEffect, useState } from 'react'
import { api, type RulesResponse } from '../api'
import { GroupsContext } from '../groups'
import type { MyProduct } from '../routine'
import { Notice } from './Notice'
import { QuestionForm } from './QuestionForm'
import { RuleCard } from './RuleCard'

export function MythPage({ products }: { products: MyProduct[] }) {
  const [myths, setMyths] = useState<RulesResponse | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    api.rules({ kind: 'myth' }).then(setMyths, () => setError(true))
  }, [])

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-slate-900">Sự thật hay myth?</h2>
        <p className="text-sm text-slate-500">
          Những lời đồn phổ biến về việc kết hợp hoạt chất, đối chiếu với nguồn đáng tin cậy.
        </p>
        <div className="mt-3 space-y-3">
          {error && <p className="text-sm text-red-700">Không tải được thẻ myth.</p>}
          {myths?.notice_vi && <Notice>{myths.notice_vi}</Notice>}
          {myths?.rules.map((rule) => <RuleCard key={rule.key} rule={rule} />)}
        </div>
      </section>
      <PairLookup products={products} />
    </div>
  )
}

function PairLookup({ products }: { products: MyProduct[] }) {
  const groups = useContext(GroupsContext)
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [result, setResult] = useState<{ codes: string[]; response: RulesResponse } | null>(null)
  const [error, setError] = useState(false)

  const lookup = () => {
    const codes = [...new Set([a, b])].filter(Boolean)
    setError(false)
    api.rules({ groups: codes }).then((response) => setResult({ codes, response }), () => setError(true))
  }

  const select = (value: string, onChange: (v: string) => void, label: string) => (
    <label className="flex-1 text-sm">
      <span className="text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setResult(null)
        }}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
      >
        <option value="">— Chọn nhóm hoạt chất —</option>
        {[...groups.values()].map((g) => (
          <option key={g.code} value={g.code}>
            {g.name_vi}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-900">Tra cứu: hai hoạt chất này dùng chung được không?</h2>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        {select(a, setA, 'Hoạt chất thứ nhất')}
        <span className="hidden pb-2 text-slate-400 sm:block">+</span>
        {select(b, setB, 'Hoạt chất thứ hai')}
        <button
          onClick={lookup}
          disabled={!a || !b}
          className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-500"
        >
          Tra cứu
        </button>
      </div>
      <div className="mt-3 space-y-3">
        {error && <p className="text-sm text-red-700">Không tra cứu được.</p>}
        {result?.response.rules.map((rule) => <RuleCard key={rule.key} rule={rule} />)}
        {result?.response.notice_vi && (
          <>
            <Notice>{result.response.notice_vi}</Notice>
            <QuestionForm key={result.codes.join('+')} groupCodes={result.codes} products={products} />
          </>
        )}
      </div>
      {!result && (
        <div className="mt-6">
          <QuestionForm groupCodes={[]} products={products} />
        </div>
      )}
    </section>
  )
}
