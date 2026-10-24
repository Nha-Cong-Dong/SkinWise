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
  groups: string[]
}

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
}

export type TextNotice = {
  code: 'highlight_list' | 'vietnamese_names' | 'long_entries' | 'few_entries'
  message_vi: string
}

export type InciAnalysis = {
  ingredients: (Ingredient & { may_contain: boolean })[]
  groups: string[]
  unresolved_count: number
  notices: TextNotice[] // signs the text is not a full INCI list
}

export type Source = { title: string; publisher: string; url: string; quote: string }

export type Rule = {
  key: string
  kind: 'conflict' | 'duplicate' | 'myth' | 'profile'
  severity: Severity
  scope: 'same_step' | 'same_session' | 'same_day'
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
  product_keys: [string, string]
  occurrences: { day: number; session: Session | null }[]
}

export type RoutineCheckResponse = {
  warnings: Warning[]
  products: { key: string; groups: string[] }[]
  notice_vi: string | null
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const detail = typeof body?.detail === 'string' ? body.detail : res.statusText
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
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
  checkRoutine: (body: RoutineCheckRequest, signal?: AbortSignal) =>
    post<RoutineCheckResponse>('/routine/check', body, signal),
  rules: (params: { kind?: Rule['kind']; groups?: string[] }) => {
    const query = new URLSearchParams()
    if (params.kind) query.set('kind', params.kind)
    for (const g of params.groups ?? []) query.append('groups', g)
    return request<RulesResponse>(`/rules?${query}`)
  },
  askQuestion: (body: { question: string; product_ids: number[]; group_codes: string[] }) =>
    post<{ id: number; message_vi: string }>('/questions', body),
}
