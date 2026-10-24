import { useContext } from 'react'
import type { Ingredient } from '../api'
import { FunctionsContext } from '../groups'
import { GroupChips } from './GroupChips'

/** One row per label entry: actives, the EU name when it differs, and usual functions. */
export function IngredientList({ ingredients }: { ingredients: Ingredient[] }) {
  const functions = useContext(FunctionsContext)
  return (
    <div>
      <ol className="divide-y divide-slate-200/70 text-xs">
        {ingredients.map((i) => {
          const showEuName = i.eu_name && (i.common_name_of.length > 0 || i.eu_name.toLowerCase() !== i.raw_name.toLowerCase())
          return (
            <li key={i.position} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1">
              <span className={i.groups.length ? 'font-semibold text-rose-700' : 'text-slate-700'}>{i.raw_name}</span>
              {i.groups.length > 0 && <GroupChips codes={i.groups} />}
              {showEuName && (
                <span className="text-slate-400" title={i.common_name_note ?? undefined}>
                  = {i.eu_name}
                  {i.common_name_of.length > 1 && ` (hoặc ${i.common_name_of.slice(1).join(', ')})`}
                  {i.common_name_note && ' ⓘ'}
                </span>
              )}
              {!i.known && <span className="text-amber-700 italic">không nhận ra</span>}
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
