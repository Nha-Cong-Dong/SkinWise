import type { QuestionStatus, Rule, Session, Severity, Warning } from './api'

export const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] // 0 = Monday
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

export const SESSION_LABELS: Record<Session, string> = { AM: 'Sáng', PM: 'Tối' }

export const SEVERITY: Record<Severity, { label: string; badge: string; border: string }> = {
  avoid: { label: 'Nên tránh', badge: 'bg-red-100 text-red-800', border: 'border-red-300' },
  caution: { label: 'Thận trọng', badge: 'bg-amber-100 text-amber-800', border: 'border-amber-300' },
  info: { label: 'Thông tin', badge: 'bg-sky-100 text-sky-800', border: 'border-sky-300' },
  safe: { label: 'An toàn', badge: 'bg-emerald-100 text-emerald-800', border: 'border-emerald-300' },
}

export const KIND_LABELS: Record<Rule['kind'], string> = {
  conflict: 'Kết hợp cần lưu ý',
  duplicate: 'Trùng hoạt chất',
  myth: 'Sự thật hay myth',
  profile: 'Theo loại da',
}

export const EVIDENCE_LABELS: Record<Rule['evidence_level'], string> = {
  high: 'cao',
  moderate: 'trung bình',
  low: 'thấp',
  expert_opinion: 'ý kiến chuyên gia',
}

export const SCOPE_LABELS: Record<Rule['scope'], string> = {
  same_step: 'cùng một bước',
  same_session: 'cùng một buổi',
  same_day: 'cùng một ngày',
}

export const QUESTION_STATUS_LABELS: Record<QuestionStatus, string> = {
  new: 'Mới',
  accepted: 'Đang làm',
  rejected: 'Không làm',
  answered: 'Đã trả lời',
}

export const VERIFICATION_LABELS: Record<string, string> = {
  unverified: 'Chưa có người xác minh',
  user_confirmed: 'Người dùng đã xác nhận',
  verified: 'Đã xác minh với trang nguồn',
}

function formatDays(days: number[]): string {
  return days.length === 7 ? 'mỗi ngày' : days.map((d) => DAY_LABELS[d]).join(', ')
}

/** "Tối: T2, T4" / "Sáng: mỗi ngày" / "Trong ngày: T3" — one part per session. */
export function formatOccurrences(occurrences: Warning['occurrences']): string {
  const bySession = new Map<Session | null, number[]>()
  for (const o of occurrences) {
    bySession.set(o.session, [...(bySession.get(o.session) ?? []), o.day])
  }
  return [...bySession]
    .map(([session, days]) => `${session ? SESSION_LABELS[session] : 'Trong ngày'}: ${formatDays(days)}`)
    .join(' · ')
}
