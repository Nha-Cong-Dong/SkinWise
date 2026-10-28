import { useContext } from 'react'
import { GroupsContext, useGroupName } from '../groups'

type Props = {
  codes: string[]
  empty?: string
  /** `night`: on the evening panel. */
  tone?: 'day' | 'night'
}

export function GroupChips({ codes, empty, tone = 'day' }: Props) {
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
    <span className="flex flex-wrap gap-1">
      {shown.map((code) => (
        <span
          key={code}
          title={groups.get(code)?.description_vi ?? undefined}
          className={`rounded-full px-2 py-px text-xs font-medium ${
            tone === 'night' ? 'bg-night-raised text-night-text' : 'bg-active text-active-ink'
          }`}
        >
          {name(code)}
        </span>
      ))}
    </span>
  )
}
