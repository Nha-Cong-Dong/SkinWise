import { useContext } from 'react'
import { GroupsContext, useGroupName } from '../groups'
import { formatLabelLine, type LabelGroups } from '../routine'

type Props = {
  codes: string[]
  empty?: string
  /** `night`: on the evening panel. */
  tone?: 'day' | 'night'
  /** The label lines behind each group, from the routine check; without it the chip shows the group only. */
  found?: LabelGroups
  /**
   * Add GROUP_CHIP_NOTE to the tooltip (a product's groups). False where the chip is not about a
   * product: a draft rule's groups, one line of an ingredient list.
   */
  note?: boolean
}

/** Added to every chip's tooltip: having a group's ingredient says nothing about how much. */
export const GROUP_CHIP_NOTE =
  'Sản phẩm được xếp vào nhóm này vì có chứa chất thuộc nhóm. Bảng thành phần không ghi nồng độ, nên có chất này không có nghĩa là đủ lượng để có tác dụng.'

/** Shown once in the page where chips name an ingredient and its place (tooltips are not read on phones). */
export const LABEL_CHIP_NOTE =
  'Nhãn nhóm như "PHA · Lactobionic Acid (thứ 29/41)" nghĩa là sản phẩm có chứa chất đó, ở vị trí đó trên bảng thành phần. Bảng thành phần không ghi nồng độ, nên có chất này không có nghĩa là đủ lượng để có tác dụng.'

export const UNORDERED_NOTE = 'Danh sách này không xếp theo hàm lượng, nên vị trí không cho biết nhiều hay ít.'

export function GroupChips({ codes, empty, tone = 'day', found, note = true }: Props) {
  const groups = useContext(GroupsContext)
  const name = useGroupName()
  // An umbrella group (EXFOLIANT_ACID) adds nothing when a member (AHA, BHA…) is already shown.
  const parents = new Set(codes.map((c) => groups.get(c)?.parent_code))
  const shown = codes.filter((c) => !parents.has(c))

  if (shown.length === 0) {
    return empty ? (
      <span className={`text-xs ${tone === 'night' ? 'text-night-mute' : 'text-ink-mute'}`}>{empty}</span>
    ) : null
  }
  return (
    <span className="flex max-w-full min-w-0 flex-wrap gap-1">
      {shown.map((code) => {
        const lines = found?.ingredients.filter((i) => i.group === code) ?? []
        const first = lines[0]
        const description = groups.get(code)?.description_vi
        const title = [
          note ? (description ? `${description} ${GROUP_CHIP_NOTE}` : GROUP_CHIP_NOTE) : description,
          found && lines.length > 0 && lines.map((l) => formatLabelLine(l, found)).join(', '),
          found && lines.length > 0 && !found.ordered && UNORDERED_NOTE,
        ]
          .filter(Boolean)
          .join('\n')
        return (
          <span
            key={code}
            title={title || undefined}
            className={`inline-flex max-w-full min-w-0 rounded-full px-2 py-px text-xs font-medium ${
              tone === 'night' ? 'bg-night-raised text-night-text' : 'bg-active text-active-ink'
            }`}
          >
            <span className="shrink-0">{name(code)}</span>
            {found && first && (
              <>
                <span className="shrink-0 whitespace-pre"> · </span>
                {/* A long name is cut here; the tooltip has it in full. */}
                <span className="max-w-[28ch] min-w-0 truncate font-normal">{first.name}</span>
                {(found.ordered || lines.length > 1) && (
                  <span className="shrink-0 font-normal whitespace-pre">
                    {found.ordered && ` (thứ ${first.position}/${found.count})`}
                    {lines.length > 1 && ` +${lines.length - 1}`}
                  </span>
                )}
              </>
            )}
          </span>
        )
      })}
    </span>
  )
}
