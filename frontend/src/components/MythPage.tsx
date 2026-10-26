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
    <div className="space-y-14">
      <section aria-labelledby="myth-title">
        <h1
          id="myth-title"
          className="text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl"
        >
          Sự thật hay myth?
        </h1>
        <p className="mt-3 max-w-[38rem] text-base leading-relaxed text-ink-soft">
          Những lời đồn phổ biến về việc kết hợp hoạt chất, đối chiếu với nguồn đáng tin cậy.
        </p>
        <div className="mt-6 space-y-3">
          {error && <p className="text-sm text-avoid-ink">Không tải được thẻ myth.</p>}
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
    <label className="min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setResult(null)
        }}
        className={`w-full rounded-xl border-0 bg-surface px-3.5 py-3 text-[0.9375rem] font-medium ring-1 ring-line focus:ring-2 focus:ring-link focus:outline-none focus-visible:outline-none ${value ? 'text-ink' : 'text-ink-mute'}`}
      >
        <option value="">{label}</option>
        {[...groups.values()].map((g) => (
          <option key={g.code} value={g.code}>
            {g.name_vi}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <section aria-labelledby="pair-title">
      <h2 id="pair-title" className="text-2xl leading-tight font-bold text-balance">
        Hai hoạt chất này dùng chung được không?
      </h2>
      <div className="mt-4 flex flex-col items-stretch gap-2 rounded-2xl bg-night p-3 sm:flex-row sm:items-center">
        {select(a, setA, 'Chọn hoạt chất thứ nhất')}
        <span className="text-center text-2xl leading-none font-light text-moon" aria-hidden="true">
          +
        </span>
        {select(b, setB, 'Chọn hoạt chất thứ hai')}
        <button
          onClick={lookup}
          disabled={!a || !b}
          className="rounded-xl bg-moon px-5 py-3 text-[0.9375rem] font-semibold text-night hover:bg-white disabled:bg-night-raised disabled:text-night-mute"
        >
          Tra cứu
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {error && <p className="text-sm text-avoid-ink">Không tra cứu được.</p>}
        {result?.response.rules.map((rule) => <RuleCard key={rule.key} rule={rule} />)}
        {result?.response.notice_vi && (
          <>
            <Notice>{result.response.notice_vi}</Notice>
            <QuestionForm key={result.codes.join('+')} groupCodes={result.codes} products={products} />
          </>
        )}
      </div>
      {!result && (
        <div className="mt-8">
          <QuestionForm groupCodes={[]} products={products} />
        </div>
      )}
    </section>
  )
}
