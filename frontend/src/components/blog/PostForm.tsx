import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from 'react'
import { ApiError, api, type Disclosure, type PostDetail, type PostIn, type SkinType } from '../../api'
import { BODY_MAX, BODY_MIN, MAX_PRODUCTS, SESSION_EXPIRED, TITLE_MAX, TITLE_MIN, mayBeFlagged } from '../../blog'
import { DISCLOSURE_LABELS, SESSION_LABELS, SKIN_TYPE_LABELS } from '../../labels'
import { PROFILE_LOAD_ERROR, isProfileRequired, useProfile } from '../../profile'
import { ALL_POSTS, href, navigate } from '../../router'
import type { RoutineActions } from '../../routine'
import { statusOf, useLoad } from '../../useLoad'
import { toPortable, type PortableRoutine } from '../../share'
import { DataNote } from '../Notice'
import { clearDraft, loadDraft, saveDraft, type RoutineChoice } from './draft'
import { usePost } from './hooks'
import { ImageUploader } from './ImageUploader'
import { addFiles, fromExisting, uploadAll, type ImageItem } from './images'
import { pickedKey, toPostProduct, type Picked } from './picked'
import { PostMissing } from './PostPage'
import { ProductPicker } from './ProductPicker'
import { DemoFooter, LoadError, Loading, field, primary, secondary } from './parts'

/** #/blog/viet: a new post, optionally starting with one catalogue product (from a product page). */
export function WritePage({ actions, product, account }: { actions: RoutineActions; product: number | null; account: string }) {
  const { state, retry } = useLoad(product === null ? null : `product:${product}`, () => api.product(product ?? 0))
  // A product that did not load leaves the list empty; the form opens anyway (the draft keeps what was typed).
  const start: Picked[] | null =
    state.kind === 'loading'
      ? null
      : state.kind === 'ready'
        ? [{ key: pickedKey({ productId: state.value.id }), productId: state.value.id, name: state.value.name, brand: state.value.brand, groups: state.value.groups }]
        : []
  return (
    <div>
      <h1 className="text-2xl font-bold">Viết bài review</h1>
      {state.kind === 'error' && (
        <div className="mt-4">
          <LoadError onRetry={statusOf(state.error) === 404 ? undefined : retry}>
            Không tải được sản phẩm đã chọn; hãy tìm lại ở mục Sản phẩm trong bài.
          </LoadError>
        </div>
      )}
      <div className="mt-6">
        {start === null ? <Loading /> : <PostForm actions={actions} post={null} startProducts={start} account={account} />}
      </div>
      <DemoFooter />
    </div>
  )
}

/** #/blog/<id>/sua: the author edits their post. */
export function EditPage({ id, actions, account }: { id: number; actions: RoutineActions; account: string }) {
  const { state, retry } = usePost(id)
  return (
    <div>
      <h1 className="text-2xl font-bold">Sửa bài review</h1>
      <div className="mt-6">
        {state.kind === 'loading' && <Loading />}
        {state.kind === 'error' &&
          (statusOf(state.error) === 404 ? (
            <PostMissing />
          ) : (
            <LoadError onRetry={retry}>Không tải được bài viết.</LoadError>
          ))}
        {state.kind === 'ready' &&
          (state.value.is_mine ? (
            <PostForm actions={actions} post={state.value} startProducts={[]} account={account} />
          ) : (
            <p className="text-sm text-ink-soft">Bạn chỉ sửa được bài của chính mình.</p>
          ))}
      </div>
      <DemoFooter />
    </div>
  )
}

const routineSummary = (r: PortableRoutine) =>
  `${r.products.length} sản phẩm · ${(['AM', 'PM'] as const)
    .map((s) => `${SESSION_LABELS[s]}: ${r.entries.filter((e) => e.session === s).length} bước`)
    .join(' · ')}`

function pickedFromPost(post: PostDetail): Picked[] {
  return post.products.map((p) =>
    p.product_id !== null
      ? { key: pickedKey({ productId: p.product_id }), productId: p.product_id, name: p.name, brand: p.brand ?? '', groups: [] }
      : { key: pickedKey({ productId: null }), productId: null, name: p.name, inci: p.inci ?? '' },
  )
}

function PostForm({
  actions,
  post,
  startProducts,
  account,
}: {
  actions: RoutineActions
  post: PostDetail | null // null: a new post
  startProducts: Picked[]
  account: string
}) {
  const profile = useProfile()
  const profileSkin = profile.state.kind === 'ready' ? profile.state.profile.skin_type : null
  const postId = post?.id ?? null
  // What the form starts from without a draft: the post being edited, or an empty post.
  const [base] = useState(() => ({
    title: post?.title ?? '',
    body: post?.body ?? '',
    rating: post?.rating ?? null,
    skin: post ? post.skin_type : profileSkin,
    disclosure: post?.disclosure ?? ('none' as Disclosure),
    picked: post ? pickedFromPost(post) : startProducts,
    choice: (post?.routine ? 'kept' : 'none') as RoutineChoice,
  }))
  const [draft] = useState(() => {
    const found = loadDraft(postId, account)
    if (!found) return null
    // A product chosen on a product page joins the draft's products.
    const extra = startProducts.filter((p) => !found.picked.some((x) => x.key === p.key))
    return { ...found, picked: [...found.picked, ...extra].slice(0, MAX_PRODUCTS) }
  })
  const start = draft ?? base
  const [restored, setRestored] = useState(draft !== null)
  const [title, setTitle] = useState(start.title)
  const [body, setBody] = useState(start.body)
  const [rating, setRating] = useState<number | null>(start.rating)
  const [skin, setSkin] = useState<SkinType | null>(start.skin)
  const skinTouched = useRef(post !== null || draft !== null)
  const [disclosure, setDisclosure] = useState<Disclosure>(start.disclosure)
  const [picked, setPicked] = useState<Picked[]>(start.picked)
  const [images, setImages] = useState<ImageItem[]>(() => post?.images.map(fromExisting) ?? [])
  const [imageProblem, setImageProblem] = useState<string | null>(null)
  const [choice, setChoice] = useState<RoutineChoice>(start.choice === 'kept' && !post?.routine ? 'none' : start.choice)
  const [state, setState] = useState<{ kind: 'idle' | 'saving' } | { kind: 'error'; message: string }>({ kind: 'idle' })
  const saving = state.kind === 'saving'

  // A new post takes the skin type of the profile, once it has loaded, unless the user chose one.
  useEffect(() => {
    if (!skinTouched.current && profileSkin) setSkin(profileSkin)
  }, [profileSkin])

  // Keep what is typed in this tab until the post is saved (photos are not kept).
  const saved = useRef(false)
  useEffect(() => {
    if (saved.current) return
    const changed =
      title !== base.title ||
      body !== base.body ||
      rating !== base.rating ||
      disclosure !== base.disclosure ||
      choice !== base.choice ||
      JSON.stringify(picked) !== JSON.stringify(base.picked)
    if (changed) saveDraft(postId, { account, title, body, rating, skin, disclosure, picked, choice })
  }, [account, postId, base, title, body, rating, skin, disclosure, picked, choice])

  const discardDraft = () => {
    clearDraft(postId)
    setTitle(base.title)
    setBody(base.body)
    setRating(base.rating)
    setSkin(post ? base.skin : profileSkin)
    skinTouched.current = post !== null
    setDisclosure(base.disclosure)
    setPicked(base.picked)
    setChoice(base.choice)
    setRestored(false)
  }

  const current = actions.routine.products.length > 0 ? toPortable(actions.routine) : null
  const routine: PortableRoutine | null = choice === 'current' ? current : choice === 'kept' ? (post?.routine ?? null) : null

  const titleOk = title.trim().length >= TITLE_MIN && title.trim().length <= TITLE_MAX
  const bodyOk = body.trim().length >= BODY_MIN && body.trim().length <= BODY_MAX
  const productsOk = picked.length >= 1 && picked.length <= MAX_PRODUCTS
  const ready = titleOk && bodyOk && productsOk

  const onFiles = (files: File[]) => {
    const { added, problem } = addFiles(files, images)
    setImageProblem(problem)
    if (added.length) setImages((list) => [...list, ...added])
  }

  const onPaste = (e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'))
    if (files.length === 0 || saving) return // pasted text goes into the field as usual
    e.preventDefault()
    onFiles(files)
  }

  const fail = (message: string) => setState({ kind: 'error', message })

  const save = async (retried = false): Promise<void> => {
    const imageIds = await uploadAll(images, setImages)
    if (imageIds === null) return fail('Có ảnh chưa tải lên được. Hãy xoá ảnh đó hoặc thử lại.')
    if (imageIds === 'signed-out') return fail(SESSION_EXPIRED)
    const input: PostIn = {
      title: title.trim(),
      body: body.trim(),
      rating,
      skin_type: skin,
      disclosure,
      products: picked.map(toPostProduct),
      image_ids: imageIds,
      routine,
    }
    try {
      const result = post ? await api.updatePost(post.id, input) : await api.createPost(input)
      saved.current = true
      clearDraft(postId)
      navigate({ page: 'post', id: result.id }, { replace: true })
    } catch (e) {
      if (!post && isProfileRequired(e) && !retried) {
        const p = await profile.require(true)
        if (p === 'error') return fail(PROFILE_LOAD_ERROR)
        if (p?.handle) return save(true)
        return fail('Cần đặt biệt danh trước khi đăng bài.')
      }
      const status = e instanceof ApiError ? e.status : 0
      if (status === 401) return fail(SESSION_EXPIRED)
      if (status === 403) return fail('Bạn chỉ sửa được bài của chính mình.')
      if (status === 404) {
        return fail(post ? 'Bài viết không còn nữa, hoặc có sản phẩm không còn trong danh sách của SkinWise.' : 'Có sản phẩm không còn trong danh sách của SkinWise. Hãy bỏ sản phẩm đó rồi lưu lại.')
      }
      if (status === 422) {
        return fail('Không lưu được: có mục chưa hợp lệ. Hãy kiểm tra tiêu đề, nội dung, sản phẩm, ảnh và routine.')
      }
      fail('Không lưu được bài viết. Hãy thử lại.')
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!ready || saving) return
    setState({ kind: 'saving' })
    if (!post) {
      const p = await profile.require()
      if (p === 'error') return fail(PROFILE_LOAD_ERROR)
      if (!p?.handle) return fail('Cần đặt biệt danh trước khi đăng bài.')
    }
    await save()
    setState((s) => (s.kind === 'saving' ? { kind: 'idle' } : s))
  }

  return (
    <form onSubmit={(e) => void submit(e)} onPaste={onPaste} className="max-w-3xl space-y-6 text-sm">
      {restored && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface p-3 text-ink-soft ring-1 ring-line">
          <span className="flex-1">Đã mở lại bản nháp chưa đăng trên tab này (ảnh không được giữ).</span>
          <button type="button" onClick={discardDraft} className="text-link underline underline-offset-2">
            Bỏ bản nháp
          </button>
        </p>
      )}
      <label className="block">
        <span className="font-semibold text-ink">Tiêu đề</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TITLE_MAX}
          className={`mt-1 ${field}`}
          data-autofocus
        />
        <span className="mt-1 block text-xs text-ink-mute">
          {TITLE_MIN}–{TITLE_MAX} ký tự ({title.trim().length})
        </span>
      </label>

      <label className="block">
        <span className="font-semibold text-ink">Nội dung</span>
        <span className="mt-1 block text-xs leading-relaxed text-ink-soft">
          Hãy viết cảm nhận của bạn. Tránh nói sản phẩm "trị" hay "chữa" bệnh, và đừng ghi số điện thoại, email hay link.
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={BODY_MAX}
          rows={10}
          className={`mt-2 ${field} leading-relaxed`}
        />
        <span className="mt-1 block text-xs text-ink-mute">
          {BODY_MIN}–{BODY_MAX.toLocaleString('vi-VN')} ký tự ({body.trim().length.toLocaleString('vi-VN')}). Văn bản
          thuần: link không bấm được.
        </span>
      </label>
      {mayBeFlagged(`${title}\n${body}`) && (
        <DataNote title="Bài có thể phải chờ duyệt">
          Nội dung có vẻ có từ ngữ kiểu "trị", "chữa", số điện thoại, email hoặc link. Khi lưu, SkinWise kiểm tra lại; nếu
          đúng vậy, bài sẽ chờ người duyệt xem trước khi người khác thấy.
        </DataNote>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <fieldset>
          <legend className="font-semibold text-ink">Điểm (không bắt buộc)</legend>
          <div className="mt-1 flex items-center gap-0.5" role="radiogroup" aria-label="Điểm từ 1 đến 5 sao">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} sao`}
                onClick={() => setRating(rating === n ? null : n)}
                className={`rounded px-0.5 text-2xl leading-none ${rating !== null && n <= rating ? 'text-ink' : 'text-ink-mute/40 hover:text-ink-mute'}`}
              >
                ★
              </button>
            ))}
          </div>
          <span className="mt-1 block text-xs text-ink-mute">{rating === null ? 'Chưa chấm' : 'Bấm lại để bỏ điểm'}</span>
        </fieldset>
        <label className="block">
          <span className="font-semibold text-ink">Loại da của bạn</span>
          <select
            value={skin ?? ''}
            onChange={(e) => {
              skinTouched.current = true
              setSkin((e.target.value || null) as SkinType | null)
            }}
            className={`mt-1 ${field}`}
          >
            <option value="">Không ghi</option>
            {(Object.keys(SKIN_TYPE_LABELS) as SkinType[]).map((s) => (
              <option key={s} value={s}>
                {SKIN_TYPE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="font-semibold text-ink">Sản phẩm có được tặng?</span>
          <select value={disclosure} onChange={(e) => setDisclosure(e.target.value as Disclosure)} className={`mt-1 ${field}`}>
            {(Object.keys(DISCLOSURE_LABELS) as Disclosure[]).map((d) => (
              <option key={d} value={d}>
                {DISCLOSURE_LABELS[d]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset>
        <legend className="font-semibold text-ink">Sản phẩm trong bài (1–{MAX_PRODUCTS})</legend>
        <div className="mt-2">
          <ProductPicker picked={picked} setPicked={setPicked} myProducts={actions.routine.products} />
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-semibold text-ink">Routine</legend>
        <div className="mt-2 space-y-2 text-ink-soft">
          {post?.routine && (
            <label className="flex items-start gap-2.5">
              <input type="radio" name="routine" checked={choice === 'kept'} onChange={() => setChoice('kept')} className="mt-1 size-4 accent-ink" />
              <span>
                Giữ routine đang đính kèm
                <span className="block text-xs text-ink-mute">{routineSummary(post.routine)}</span>
              </span>
            </label>
          )}
          {post?.routine ? (
            <label className="flex items-start gap-2.5">
              <input
                type="radio"
                name="routine"
                checked={choice === 'current'}
                disabled={!current}
                onChange={() => setChoice('current')}
                className="mt-1 size-4 accent-ink"
              />
              <span>
                Thay bằng routine hiện tại của tôi
                <span className="block text-xs text-ink-mute">{current ? routineSummary(current) : 'Routine của bạn đang trống.'}</span>
              </span>
            </label>
          ) : (
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={choice === 'current'}
                disabled={!current}
                onChange={(e) => setChoice(e.target.checked ? 'current' : 'none')}
                className="mt-1 size-4 accent-ink"
              />
              <span>
                Đính kèm routine hiện tại
                <span className="block text-xs text-ink-mute">{current ? routineSummary(current) : 'Routine của bạn đang trống.'}</span>
              </span>
            </label>
          )}
          {post?.routine && (
            <label className="flex items-start gap-2.5">
              <input type="radio" name="routine" checked={choice === 'none'} onChange={() => setChoice('none')} className="mt-1 size-4 accent-ink" />
              Bỏ routine khỏi bài
            </label>
          )}
          <p className="text-xs leading-relaxed text-ink-mute">
            Người đọc thấy các sản phẩm, thứ tự bước và ngày dùng trong routine, kể cả bảng thành phần bạn tự dán, và có thể
            chép routine này về máy của họ. SkinWise sẽ kiểm tra kết hợp giữa các sản phẩm trong routine.
          </p>
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-semibold text-ink">Ảnh (không bắt buộc)</legend>
        <div className="mt-2">
          <ImageUploader items={images} setItems={setImages} problem={imageProblem} onFiles={onFiles} disabled={saving} />
        </div>
      </fieldset>

      <div className="space-y-2 border-t border-line pt-4">
        {!ready && (
          <p className="text-xs text-ink-mute">
            Cần tiêu đề {TITLE_MIN}–{TITLE_MAX} ký tự, nội dung ít nhất {BODY_MIN} ký tự và ít nhất một sản phẩm.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={!ready || saving} className={primary}>
            {saving ? 'Đang lưu…' : post ? 'Lưu thay đổi' : 'Đăng bài'}
          </button>
          <a href={post ? href({ page: 'post', id: post.id }) : href(ALL_POSTS)} className={secondary}>
            Huỷ
          </a>
        </div>
        <div aria-live="polite">{state.kind === 'error' && <p className="text-sm text-avoid-ink">{state.message}</p>}</div>
      </div>
    </form>
  )
}
