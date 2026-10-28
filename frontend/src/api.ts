// Types and calls for the FastAPI backend (see backend/app/schemas.py). The Vite dev proxy
// strips the /api prefix.

export type Session = 'AM' | 'PM'
export type Severity = 'avoid' | 'caution' | 'info' | 'safe'

export type Group = {
  code: string
  name_vi: string
  description_vi: string | null
  parent_code: string | null // umbrella group, e.g. AHA -> EXFOLIANT_ACID
}

export type ProductSummary = {
  id: number
  slug: string | null
  brand: string
  name: string
  market: string | null
  verification_status: 'unverified' | 'user_confirmed' | 'verified'
  application: Application | null
  groups: string[]
}

/** Rinse-off (cleanser) or leave-on (serum, cream), as EU law defines them. Shown only. */
export type Application = 'rinse_off' | 'leave_on'

export type Ingredient = {
  position: number
  raw_name: string
  inci_name: string | null // in the actives dictionary
  groups: string[]
  eu_name: string | null // name in the EU lists
  functions: string[] // codes of /functions
  known: boolean
  common_name_of: string[] // EU names an everyday name ("Rau má") may stand for
  common_name_note: string | null
  declared_concentration: string | null // printed with the entry, e.g. "10%"
  at_most_one_percent: boolean // listed after an ingredient the EU caps at 1%
  suggestions: { name: string; groups: string[] }[] // close names for an unrecognised entry
  fragrance_allergen: boolean // in the EU fragrance allergen list; shown only, never a warning
}

export type CosmeticFunction = {
  code: string
  name_vi: string
  description_vi: string
  definition_en: string | null
}

export type ProductDetail = ProductSummary & {
  ingredients_source: string
  source_url: string | null
  source_retrieved_at: string | null
  ingredients: Ingredient[]
  one_percent_marker: string | null
}

export type TextNotice = {
  code: 'drug_facts' | 'highlight_list' | 'vietnamese_names' | 'long_entries' | 'few_entries'
  message_vi: string
}

export type InciAnalysis = {
  ingredients: (Ingredient & { may_contain: boolean })[]
  groups: string[]
  unresolved_count: number
  notices: TextNotice[] // signs the text is not a full INCI list
  one_percent_marker: string | null
}

/** The ingredient list an AI model copied off a label photo, for the user to check. */
export type LabelReading = {
  found: boolean // an ingredient list was visible
  text: string // as printed; "[?]" where the model could not read
  unreadable_count: number
}

export type Source = { title: string; publisher: string; url: string; quote: string }

export type Rule = {
  key: string
  kind: 'conflict' | 'duplicate' | 'myth' | 'profile' | 'usage' // usage: about one group
  severity: Severity
  scope: 'same_step' | 'same_session' | 'same_day' | 'routine' // routine: usage rules
  evidence_level: 'high' | 'moderate' | 'low' | 'expert_opinion'
  group_a: string
  group_b: string | null
  title_vi: string
  explanation_vi: string
  sources: Source[]
}

export type RulesResponse = { rules: Rule[]; notice_vi: string | null }

export type RoutineCheckRequest = {
  products: { key: string; product_id?: number; inci?: string }[]
  items: { product_key: string; session: Session; days: number[]; step: number }[]
}

export type Warning = {
  rule: Rule
  product_keys: string[] // two for a pair rule; every product a usage rule is about
  occurrences: { day: number; session: Session | null }[]
}

export type RoutineCheckResponse = {
  warnings: Warning[]
  products: { key: string; groups: string[]; possible_actives: string[]; application: Application | null }[]
  notice_vi: string | null
}

// Review page (backend/app/review_api.py).
export type Draft = {
  id: number
  key: string
  kind: 'myth'
  severity: Severity
  scope: Rule['scope']
  evidence_level: Rule['evidence_level']
  group_a: string
  group_b: string
  title_vi: string
  explanation_vi: string
  answerable: boolean // false: the model found the sources do not answer the question
  reviewer_notes_vi: string
  sources: { url: string; title: string; publisher: string }[]
  quotes: { url: string; quote: string; found: boolean }[] // found: verbatim on the page
  model: string
  status: 'draft' | 'discarded'
  created_by: string
  created_at: string
  toml: string // to paste into backend/data/rules.toml, published = false
}

export type DraftRequest = {
  group_a: string
  group_b: string
  source_urls: string[]
  instructions: string
}

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown // the response body, e.g. what is stored on a 409 sync conflict

  constructor(status: number, message: string, body: unknown = null) {
    super(message)
    this.status = status
    this.body = body
  }
}

// --- User accounts (backend/app/accounts_api.py) ---

export type Me = {
  email: string
  created_at: string
  consents: { purpose: string; policy_version: string; granted_at: string }[]
  routine_updated_at: string | null
  dev_mode: boolean // links are not emailed; accounts are not open to real users
}

export type RegisterRequest = { email: string; password: string; consent: boolean; policy_version: string }
export type EmailRequest = { email: string }
/** The token of a #verify-email link, with the password of the registration that made the link. */
export type VerifyEmailRequest = { token: string; password: string }
export type ResendVerificationRequest = { email: string; password: string }
export type LoginRequest = { email: string; password: string }
export type ResetPasswordRequest = { token: string; password: string }

/** 202 from register, resend-verification and forgot-password: the same answer whether or not the email has an account. */
export type EmailSent = {
  message_vi: string
  dev_link: string | null // dev mode only; null when no link was made (e.g. the email already has an account)
}

/** A list copied off a label photo by an AI model (ProductOrigin in routine.ts). */
export type StoredOrigin = { kind: 'photo'; confirmed: boolean }

/** The routine kept on the server; same shape as Routine in routine.ts. */
export type StoredRoutine = {
  data: {
    products: {
      key: string
      name: string
      brand: string | null
      productId: number | null
      inci: string | null
      groups: string[]
      notices?: TextNotice[]
      origin?: StoredOrigin | null // missing in routines saved before it existed
    }[]
    entries: { id: string; productKey: string; session: Session; days: number[] }[]
  } | null
  version: number // 0 when nothing is stored
  updated_at: string | null
}

/** `token`: a reviewer's session, for the /review routes. */
async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const headers: Record<string, string> = {}
  if (init?.body) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`/api${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const detail = typeof body?.detail === 'string' ? body.detail : res.statusText
    throw new ApiError(res.status, detail, body)
  }
  return (res.status === 204 ? undefined : res.json()) as Promise<T>
}

const post = <T>(path: string, body: unknown, signal?: AbortSignal) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body), signal })

export const api = {
  groups: () => request<Group[]>('/groups'),
  functions: () => request<CosmeticFunction[]>('/functions'),
  searchProducts: (q: string, signal?: AbortSignal) =>
    request<ProductSummary[]>(`/products?${new URLSearchParams({ q })}`, { signal }),
  product: (id: number) => request<ProductDetail>(`/products/${id}`),
  analyzeInci: (text: string) => post<InciAnalysis>('/inci/analyze', { text }),
  /** Signed-in users only: each photo is a billed AI call. */
  readLabel: (body: { media_type: 'image/jpeg'; data: string }) => post<LabelReading>('/label/read', body),
  checkRoutine: (body: RoutineCheckRequest, signal?: AbortSignal) =>
    post<RoutineCheckResponse>('/routine/check', body, signal),
  rules: (params: { kind?: Rule['kind']; groups?: string[] }) => {
    const query = new URLSearchParams()
    if (params.kind) query.set('kind', params.kind)
    for (const g of params.groups ?? []) query.append('groups', g)
    return request<RulesResponse>(`/rules?${query}`)
  },
  login: (name: string, password: string) =>
    post<{ token: string; name: string; expires_at: string }>('/review/login', { name, password }),
  // User accounts; the session is an HttpOnly cookie the browser sends by itself.
  register: (body: RegisterRequest) => post<EmailSent>('/auth/register', body),
  verifyEmail: (body: VerifyEmailRequest) => post<Me>('/auth/verify-email', body),
  resendVerification: (body: ResendVerificationRequest) => post<EmailSent>('/auth/resend-verification', body),
  signIn: (body: LoginRequest) => post<Me>('/auth/login', body),
  forgotPassword: (email: string) => post<EmailSent>('/auth/forgot-password', { email } satisfies EmailRequest),
  resetPassword: (body: ResetPasswordRequest) => post<Me>('/auth/reset-password', body),
  signOut: () => request<void>('/auth/logout', { method: 'POST' }),
  signOutEverywhere: () => request<void>('/auth/logout-all', { method: 'POST' }),
  me: () => request<Me>('/me'),
  myRoutine: () => request<StoredRoutine>('/me/routine'),
  saveRoutine: (data: NonNullable<StoredRoutine['data']>, baseVersion: number) =>
    request<StoredRoutine>('/me/routine', { method: 'PUT', body: JSON.stringify({ data, base_version: baseVersion }) }),
  deleteAccount: (confirmEmail: string) =>
    request<void>('/me', { method: 'DELETE', body: JSON.stringify({ confirm_email: confirmEmail }) }),
}

/** Everything SkinWise keeps about the signed-in user, as a file (GET /me/export). */
export const EXPORT_URL = '/api/me/export'

/** Review page calls; every one needs the reviewer's session token. */
export function reviewApi(token: string) {
  const send = <T>(method: string, path: string, body?: unknown) =>
    request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) }, token)
  return {
    me: () => send<{ name: string }>('GET', '/review/me'),
    logout: () => send<void>('POST', '/review/logout'),
    drafts: (status: Draft['status']) => send<Draft[]>('GET', `/review/drafts?${new URLSearchParams({ status })}`),
    createDraft: (body: DraftRequest) => send<Draft>('POST', '/review/drafts', body),
    setDraftStatus: (id: number, status: Draft['status']) => send<Draft>('PATCH', `/review/drafts/${id}`, { status }),
  }
}

export type ReviewApi = ReturnType<typeof reviewApi>
