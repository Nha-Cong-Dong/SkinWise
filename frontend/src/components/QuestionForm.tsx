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
      <div className="rounded-2xl bg-safe-soft p-5 text-sm text-safe-ink">
        <p>{state.message}</p>
        <button onClick={() => setState({ kind: 'idle' })} className="mt-2 font-medium underline underline-offset-2">
          Gửi câu hỏi khác
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl bg-surface p-5 ring-1 ring-line">
      <div>
        <h3 className="text-base font-semibold">Gửi câu hỏi hoặc lời đồn bạn nghe được</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-mute">
          Người duyệt sẽ đọc câu hỏi và chỉ làm thẻ trả lời khi tìm được nguồn đáng tin cậy. Vui lòng không ghi thông tin
          cá nhân.
        </p>
      </div>
      {groupCodes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          Liên quan: <GroupChips codes={[...new Set(groupCodes)]} />
        </div>
      )}
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={3}
        maxLength={2000}
        aria-label="Câu hỏi"
        placeholder="Ví dụ: Nghe nói không được dùng azelaic acid chung với niacinamide, có đúng không?"
        className="w-full rounded-xl border border-line px-3.5 py-2.5 text-[0.9375rem] placeholder:text-ink-mute/80 focus:border-link focus:ring-2 focus:ring-link/20 focus:outline-none focus-visible:outline-none"
      />
      {seeded.length > 0 && (
        <fieldset className="text-sm">
          <legend className="text-ink-soft">Sản phẩm liên quan (nếu có):</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {seeded.map((p) => {
              const checked = productIds.includes(p.productId!)
              return (
                <label
                  key={p.key}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 ring-1 has-focus-visible:outline-2 has-focus-visible:outline-link ${
                    checked ? 'bg-ink text-white ring-ink' : 'text-ink-soft ring-line hover:ring-ink-mute'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={(e) =>
                      setProductIds((ids) =>
                        e.target.checked ? [...ids, p.productId!] : ids.filter((id) => id !== p.productId),
                      )
                    }
                  />
                  {p.name}
                </label>
              )
            })}
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={tooShort || state.kind === 'sending'}
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-link disabled:bg-paper disabled:text-ink-mute"
        >
          {state.kind === 'sending' ? 'Đang gửi…' : 'Gửi câu hỏi'}
        </button>
        {state.kind === 'error' && <p className="text-sm text-avoid-ink">Không gửi được ({state.message}).</p>}
      </div>
    </form>
  )
}
