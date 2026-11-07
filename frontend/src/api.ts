// Types and calls for the FastAPI backend (see backend/app/schemas.py). The Vite dev proxy
// strips the /api prefix.

import type { PortableRoutine } from './share'

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
  // Ingredients (as printed on the label) that made the product match a search; [] when none.
  matched_ingredients: string[]
  image: ProductImageOut | null // a checked catalogue photo; null: show the initial instead
}

/** A catalogue product's photo from Open Beauty Facts (CC BY-SA 3.0). Display only. */
export type ProductImageOut = {
  url: string // "/product-images/<slug>.webp?v=…", without the /api prefix
  credit_vi: string // "Ảnh: Open Beauty Facts (CC BY-SA 3.0)", shown under the photo as is
  source_url: string // the product's page on Open Beauty Facts
  license_url: string // the licence text
}

/** POST /me/product-photos: the user's own photo of a product they typed in. */
export type ProductPhotoOut = {
  id: number
  url: string // "/me/product-photos/{id}", without the /api prefix; served to its owner only
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

// matched_ingredients belongs to search results only; /products/{id} may or may not carry it.
export type ProductDetail = Omit<ProductSummary, 'matched_ingredients'> & {
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
  suggestions_truncated: boolean // some unrecognised lines were not checked for close names
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
  plain_vi: string | null // reviewed plain-language rewording of explanation_vi; null when none
  sources: Source[]
  reviewed_at: string | null // YYYY-MM-DD: when a reviewer read the sources and published the rule
}

export type RulesResponse = { rules: Rule[]; notice_vi: string | null }

/** Skin goals (GET /goals): reviewed, sourced reading per goal. Never changes a warning. */
export type GoalItem = {
  key: string
  kind: 'active' | 'info'
  group: string | null // group code; set only for `active`
  title_vi: string
  body_vi: string
  sources: Source[]
}

export type Goal = {
  code: string
  name_vi: string
  description_vi: string
  actives: GoalItem[]
  infos: GoalItem[]
  has_article: boolean // true only when the goal has a published long article (GET /goals/{code}/article)
}

export type GoalsResponse = {
  goals: Goal[] // without the shared "all" goal
  shared_infos: GoalItem[] // items of "all", shown with every goal
  notice_vi: string // always set: not a substitute for a dermatologist
}

/** A long article for a goal (GET /goals/{code}/article). Shown verbatim; never changes a warning. */
export type ArticleParagraph = {
  text_vi: string
  refs: number[] // 1-based numbers into GoalArticle.sources; unique, ascending
}

export type ArticleSection = {
  anchor: string // "phan-1", "phan-2"…, stable by order
  heading_vi: string
  paragraphs: ArticleParagraph[]
}

export type ArticleSource = {
  n: number // 1-based, numbered by first appearance in the article
  title: string
  publisher: string
  url: string
  quotes: string[] // every quote of this source in the article, in order, without duplicates
}

export type GoalArticle = {
  goal: string
  goal_name_vi: string
  title_vi: string
  reviewed_by: string
  reviewed_at: string // YYYY-MM-DD
  sections: ArticleSection[]
  sources: ArticleSource[]
  notice_vi: string
}

export type RoutineCheckRequest = {
  products: { key: string; product_id?: number; inci?: string }[]
  items: { product_key: string; session: Session; days: number[]; step: number }[]
}

/** POST /demo/check (landing page, no sign-in): sample products by id only, at most 10 products and 40 steps. */
export type DemoCheckRequest = {
  products: { key: string; product_id: number }[]
  items: RoutineCheckRequest['items']
}

export type Warning = {
  rule: Rule
  product_keys: string[] // two for a pair rule; every product a usage rule is about
  occurrences: { day: number; session: Session | null }[]
}

export type RoutineCheckResponse = {
  warnings: Warning[]
  products: {
    key: string
    groups: string[]
    possible_actives: string[]
    suggestions_truncated: boolean // some unrecognised lines were not checked for close names
    application: Application | null
    group_ingredients: GroupIngredient[] // display only: which label line put the product in which group
    ingredient_count: number // lines in the list `position` counts in
    ordered: boolean // false: key-ingredient list or Drug Facts label, not in order of weight
  }[]
  notice_vi: string | null
}

/** A label line that puts a product in a group (parent groups included). Display only. */
export type GroupIngredient = {
  group: string
  name: string // as printed on the label
  position: number // 1-based line number in the list as read
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

export const SESSION_EXPIRED = 'Phiên đăng nhập đã hết. Hãy đăng nhập lại.'

/**
 * Sent on `window` when a request with the user's session cookie gets a 401: the session has
 * ended, so `useAccount` checks again and the app goes back to the sign-in form.
 */
export const SIGNED_OUT_EVENT = 'skinwise:signed-out'

/** The sentence shown when a pasted list had more unrecognised names than were checked for typos. */
export const SUGGESTIONS_TRUNCATED_VI =
  'Bảng này có nhiều tên SkinWise chưa nhận ra, nên chưa kiểm hết được các tên có thể bị gõ sai. Có thể đang thiếu cảnh báo.'
// 429: too many requests from this address (nginx limit_req on /routine/check and /inci/analyze).
export const TOO_FAST = 'Bạn thao tác quá nhanh, thử lại sau ít phút.'

/** Why a request failed, in the terms the user can act on. */
export type RequestProblem = 'signed-out' | 'too-many' | 'failed'

export function requestProblem(e: unknown): RequestProblem {
  const status = e instanceof ApiError ? e.status : 0
  return status === 401 ? 'signed-out' : status === 429 ? 'too-many' : 'failed'
}

/** The message for a failed request: a 401 or 429 says so, anything else is `fallback`. */
export function requestError(e: unknown, fallback: string): string {
  const problem = requestProblem(e)
  return problem === 'signed-out' ? SESSION_EXPIRED : problem === 'too-many' ? TOO_FAST : fallback
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
      photoId?: number // the user's photo of a typed-in product; left out when none
    }[]
    entries: { id: string; productKey: string; session: Session; days: number[] }[]
  } | null
  version: number // 0 when nothing is stored
  updated_at: string | null
}

// --- Community reviews (backend/app/blog_api.py). Every route needs the user's session. ---

export type SkinType = 'oily' | 'dry' | 'combination' | 'normal' | 'sensitive'
export type Disclosure = 'none' | 'gifted' | 'sponsored'
/** Lists, author pages and counts include `visible` only; the author also sees their own other states. */
export type ContentStatus = 'visible' | 'pending' | 'hidden' | 'removed'
export type ReportReason = 'medical_claim' | 'personal_info' | 'advertising' | 'offensive' | 'other'

/** GET/PUT /me/profile. `handle` null: not set yet, so the user cannot post or comment. */
export type Profile = { handle: string | null; skin_type: SkinType | null }
export type ProfileIn = { handle: string; skin_type: SkinType | null }

/** Exactly one source: a catalogue product, or a name with a pasted ingredient list. */
export type PostProductIn = { product_id?: number; name?: string; inci?: string }

export type PostIn = {
  title: string // 5–120
  body: string // 20–10,000, plain text
  rating: number | null // 1–5
  skin_type: SkinType | null
  disclosure: Disclosure
  products: PostProductIn[] // 1–10
  image_ids: number[] // 0–4, the user's own uploads; order = display order
  routine: PortableRoutine | null // same shape as a routine file (share.ts)
}

export type PostProductOut = {
  position: number
  product_id: number | null
  name: string // from the catalogue when product_id is set
  brand: string | null // null for a pasted list
  inci: string | null
}

export type AuthorRef = { handle: string; skin_type: SkinType | null }

export type ImageOut = {
  id: number
  url: string // "/blog/images/{id}", without the /api prefix (see imageSrc)
  width: number
  height: number
  caption: string | null
}

export type PostSummary = {
  cover: ImageOut | null // the first image
  id: number
  title: string
  excerpt: string // the first ≤ 200 characters of the body
  rating: number | null
  skin_type: SkinType | null
  disclosure: Disclosure
  author: AuthorRef
  products: PostProductOut[]
  like_count: number
  comment_count: number
  has_routine: boolean
  status: ContentStatus
  created_at: string
}

export type PostDetail = PostSummary & {
  body: string
  images: ImageOut[]
  routine: PortableRoutine | null
  flags: string[] // why it waits for review; only for the author, [] for everyone else
  liked: boolean
  saved: boolean
  is_mine: boolean
  updated_at: string
}

export type PostList = {
  items: PostSummary[]
  total: number
  rating_avg: number | null // over every visible post matching the filters that has a rating; rounded to 2
  rating_count: number
}
export type LikeOut = { liked: boolean; like_count: number }
export type SaveOut = { saved: boolean }
/** `parent_id`: reply to that comment of the same post; a reply to a reply joins the same top-level comment. */
export type CommentIn = { body: string; parent_id?: number | null } // body 1–2000

/** GET /blog/posts/{id}/comments: top-level comments, each with one level of `replies`. */
export type CommentOut = {
  id: number
  post_id: number
  parent_id: number | null // the top-level comment of a reply; null for a top-level comment
  reply_to_handle: string | null // a reply to a reply: that reply's author, shown as "@handle"
  author: AuthorRef | null // null when `deleted`
  body: string // "" when `deleted`
  status: ContentStatus // "visible" for a deleted frame
  flags: string[] // only on the user's own comments
  is_mine: boolean
  /** A top-level comment the user cannot see (deleted, waiting, hidden, removed) kept as an empty frame for its replies. */
  deleted: boolean
  like_count: number
  liked_by_me: boolean
  created_at: string
  replies: CommentOut[] // top-level comments only, oldest first; [] for a reply
}

/** GET /blog/trending: a catalogue product or an active group that ≥ 2 visible posts of the last days are about. */
export type TrendingItem = {
  kind: 'product' | 'group'
  product_id: number | null // kind "product"
  group: string | null // kind "group": the group code
  label_vi: string // the catalogue product name, or the group's Vietnamese name
  post_count: number
}

export type NoticeKind =
  | 'post_liked'
  | 'post_commented'
  | 'comment_replied'
  | 'comment_liked'
  | 'post_pending'
  | 'post_visible'
  | 'post_hidden'
  | 'post_removed'

/** In-app notifications (GET /me/activity). Only about posts and comments that are visible now. */
export type ActivityItem = {
  id: number
  kind: NoticeKind
  created_at: string
  read: boolean
  actor_handle: string | null // null for status notices, or when that user has no nickname
  post_id: number
  post_title: string
  comment_id: number | null // the new comment / reply, or the liked comment
  excerpt_vi: string | null // the first 80 characters of that comment, only while visible
}

export type ActivityOut = { unread_count: number; items: ActivityItem[] } // newest first
export type ActivityReadOut = { unread_count: number }

export type ReportIn = {
  target_kind: 'post' | 'comment'
  target_id: number
  reason: ReportReason
  note: string | null // ≤ 300
}

export type AuthorOut = {
  handle: string
  skin_type: SkinType | null
  post_count: number
  posts: PostSummary[] // visible only
}

export type PostQuery = {
  skin_type?: SkinType
  product_id?: number
  author?: string // handle
  saved?: boolean
  liked?: boolean // posts the user liked
  q?: string // 2–100 characters once normalized (else 422); best matches first, `sort` is ignored
  group?: string // a group code: posts with a catalogue product in that group (pasted lists not counted)
  sort?: 'new' | 'top'
  offset?: number
  limit?: number // ≤ 50
}

/** The review queue on #review (reviewer token). */
export type ModerationItem = {
  kind: 'post' | 'comment'
  id: number
  post_id: number
  title: string | null // null for a comment
  body: string
  author: string // handle
  status: ContentStatus
  flags: string[]
  report_count: number
  report_reasons: string[]
  report_notes: string[] // notes of the reports that count now
  images: { id: number; caption: string | null }[] // a post's photos; [] for a comment
  created_at: string
}

/** The address of an uploaded image for <img src>; the browser sends the session cookie. */
export const imageSrc = (image: ImageOut) => `/api${image.url}`

/** `token`: a reviewer's session, for the /review routes. */
async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const headers: Record<string, string> = {}
  // JSON bodies are strings; a FormData body (image upload) sets its own multipart type.
  if (typeof init?.body === 'string') headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`/api${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    // Not for a reviewer token or reviewer routes (#review), the sign-in routes (a wrong password is
    // a 401), or GET /me, which is how `useAccount` checks the session (it would ask itself forever).
    const method = init?.method ?? 'GET'
    const exempt = path.startsWith('/auth/') || path.startsWith('/review/') || (path === '/me' && method === 'GET')
    if (res.status === 401 && !token && !exempt) {
      window.dispatchEvent(new Event(SIGNED_OUT_EVENT))
    }
    const detail = typeof body?.detail === 'string' ? body.detail : res.statusText
    throw new ApiError(res.status, detail, body)
  }
  return (res.status === 204 ? undefined : res.json()) as Promise<T>
}

const send = <T>(method: 'PUT' | 'DELETE', path: string, body?: unknown) =>
  request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

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
  /** Public, for the landing page's demo; 429 when one address checks too often. */
  demoCheck: (body: DemoCheckRequest, signal?: AbortSignal) => post<RoutineCheckResponse>('/demo/check', body, signal),
  rules: (params: { kind?: Rule['kind']; groups?: string[] }) => {
    const query = new URLSearchParams()
    if (params.kind) query.set('kind', params.kind)
    for (const g of params.groups ?? []) query.append('groups', g)
    return request<RulesResponse>(`/rules?${query}`)
  },
  /** The same for everyone: the user's chosen goals stay in this browser and are never sent. */
  goals: () => request<GoalsResponse>('/goals'),
  /** 404 when the goal is unknown, is "all", or its article is not published. */
  goalArticle: (code: string) => request<GoalArticle>(`/goals/${encodeURIComponent(code)}/article`),
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
  // Community reviews.
  profile: () => request<Profile>('/me/profile'),
  saveProfile: (body: ProfileIn) => send<Profile>('PUT', '/me/profile', body),
  posts: (query: PostQuery, signal?: AbortSignal) => {
    const params = new URLSearchParams()
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined) params.set(name, String(value))
    }
    return request<PostList>(`/blog/posts?${params}`, { signal })
  },
  post: (id: number) => request<PostDetail>(`/blog/posts/${id}`),
  createPost: (body: PostIn) => post<PostDetail>('/blog/posts', body),
  updatePost: (id: number, body: PostIn) => send<PostDetail>('PUT', `/blog/posts/${id}`, body),
  deletePost: (id: number) => send<void>('DELETE', `/blog/posts/${id}`),
  like: (id: number, on: boolean) => send<LikeOut>(on ? 'PUT' : 'DELETE', `/blog/posts/${id}/like`),
  save: (id: number, on: boolean) => send<SaveOut>(on ? 'PUT' : 'DELETE', `/blog/posts/${id}/save`),
  comments: (postId: number) => request<CommentOut[]>(`/blog/posts/${postId}/comments`),
  addComment: (postId: number, body: CommentIn) => post<CommentOut>(`/blog/posts/${postId}/comments`, body),
  deleteComment: (id: number) => send<void>('DELETE', `/blog/comments/${id}`),
  report: (body: ReportIn) => post<Record<string, never>>('/blog/reports', body),
  /** 413 over 5 MB, 415 not JPEG / PNG / WebP, 409 at 60 photos, 429 too many uploads, 404 bad `replaces`. */
  uploadProductPhoto: (file: File, replaces?: number) => {
    const form = new FormData()
    form.append('file', file)
    if (replaces !== undefined) form.append('replaces', String(replaces))
    return request<ProductPhotoOut>('/me/product-photos', { method: 'POST', body: form })
  },
  deleteProductPhoto: (id: number) => send<void>('DELETE', `/me/product-photos/${id}`),
  uploadImage: (file: File, caption: string) => {
    const form = new FormData()
    form.append('file', file)
    if (caption) form.append('caption', caption)
    return request<ImageOut>('/blog/images', { method: 'POST', body: form })
  },
  author: (handle: string) => request<AuthorOut>(`/blog/authors/${encodeURIComponent(handle)}`),
  trending: (days = 7) => request<TrendingItem[]>(`/blog/trending?${new URLSearchParams({ days: String(days) })}`),
  likeComment: (id: number, on: boolean) => send<LikeOut>(on ? 'PUT' : 'DELETE', `/blog/comments/${id}/like`),
  activity: (limit = 30, signal?: AbortSignal) =>
    request<ActivityOut>(`/me/activity?${new URLSearchParams({ limit: String(limit) })}`, { signal }),
  /** `ids` left out: mark every notification read. */
  readActivity: (ids?: number[]) => post<ActivityReadOut>('/me/activity/read', ids ? { ids } : {}),
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
    blogQueue: (status: 'pending' | 'hidden') =>
      send<ModerationItem[]>('GET', `/review/blog?${new URLSearchParams({ status })}`),
    moderate: (kind: ModerationItem['kind'], id: number, action: 'approve' | 'remove') =>
      send<ModerationItem>('POST', `/review/blog/${kind}/${id}`, { action }),
    /** A post photo as a Blob: <img> cannot send the Bearer token, so the caller makes an object URL. */
    image: async (id: number, signal?: AbortSignal): Promise<Blob> => {
      const res = await fetch(`/api/review/blog/images/${id}`, { headers: { Authorization: `Bearer ${token}` }, signal })
      if (!res.ok) throw new ApiError(res.status, res.statusText)
      return res.blob()
    },
  }
}

export type ReviewApi = ReturnType<typeof reviewApi>
