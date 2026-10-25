import { useContext } from 'react'
import type { Ingredient } from '../api'
import { FunctionsContext } from '../groups'
import { GroupChips } from './GroupChips'

// Same pattern the backend strips before looking a name up: "Niacinamide 5%", "(4,000Ppm)".
const CONCENTRATION = /\s*[([]?\s*\d+(?:[.,]\d+)*\s*(?:%|ppm)\s*[)\]]?/i

type Props = {
  ingredients: Ingredient[]
  /** The ingredient capped at 1% by EU law that marks the 1% line, if the list has one. */
  onePercentMarker: string | null
  /** Replace a misspelled entry with a suggested name; without it suggestions are text only. */
  onSuggest?: (rawName: string, suggestion: string) => void
}

/** One row per label entry: actives, the EU name when it differs, and usual functions. */
export function IngredientList({ ingredients, onePercentMarker, onSuggest }: Props) {
  const functions = useContext(FunctionsContext)
  const firstAtMostOne = ingredients.find((i) => i.at_most_one_percent)?.position
  return (
    <div>
      <ol className="divide-y divide-slate-200/70 text-xs">
        {ingredients.map((i) => {
          const name = i.raw_name.replace(CONCENTRATION, '').trim().toLowerCase()
          const showEuName = i.eu_name && (i.common_name_of.length > 0 || i.eu_name.toLowerCase() !== name)
          return (
            <li key={i.position} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1">
              {i.position === firstAtMostOne && (
                <p className="mb-1 w-full border-t-2 border-dashed border-slate-300 pt-1 text-[11px] text-slate-500">
                  Từ đây trở xuống (trừ chất tạo màu): mỗi chất ≤ 1%, vì đứng sau {onePercentMarker}, chất bảo quản bị
                  luật EU giới hạn tối đa 1%. Lượng nhỏ không có nghĩa là không có tác dụng.
                </p>
              )}
              <span className={i.groups.length ? 'font-semibold text-rose-700' : 'text-slate-700'}>{i.raw_name}</span>
              {i.declared_concentration && (
                <span
                  className="rounded bg-sky-50 px-1 font-medium text-sky-800 ring-1 ring-sky-200"
                  title="Nồng độ ghi trên nhãn"
                >
                  {i.declared_concentration}
                </span>
              )}
              {i.at_most_one_percent && (
                <span className="text-slate-400" title={`Đứng sau ${onePercentMarker} nên tối đa 1%`}>
                  ≤ 1%
                </span>
              )}
              {i.groups.length > 0 && <GroupChips codes={i.groups} />}
              {showEuName && (
                <span className="text-slate-400" title={i.common_name_note ?? undefined}>
                  = {i.eu_name}
                  {i.common_name_of.length > 1 && ` (hoặc ${i.common_name_of.slice(1).join(', ')})`}
                  {i.common_name_note && ' ⓘ'}
                </span>
              )}
              {!i.known && <span className="text-amber-700 italic">không nhận ra</span>}
              {i.suggestions.length > 0 && (
                <span className="text-amber-800">
                  — có phải{' '}
                  {i.suggestions.map((s, n) => (
                    <span key={s.name}>
                      {n > 0 && ' / '}
                      {onSuggest ? (
                        <button
                          onClick={() => onSuggest(i.raw_name, s.name)}
                          className={`underline hover:text-rose-700 ${s.groups.length ? 'font-semibold' : ''}`}
                          title="Bấm để sửa tên trong bảng thành phần"
                        >
                          {s.name}
                        </button>
                      ) : (
                        <span className={s.groups.length ? 'font-semibold' : undefined}>{s.name}</span>
                      )}
                    </span>
                  ))}
                  ?
                </span>
              )}
              {i.functions.length > 0 && (
                <span className="text-slate-500">
                  ·{' '}
                  {i.functions.map((code, n) => (
                    <span key={code} title={functions.get(code)?.description_vi}>
                      {n > 0 && ', '}
                      {functions.get(code)?.name_vi ?? code}
                    </span>
                  ))}
                </span>
              )}
            </li>
          )
        })}
      </ol>
      <p className="mt-2 text-[11px] text-slate-400">
        Tên theo bảng chú giải thành phần mỹ phẩm EU (2025). Chức năng thường gặp theo danh mục EU 2006, chỉ để tham
        khảo; không phải thành phần nào cũng có. Di chuột vào chức năng để xem giải thích.
      </p>
    </div>
  )
}
