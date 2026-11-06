import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiError, api, type CosmeticFunction, type Group, type Severity } from './api'
import { emailLink, useAccount } from './account'
import { AccountPanel, SyncConflict } from './components/AccountPanel'
import { AddProduct } from './components/AddProduct'
import { clearAllDrafts } from './components/blog/draft'
import { ProfileDialog } from './components/blog/ProfileDialog'
import { Dialog } from './components/Dialog'
import { GoalsPage } from './components/GoalsPage'
import { Mark } from './components/Icons'
import { MyProducts } from './components/MyProducts'
import { MythPage } from './components/MythPage'
import { RoutineBoard } from './components/RoutineBoard'
import { ReplaceConfirm, ShareRoutine } from './components/ShareRoutine'
import { EmailLinkPage, SignIn } from './components/SignIn'
import { SeverityCounts, WarningsPanel } from './components/WarningsPanel'
import { clearSelectedGoals } from './goals'
import { FunctionsContext, GroupsContext } from './groups'
import { SEVERITY } from './labels'
import { ProfileContext, useProfileOwner } from './profile'
import { ALL_POSTS, href, isBlogPage, useRoute, type Route } from './router'
import { useIncomingRoutine } from './share'
import { syncLabel, useRoutineSync, type ServerCopy } from './sync'
import {
  EMPTY_ADD_DRAFT,
  currentResult,
  isUsageNote,
  labelGroups,
  useRoutine,
  useRoutineCheck,
  type CheckState,
} from './routine'

// Pages most visits never open load on demand, so the routine page downloads less.
const ReviewPage = lazy(() => import('./components/ReviewPage').then((m) => ({ default: m.ReviewPage })))
const BlogListPage = lazy(() => import('./components/blog/BlogList').then((m) => ({ default: m.BlogListPage })))
const SavedPage = lazy(() => import('./components/blog/BlogList').then((m) => ({ default: m.SavedPage })))
const WritePage = lazy(() => import('./components/blog/PostForm').then((m) => ({ default: m.WritePage })))
const EditPage = lazy(() => import('./components/blog/PostForm').then((m) => ({ default: m.EditPage })))
const PostPage = lazy(() => import('./components/blog/PostPage').then((m) => ({ default: m.PostPage })))
const ProductPage = lazy(() => import('./components/blog/ProductPage').then((m) => ({ default: m.ProductPage })))
const GoalArticlePage = lazy(() =>
  import('./components/GoalArticlePage').then((m) => ({ default: m.GoalArticlePage })),
)
const AuthorPage = lazy(() => import('./components/blog/AuthorPage').then((m) => ({ default: m.AuthorPage })))

// Feedback goes to GitHub, not a form on SkinWise: nothing to store or moderate here
// (the in-app question form was dropped on 27/10, plan/decisions.md).
const FEEDBACK_URL = 'https://github.com/Nha-Cong-Dong/SkinWise/issues/new'

// The review page has no nav entry for users; reviewers open #review.
const MENU: [Route, string, (route: Route) => boolean][] = [
  [{ page: 'routine' }, 'Routine của tôi', (r) => r.page === 'routine'],
  [{ page: 'goals' }, 'Mục tiêu', (r) => r.page === 'goals' || r.page === 'goal-article'],
  [{ page: 'myths' }, 'Sự thật hay myth', (r) => r.page === 'myths'],
  [ALL_POSTS, 'Review cộng đồng', isBlogPage],
]

/** A key per page, to scroll to the top when the page changes (not on a filter change). */
function pageKey(route: Route): string {
  switch (route.page) {
    case 'post':
    case 'edit':
    case 'product':
      return `${route.page}:${route.id}`
    case 'author':
      return `author:${route.handle}`
    case 'goal-article':
      return `goal-article:${route.code}`
    default:
      return route.page
  }
}

const SEVERITY_RANK = Object.keys(SEVERITY) as Severity[] // most severe first

function App() {
  const route = useRoute()
  const page = route.page
  const [adding, setAdding] = useState(false)
  const [addDraft, setAddDraft] = useState(EMPTY_ADD_DRAFT) // outlives the dialog's content
  const [sharing, setSharing] = useState(false)
  const [groups, setGroups] = useState<Map<string, Group>>(new Map())
  const [functions, setFunctions] = useState<Map<string, CosmeticFunction>>(new Map())
  const actions = useRoutine()
  // Signing in is required (plan/h-accounts.md); the review page has its own sign-in.
  const account = useAccount()
  const me = account.state.kind === 'signed-in' ? account.state.me : null
  // Both need a session: nothing is sent from the sign-in form or #review.
  const check = useRoutineCheck(actions.routine, page === 'review' ? null : (me?.email ?? null))
  const { incoming, retry: retryIncoming, dismiss } = useIncomingRoutine(me !== null) // a shared routine link was opened
  const accountOffline = account.state.kind === 'signed-in' && account.state.offline === true
  const sync = useRoutineSync(actions, me?.email ?? null)
  const profile = useProfileOwner(me?.email ?? null)
  const [accountOpen, setAccountOpen] = useState(false)
  const conflict = sync.state.kind === 'conflict' ? sync.state.server : null
  // The conflict the user closed without choosing; a new conflict opens the dialog again.
  const [hiddenConflict, setHiddenConflict] = useState<ServerCopy | null>(null)
  // A #verify-email or #reset-password link opened in this tab; it acts only on a click.
  const [link, setLink] = useState(() => emailLink(window.location.hash))
  const [passwordReset, setPasswordReset] = useState(false) // show the "new password" line once

  const leaveLink = () => {
    history.replaceState(null, '', window.location.pathname) // the token must not stay in the address
    setLink(null)
  }

  // Before a link signs this tab in: the current account's unsent routine goes to the server first.
  const beforeLinkSignIn = async () =>
    !me ||
    (await sync.flush()) ||
    confirm('Routine trên thiết bị này chưa lưu lên máy chủ được (mất kết nối). Tiếp tục bây giờ sẽ mất các thay đổi đó. Vẫn tiếp tục?')

  /** Null once signed out; otherwise what to tell the user. */
  const signOut = async (everywhere: boolean): Promise<string | null> => {
    const sent = await sync.flush()
    if (
      !sent &&
      !confirm('Routine trên thiết bị này chưa lưu lên máy chủ được (mất kết nối). Đăng xuất bây giờ sẽ mất các thay đổi đó. Vẫn đăng xuất?')
    ) {
      return null
    }
    try {
      await (everywhere ? api.signOutEverywhere() : api.signOut())
    } catch (e) {
      // 401: the session had already ended. Anything else: the cookie may still be valid, so this
      // device stays signed in and keeps the routine until the server confirms.
      if (!(e instanceof ApiError && e.status === 401)) return 'Chưa đăng xuất được (mất kết nối). Hãy thử lại.'
    }
    forgetDevice()
    setPasswordReset(false)
    setAccountOpen(false)
    void account.refresh()
    return null
  }

  /** Signed out or account deleted: the next person on this device must not get this routine or draft. */
  const forgetDevice = () => {
    sync.forget()
    clearSelectedGoals() // the next person on this device must not get these goals
    setAddDraft(EMPTY_ADD_DRAFT) // the label photo and the list being typed
    setAdding(false)
    clearAllDrafts() // nor unsent posts
  }

  useEffect(() => {
    const onHash = () => setLink(emailLink(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // A new page starts at the top; "#results" (an anchor on the routine page) scrolls by itself.
  const currentPage = pageKey(route)
  const shownPage = useRef(currentPage)
  useEffect(() => {
    if (shownPage.current === currentPage) return
    shownPage.current = currentPage
    if (window.location.hash !== '#results') window.scrollTo(0, 0)
  }, [currentPage])

  useEffect(() => {
    api.groups().then(
      (list) => setGroups(new Map(list.map((g) => [g.code, g]))),
      () => {}, // chips fall back to group codes
    )
    api.functions().then(
      (list) => setFunctions(new Map(list.map((f) => [f.code, f]))),
      () => {}, // ingredient lists fall back to function codes
    )
  }, [])

  // Most severe combination warning per product; keeps the previous result while a new check runs.
  const flagged = new Map<string, Severity>()
  for (const w of (currentResult(check)?.warnings ?? []).filter((w) => !isUsageNote(w))) {
    for (const key of w.product_keys) {
      const current = flagged.get(key)
      if (!current || SEVERITY_RANK.indexOf(w.rule.severity) < SEVERITY_RANK.indexOf(current)) {
        flagged.set(key, w.rule.severity)
      }
    }
  }

  const found = labelGroups(check) // which label line put each product in each group

  if (page !== 'review' && link && account.state.kind !== 'checking') {
    return (
      <EmailLinkPage
        key={link.token}
        link={link}
        signedInAs={me?.email ?? null}
        beforeSignIn={beforeLinkSignIn}
        onSignedIn={(signedIn) => {
          if (link.kind === 'reset-password') setPasswordReset(true)
          leaveLink()
          account.signedIn(signedIn)
        }}
        onLeave={leaveLink}
      />
    )
  }

  if (page !== 'review' && !me) {
    if (account.state.kind === 'signed-out') return <SignIn onSignedIn={account.signedIn} />
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-sm text-ink-mute">
        {account.state.kind === 'unreachable' ? (
          <p>
            Không kết nối được máy chủ SkinWise.{' '}
            <button onClick={() => void account.refresh()} className="text-link underline underline-offset-2">
              Thử lại
            </button>
          </p>
        ) : (
          <p>Đang tải…</p>
        )}
      </div>
    )
  }

  return (
    <GroupsContext value={groups}>
      <FunctionsContext value={functions}>
      <ProfileContext value={profile.value}>
        <div className="min-h-screen">
          <header className="bg-surface ring-1 ring-line">
            {/* Small screens: logo and account on one row, the menu below. Wide screens: one row. */}
            <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6 lg:flex-nowrap">
              <div className="flex shrink-0 items-center gap-2.5">
                <Mark className="size-8" />
                <span className="text-xl leading-none font-bold tracking-tight">SkinWise</span>
              </div>
              <nav
                className="order-last flex w-full flex-wrap gap-1 text-sm sm:text-[0.9375rem] lg:order-none lg:w-auto"
                aria-label="Trang"
              >
                {MENU.map(([target, label, isCurrent]) => (
                  <a
                    key={label}
                    href={href(target)}
                    aria-current={isCurrent(route) ? 'page' : undefined}
                    className={`rounded-full px-3 py-1.5 whitespace-nowrap sm:px-3.5 ${isCurrent(route) ? 'bg-ink font-medium text-white' : 'text-ink-soft hover:bg-paper hover:text-ink'}`}
                  >
                    {label}
                  </a>
                ))}
              </nav>
              {me && (
                <button
                  onClick={() => (conflict ? setHiddenConflict(null) : setAccountOpen(true))}
                  className="ml-auto flex min-w-0 flex-col items-end rounded-xl px-2 py-1 text-right hover:bg-paper"
                  title="Tài khoản"
                >
                  <span className="max-w-[11rem] truncate text-sm font-medium sm:max-w-[16rem]">{me.email}</span>
                  <span className={`text-xs ${conflict || sync.state.kind === 'offline' || accountOffline ? 'text-caution-ink' : 'text-ink-mute'}`}>
                    {accountOffline ? 'Mất kết nối, sẽ thử lại' : (syncLabel(sync.state) ?? 'Tài khoản')}
                  </span>
                </button>
              )}
            </div>
          </header>

          <div className="mx-auto max-w-[90rem] px-4 pt-3 sm:px-6">
            <p className="max-w-2xl text-xs leading-relaxed text-ink-soft">
              SkinWise là công cụ nhắc nhở và giáo dục, không thay thế tư vấn của bác sĩ da liễu hay dược sĩ. Nếu bạn
              đang mang thai, đang điều trị bệnh da hoặc dùng thuốc kê đơn, hãy hỏi ý kiến chuyên gia.
            </p>
          </div>

          {passwordReset && (
            <div className="mx-auto max-w-[90rem] px-4 pt-3 sm:px-6">
              <p className="flex max-w-2xl items-start gap-3 rounded-xl bg-surface p-3 text-sm leading-relaxed text-ink-soft ring-1 ring-line">
                <span className="flex-1">Đã đặt mật khẩu mới. Các thiết bị khác đã được đăng xuất.</span>
                <button onClick={() => setPasswordReset(false)} className="shrink-0 text-link underline underline-offset-2">
                  Đóng
                </button>
              </p>
            </div>
          )}

          <main className="mx-auto max-w-[90rem] px-4 pt-6 pb-24 sm:px-6 lg:pb-12">
            <Suspense fallback={<p className="text-sm text-ink-mute">Đang tải…</p>}>
            {page === 'routine' ? (
              <>
              {/* The three columns have their own headings; the page needs one above them. */}
              <h1 className="sr-only">Routine của tôi</h1>
              <div className="grid gap-x-6 gap-y-10 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[18.5rem_minmax(0,1fr)_23rem]">
                {/* The three columns have visible h2 titles; the page title is for screen readers. */}
                <h1 className="sr-only">Routine của tôi</h1>
                <div className="lg:col-start-1 lg:row-start-1">
                  <MyProducts actions={actions} found={found} onAdd={() => setAdding(true)} />
                </div>
                <div className="lg:col-start-1 lg:row-start-2 xl:col-start-2 xl:row-start-1">
                  <RoutineBoard actions={actions} flagged={flagged} found={found} onShare={() => setSharing(true)} />
                </div>
                <ResultsAside check={check}>
                  <WarningsPanel state={check} products={actions.routine.products} found={found} />
                </ResultsAside>
              </div>
              </>
            ) : page === 'goals' ? (
              <div className="mx-auto max-w-3xl">
                <GoalsPage routine={actions.routine} found={found} />
              </div>
            ) : route.page === 'goal-article' ? (
              <div className="mx-auto max-w-3xl">
                <GoalArticlePage key={route.code} code={route.code} />
              </div>
            ) : page === 'myths' ? (
              <div className="mx-auto max-w-2xl">
                <MythPage />
              </div>
            ) : page === 'review' ? (
              <div className="mx-auto max-w-4xl">
                <h1 className="sr-only">Trang duyệt</h1>
                <Suspense fallback={<p className="text-sm text-ink-mute">Đang tải trang duyệt…</p>}>
                  <ReviewPage />
                </Suspense>
              </div>
            ) : route.page === 'blog' ? (
              <div className="mx-auto max-w-6xl">
                <BlogListPage filter={route.filter} />
              </div>
            ) : route.page === 'saved' ? (
              <div className="mx-auto max-w-6xl">
                <SavedPage />
              </div>
            ) : route.page === 'write' ? (
              <div className="mx-auto max-w-3xl">
                <WritePage key={route.product ?? 'new'} actions={actions} product={route.product} account={me?.email ?? ''} />
              </div>
            ) : route.page === 'edit' ? (
              <div className="mx-auto max-w-3xl">
                <EditPage key={route.id} id={route.id} actions={actions} account={me?.email ?? ''} />
              </div>
            ) : route.page === 'post' ? (
              <div className="mx-auto max-w-3xl">
                <PostPage key={route.id} id={route.id} actions={actions} />
              </div>
            ) : route.page === 'product' ? (
              <div className="mx-auto max-w-6xl">
                <ProductPage key={route.id} id={route.id} />
              </div>
            ) : route.page === 'author' ? (
              <div className="mx-auto max-w-6xl">
                <AuthorPage key={route.handle} handle={route.handle} />
              </div>
            ) : (
              <div className="mx-auto max-w-2xl space-y-3 text-sm text-ink-soft">
                <p>Không tìm thấy trang này.</p>
                <a href={href({ page: 'routine' })} className="text-link underline underline-offset-2">
                  Về routine của tôi
                </a>
              </div>
            )}
            </Suspense>
          </main>

          <footer className="mx-auto max-w-[90rem] border-t border-line px-4 py-6 text-xs leading-relaxed text-ink-mute sm:px-6">
            <p>
              Cảnh báo chỉ đến từ các luật đã được người duyệt đối chiếu với nguồn. Routine được lưu trên trình duyệt này và
              đồng bộ với tài khoản SkinWise của bạn.
            </p>
            <p className="mt-2">
              Góp ý hoặc báo lỗi:{' '}
              <a
                href={FEEDBACK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-link underline underline-offset-2"
              >
                mở một issue trên GitHub
              </a>{' '}
              (cần tài khoản GitHub; nội dung hiện công khai, đừng ghi email, số điện thoại hay ảnh da của bạn).
            </p>
          </footer>
        </div>

        <Dialog
          open={adding}
          onClose={() => setAdding(false)}
          title={<h2 className="text-xl font-bold">Thêm sản phẩm</h2>}
        >
          <AddProduct actions={actions} draft={addDraft} setDraft={setAddDraft} />
        </Dialog>

        {me && (
          <Dialog open={accountOpen} onClose={() => setAccountOpen(false)} title={<h2 className="text-xl font-bold">Tài khoản</h2>}>
            <AccountPanel
              me={me}
              sync={sync.state}
              onSignOut={signOut}
              onDeleted={() => {
                forgetDevice()
                setAccountOpen(false)
                void account.refresh()
              }}
            />
          </Dialog>
        )}

        <Dialog
          open={conflict !== null && conflict !== hiddenConflict}
          onClose={() => setHiddenConflict(conflict)}
          title={<h2 className="text-xl font-bold">Routine đã đổi trên thiết bị khác</h2>}
        >
          {conflict && (
            <SyncConflict
              local={actions.routine}
              server={conflict}
              onKeepThisDevice={sync.keepThisDevice}
              onUseSynced={sync.useSynced}
            />
          )}
        </Dialog>

        <Dialog
          open={sharing}
          onClose={() => setSharing(false)}
          title={<h2 className="text-xl font-bold">Lưu & chia sẻ routine</h2>}
        >
          <ShareRoutine actions={actions} onDone={() => setSharing(false)} />
        </Dialog>

        <Dialog
          open={incoming !== null}
          onClose={dismiss}
          title={<h2 className="text-xl font-bold">Routine được chia sẻ với bạn</h2>}
        >
          {incoming?.kind === 'loading' && <p className="text-sm text-ink-mute">Đang mở routine…</p>}
          {incoming?.kind === 'error' && (
            <div className="text-sm text-avoid-ink">
              <p>{incoming.message}</p>
              <button
                onClick={retryIncoming}
                className="mt-2 min-h-10 rounded-full bg-surface px-4 font-medium text-avoid-ink ring-1 ring-avoid/40 hover:bg-white"
              >
                Thử lại
              </button>
            </div>
          )}
          {incoming?.kind === 'ready' && (
            <ReplaceConfirm
              incoming={incoming}
              current={actions.routine}
              onAccept={() => {
                actions.replace(incoming.routine)
                dismiss()
              }}
              onCancel={dismiss}
            />
          )}
        </Dialog>
        <ProfileDialog {...profile.dialog} />
      </ProfileContext>
      </FunctionsContext>
    </GroupsContext>
  )
}

/**
 * The check results: a sticky column on wide screens. On narrow screens they come after the
 * schedule, so a bar at the bottom of the screen says how many warnings there are until the
 * results scroll into view.
 */
function ResultsAside({ check, children }: { check: CheckState; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const result = currentResult(check)
  const warnings = result?.warnings ?? []

  return (
    <>
      <aside
        ref={ref}
        id="results"
        className="scroll-mt-4 lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain xl:col-start-3 xl:row-span-1"
      >
        {children}
      </aside>
      {check.kind !== 'empty' && !inView && (
        <a
          href="#results"
          className="fixed inset-x-3 bottom-3 z-20 flex items-center gap-3 rounded-2xl bg-night py-2.5 pr-4 pl-3 text-sm text-night-text shadow-xl shadow-ink/30 lg:hidden"
        >
          <span className="min-w-0 flex-1">
            {warnings.some((w) => !isUsageNote(w)) ? (
              <SeverityCounts warnings={warnings} />
            ) : check.kind === 'error' ? (
              'Không kiểm tra được routine'
            ) : check.kind === 'loading' && !result ? (
              'Đang kiểm tra…'
            ) : warnings.length > 0 ? (
              // Only usage notes: about the combinations, the result is still empty.
              `Chưa có cảnh báo kết hợp, không có nghĩa là chắc chắn an toàn · ${warnings.length} lưu ý khi dùng`
            ) : (
              // Silence reads as "safe", so even this short line says what it does not mean.
              'Chưa có cảnh báo, không có nghĩa là chắc chắn an toàn'
            )}
          </span>
          <span className="shrink-0 font-semibold text-moon">Xem kết quả</span>
        </a>
      )}
    </>
  )
}

export default App
