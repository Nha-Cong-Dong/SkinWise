import { useContext, useEffect, useState } from 'react'
import { api, type RulesResponse } from '../api'
import { GroupsContext } from '../groups'
import { Notice } from './Notice'
import { RuleCard } from './RuleCard'
import { btnPrimary, field } from './ui'

export function MythPage() {
  const [myths, setMyths] = useState<RulesResponse | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    api.rules({ kind: 'myth' }).then(setMyths, () => setError(true))
  }, [])

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 id="myth-title" className="text-3xl lg:text-4xl">
          Đúng hay sai?
        </h1>
        <p className="mt-2 max-w-[64ch] text-ink-soft">
          Những lời đồn phổ biến về việc kết hợp hoạt chất, đối chiếu với nguồn đáng tin cậy.
        </p>
      </header>
      <PairLookup />
      <section aria-labelledby="myth-list" className="space-y-4">
        <h2 id="myth-list" className="font-sans text-sm font-semibold">
          Lời đồn đã đối chiếu
        </h2>
        {error && <p className="text-sm text-avoid-ink">Không tải được thẻ myth.</p>}
        {myths?.notice_vi && <Notice>{myths.notice_vi}</Notice>}
        {myths?.rules.map((rule) => <RuleCard key={rule.key} rule={rule} />)}
      </section>
    </div>
  )
}

function PairLookup() {
  const groups = useContext(GroupsContext)
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [result, setResult] = useState<{ codes: string[]; response: RulesResponse } | null>(null)
  const [error, setError] = useState(false)

  const lookup = () => {
    // The same group twice asks about two products of it, so it is sent twice.
    const codes = [a, b].filter(Boolean)
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
        className={`${field} min-h-11 ${value ? 'text-ink' : 'text-ink-mute'}`}
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
    <section aria-labelledby="pair-title" className="rounded-md border border-line bg-surface p-4 sm:p-6">
      <h2 id="pair-title" className="font-sans text-base font-semibold text-balance sm:text-xl">
        Hai hoạt chất này dùng chung được không?
      </h2>
      <div className="mt-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        {select(a, setA, 'Chọn hoạt chất thứ nhất')}
        <span className="hidden text-center font-semibold text-ink-mute sm:block" aria-hidden="true">
          +
        </span>
        {select(b, setB, 'Chọn hoạt chất thứ hai')}
        <button onClick={lookup} disabled={!a || !b} className={btnPrimary}>
          Tra cứu
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-mute">Kết quả chỉ đến từ luật đã duyệt. Chưa có luật thì SkinWise nói là chưa có.</p>
      <div className="mt-4 space-y-3 empty:hidden">
        {error && <p className="text-sm text-avoid-ink">Không tra cứu được.</p>}
        {result?.response.rules.map((rule) => <RuleCard key={rule.key} rule={rule} />)}
        {result?.response.notice_vi && <Notice>{result.response.notice_vi}</Notice>}
      </div>
    </section>
  )
}
