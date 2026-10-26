import { useContext } from 'react'
import type { Ingredient } from '../api'
import { FunctionsContext } from '../groups'
import { GroupChips } from './GroupChips'

// Same pattern the backend strips before looking a name up: "Niacinamide 5%", "(4,000Ppm)".
const CONCENTRATION = /\s*[([]?\s*\d+(?:[.,]\d+)*\s*(?:%|ppm)\s*[)\]]?/i
// The thresholds below are quoted from it in backend/data/legal_basis.toml.
const FRAGRANCE_ALLERGEN_SOURCE = 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1545'

type Props = {
  ingredients: Ingredient[]
  /** The ingredient capped at 1% by EU law that marks the 1% line, if the list has one. */
  onePercentMarker: string | null
  /** Replace a misspelled entry with a suggested name; without it suggestions are text only. */
  onSuggest?: (rawName: string, suggestion: string) => void
}

/**
 * One row per label entry, in label order: actives, the EU name when it differs, and usual
 * functions. Set condensed, like the list on the back of the bottle.
 */
export function IngredientList({ ingredients, onePercentMarker, onSuggest }: Props) {
  const functions = useContext(FunctionsContext)
  const firstAtMostOne = ingredients.find((i) => i.at_most_one_percent)?.position
  return (
    <div>
      <ol className="text-sm">
        {ingredients.map((i) => {
          const name = i.raw_name.replace(CONCENTRATION, '').trim().toLowerCase()
          const showEuName = i.eu_name && (i.common_name_of.length > 0 || i.eu_name.toLowerCase() !== name)
          return (
            <li key={i.position}>
              {i.position === firstAtMostOne && (
                <p className="mt-2 mb-1 border-t-2 border-dashed border-ink-mute/50 pt-2 text-xs leading-snug text-ink-soft">
                  Từ đây trở xuống (trừ chất tạo màu): mỗi chất ≤ 1%, vì đứng sau {onePercentMarker}, chất bảo quản bị
                  luật EU giới hạn tối đa 1%. Lượng nhỏ không có nghĩa là không có tác dụng.
                </p>
              )}
              <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] border-b border-line/70 py-1.5">
                <span className="pt-px text-xs text-ink-mute tabular-nums">{i.position}</span>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className={i.groups.length ? 'font-bold text-active-ink' : 'text-ink'}>{i.raw_name}</span>
                  {i.declared_concentration && (
                    <span
                      className="rounded bg-info-soft px-1 text-xs font-semibold text-info-ink"
                      title="Nồng độ ghi trên nhãn"
                    >
                      {i.declared_concentration}
                    </span>
                  )}
                  {i.at_most_one_percent && (
                    <span className="text-xs text-ink-mute" title={`Đứng sau ${onePercentMarker} nên tối đa 1%`}>
                      ≤ 1%
                    </span>
                  )}
                  {i.groups.length > 0 && <GroupChips codes={i.groups} />}
                  {i.fragrance_allergen && (
                    <span
                      className="rounded-full border border-dashed border-ink-mute px-1.5 text-xs text-ink-soft"
                      title="Có trong danh sách chất gây dị ứng hương liệu của EU"
                    >
                      dị ứng hương liệu
                    </span>
                  )}
                  {showEuName && (
                    <span className="text-xs text-ink-mute" title={i.common_name_note ?? undefined}>
                      = {i.eu_name}
                      {i.common_name_of.length > 1 && ` (hoặc ${i.common_name_of.slice(1).join(', ')})`}
                      {i.common_name_note && ' ⓘ'}
                    </span>
                  )}
                  {!i.known && <span className="text-xs text-caution-ink italic">không nhận ra</span>}
                  {i.suggestions.length > 0 && (
                    <span className="text-xs text-caution-ink">
                      có phải{' '}
                      {i.suggestions.map((s, n) => (
                        <span key={s.name}>
                          {n > 0 && ' / '}
                          {onSuggest ? (
                            <button
                              onClick={() => onSuggest(i.raw_name, s.name)}
                              className={`underline decoration-dotted underline-offset-2 hover:text-link ${s.groups.length ? 'font-bold' : ''}`}
                              title="Bấm để sửa tên trong bảng thành phần"
                            >
                              {s.name}
                            </button>
                          ) : (
                            <span className={s.groups.length ? 'font-bold' : undefined}>{s.name}</span>
                          )}
                        </span>
                      ))}
                      ?
                    </span>
                  )}
                  {i.functions.length > 0 && (
                    <span className="text-xs text-ink-mute">
                      {i.functions.map((code, n) => (
                        <span key={code} title={functions.get(code)?.description_vi} className="cursor-help">
                          {n > 0 && ', '}
                          {functions.get(code)?.name_vi ?? code}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
      {ingredients.some((i) => i.fragrance_allergen) && (
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">
          <span className="rounded-full border border-dashed border-ink-mute px-1.5">Dị ứng hương liệu</span>: chất nằm
          trong danh sách chất gây dị ứng hương liệu mà EU bắt buộc ghi riêng tên trên nhãn khi vượt 0,001% (sản phẩm để
          lại trên da) hoặc 0,01% (sản phẩm rửa trôi). Chỉ để thông tin, không phải cảnh báo.{' '}
          <a
            href={FRAGRANCE_ALLERGEN_SOURCE}
            target="_blank"
            rel="noreferrer"
            className="text-link underline-offset-2 hover:underline"
          >
            Quy định (EU) 2023/1545
          </a>
        </p>
      )}
      <p className="mt-2 text-xs leading-relaxed text-ink-mute">
        Tên theo bảng chú giải thành phần mỹ phẩm EU (2025). Chức năng thường gặp theo danh mục EU 2006, chỉ để tham
        khảo; không phải thành phần nào cũng có. Di chuột vào chức năng để xem giải thích.
      </p>
    </div>
  )
}
