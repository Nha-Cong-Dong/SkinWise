import { SESSION_LABELS, formatDays } from '../labels'
import type { MyProduct, RoutineActions } from '../routine'

/** "Sáng: mỗi ngày · Tối: T2, T4", or "Chưa xếp lịch": where a product is in the schedule. */
export function scheduleOf(product: MyProduct, actions: RoutineActions): string {
  const parts = (['AM', 'PM'] as const).flatMap((session) => {
    const entries = actions.routine.entries.filter((e) => e.productKey === product.key && e.session === session)
    if (entries.length === 0) return []
    const days = [...new Set(entries.flatMap((e) => e.days))].sort((a, b) => a - b)
    return [`${SESSION_LABELS[session]}: ${days.length ? formatDays(days) : 'chưa chọn ngày'}`]
  })
  return parts.length ? parts.join(' · ') : 'Chưa xếp lịch'
}
