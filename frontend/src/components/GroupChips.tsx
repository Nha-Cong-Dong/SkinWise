import { useContext } from 'react'
import { GroupsContext, useGroupName } from '../groups'

export function GroupChips({ codes, empty }: { codes: string[]; empty?: string }) {
  const groups = useContext(GroupsContext)
  const name = useGroupName()
  // An umbrella group (EXFOLIANT_ACID) adds nothing when a member (AHA, BHA…) is already shown.
  const parents = new Set(codes.map((c) => groups.get(c)?.parent_code))
  const shown = codes.filter((c) => !parents.has(c))

  if (shown.length === 0) {
    return empty ? <span className="text-xs text-slate-400">{empty}</span> : null
  }
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((code) => (
        <span
          key={code}
          title={groups.get(code)?.description_vi ?? undefined}
          className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200"
        >
          {name(code)}
        </span>
      ))}
    </span>
  )
}
