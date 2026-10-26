import type { Application, QuestionStatus, Rule, Session, Severity, Warning } from './api'

export const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] // 0 = Monday
/** Spoken names: a screen reader reads "T2" letter by letter. */
export const DAY_NAMES = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật']
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

export const SESSION_LABELS: Record<Session, string> = { AM: 'Sáng', PM: 'Tối' }

// Most severe first. `badge`: label on a pale background; `mark`: the icon's colour.
export const SEVERITY: Record<Severity, { label: string; badge: string; mark: string }> = {
  avoid: { label: 'Nên tránh', badge: 'bg-avoid-soft text-avoid-ink', mark: 'text-avoid' },
  caution: { label: 'Thận trọng', badge: 'bg-caution-soft text-caution-ink', mark: 'text-caution' },
  info: { label: 'Thông tin', badge: 'bg-info-soft text-info-ink', mark: 'text-info' },
  safe: { label: 'An toàn', badge: 'bg-safe-soft text-safe-ink', mark: 'text-safe' },
}

export const KIND_LABELS: Record<Rule['kind'], string> = {
  conflict: 'Kết hợp cần lưu ý',
  duplicate: 'Trùng hoạt chất',
  myth: 'Sự thật hay myth',
  profile: 'Theo loại da',
  usage: 'Lưu ý khi dùng',
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
  routine: 'trong routine',
}

export const APPLICATION_LABELS: Record<Application, string> = {
  rinse_off: 'Rửa trôi',
  leave_on: 'Để lại trên da',
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
