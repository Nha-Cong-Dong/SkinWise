import { useState, type FormEvent } from 'react'
import { api } from '../api'
import type { MyProduct } from '../routine'
import { GroupChips } from './GroupChips'

type Props = {
  /** Groups the user just looked up, sent along so the reviewer sees the context. */
  groupCodes: string[]
  products: MyProduct[]
}

export function QuestionForm({ groupCodes, products }: Props) {
  const [question, setQuestion] = useState('')
  const [productIds, setProductIds] = useState<number[]>([])
  const [state, setState] = useState<{ kind: 'idle' | 'sending' } | { kind: 'sent' | 'error'; message: string }>({
    kind: 'idle',
  })
  // Only products from the catalogue have an id the reviewer can look up.
  const seeded = products.filter((p) => p.productId !== null)
  const tooShort = question.trim().length < 5

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setState({ kind: 'sending' })
    api
      .askQuestion({ question: question.trim(), product_ids: productIds, group_codes: groupCodes })
      .then((r) => {
        setState({ kind: 'sent', message: r.message_vi })
        setQuestion('')
        setProductIds([])
      })
      .catch((err) => setState({ kind: 'error', message: err.message }))
  }

  if (state.kind === 'sent') {
    return (
      <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
        <p>{state.message}</p>
        <button onClick={() => setState({ kind: 'idle' })} className="mt-2 text-emerald-900 underline">
          Gửi câu hỏi khác
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h3 className="font-semibold text-slate-900">Gửi câu hỏi hoặc lời đồn bạn nghe được</h3>
      <p className="text-sm text-slate-500">
        Người duyệt sẽ đọc câu hỏi và chỉ làm thẻ trả lời khi tìm được nguồn đáng tin cậy. Vui lòng không ghi thông tin cá nhân.
      </p>
      {groupCodes.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          Liên quan: <GroupChips codes={groupCodes} />
        </div>
      )}
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Ví dụ: Nghe nói không được dùng azelaic acid chung với niacinamide, có đúng không?"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-100 focus:outline-none"
      />
      {seeded.length > 0 && (
        <fieldset className="text-sm">
          <legend className="text-slate-600">Sản phẩm liên quan (nếu có):</legend>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {seeded.map((p) => (
              <label key={p.key} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={productIds.includes(p.productId!)}
                  onChange={(e) =>
                    setProductIds((ids) =>
                      e.target.checked ? [...ids, p.productId!] : ids.filter((id) => id !== p.productId),
                    )
                  }
                />
                {p.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <button
        type="submit"
        disabled={tooShort || state.kind === 'sending'}
        className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-500"
      >
        {state.kind === 'sending' ? 'Đang gửi…' : 'Gửi câu hỏi'}
      </button>
      {state.kind === 'error' && <p className="text-sm text-red-700">Không gửi được ({state.message}).</p>}
    </form>
  )
}
