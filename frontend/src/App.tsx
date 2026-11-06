import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api, type CosmeticFunction, type Group, type Severity } from './api'
import { emailLink, useAccount } from './account'
import { AccountPanel, SyncConflict } from './components/AccountPanel'
import { AddProduct } from './components/AddProduct'
import { clearAllDrafts } from './components/blog/draft'
import { ProfileDialog } from './components/blog/ProfileDialog'
import { Dialog, DialogTitle } from './components/Dialog'
import { GoalsPage } from './components/GoalsPage'
import { Logo } from './components/Icons'
import { MyProducts } from './components/MyProducts'
import { MythPage } from './components/MythPage'
import { RoutineBoard } from './components/RoutineBoard'
import { ReplaceConfirm, ShareRoutine } from './components/ShareRoutine'
import { EmailLinkPage, SignIn } from './components/SignIn'
import { ProductDetailPage } from './components/ProductDetailPage'
import { TodayPage } from './components/TodayPage'
import { UndoRemove } from './components/UndoRemove'
import { SeverityCounts, WarningsPanel } from './components/WarningsPanel'
import { clearSelectedGoals } from './goals'
import { FunctionsContext, GroupsContext } from './groups'
import { FEEDBACK_URL, SEVERITY } from './labels'
import { ProfileContext, useProfileOwner } from './profile'
import { ALL_POSTS, href, isBlogPage, useRoute, type Route, type RoutineTab } from './router'
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
  type RemovedProduct,
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


// The review page has no nav entry for users; reviewers open #review.
const MENU: [Route, string, (route: Route) => boolean][] = [
  [{ page: 'routine', tab: 'today' }, 'Lịch dùng', (r) => r.page === 'routine' || r.page === 'shelf-product'],
  [{ page: 'goals' }, 'Mục tiêu', (r) => r.page === 'goals' || r.page === 'goal-article'],
  [{ page: 'myths' }, 'Đúng hay sai', (r) => r.page === 'myths'],
  [ALL_POSTS, 'Đánh giá', isBlogPage],
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
    case 'shelf-product':
      return `shelf-product:${route.key}`
    case 'routine':
      return `routine:${route.tab}`
    default:
      return route.page
  }
}

const SEVERITY_RANK = Object.keys(SEVERITY) as Severity[] // most severe first

function App() {
  const route = useRoute()
  const page = route.page
  const [adding, setAdding] = useState(false)
  // The last removed product, offered for "Hoàn tác" for a few seconds (shelf and product page).
  const [removed, setRemoved] = useState<RemovedProduct | null>(null)
  const expireRemoved = useCallback(() => setRemoved(null), [])
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
  // A removal belongs to the account that made it: signed out or another account, no "Hoàn tác".
  const [removedFor, setRemovedFor] = useState(me?.email ?? null)
  if (removedFor !== (me?.email ?? null)) {
    setRemovedFor(me?.email ?? null)
    setRemoved(null)
  }
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
    setRemoved(null) // nor undo a removal of the previous account
    clearAllDrafts() // nor unsent posts
  }

  useEffect(() => {
    const onHash = () => setLink(emailLink(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // A new page (or tab of "Lịch dùng") starts at the top.
  const currentPage = pageKey(route)
  const shownPage = useRef(currentPage)
  useEffect(() => {
    if (shownPage.current === currentPage) return
    shownPage.current = currentPage
    window.scrollTo(0, 0)
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
          {/* Phones: logo and account on top, the four pages in a tab bar at the bottom of the screen.
              From 1024px: one bar on top with the logo, the pages and the account. */}
          <header className="border-b border-line bg-surface">
            <div className="mx-auto flex min-h-16 max-w-[75rem] items-center gap-6 px-4 sm:px-6 lg:min-h-20 lg:px-10 lg:gap-8 xl:gap-14">
              <a href={href({ page: 'routine', tab: 'today' })} className="inline-flex shrink-0 rounded-md">
                <Logo className="h-10 w-auto lg:h-13" />
              </a>
              <nav className="hidden flex-1 gap-2 lg:flex" aria-label="Điều hướng chính">
                {MENU.map(([target, label, isCurrent]) => (
                  <a
                    key={label}
                    href={href(target)}
                    aria-current={isCurrent(route) ? 'page' : undefined}
                    className={`inline-flex min-h-11.5 items-center rounded-full px-5.5 text-[1.0625rem] whitespace-nowrap ${isCurrent(route) ? 'bg-primary font-semibold text-surface' : 'text-ink-soft hover:bg-thistle/25 hover:text-ink'}`}
                  >
                    {label}
                  </a>
                ))}
              </nav>
              {me && (
                <AccountButton
                  email={me.email}
                  status={accountOffline ? 'Mất kết nối, sẽ thử lại' : (syncLabel(sync.state) ?? null)}
                  warn={conflict !== null || sync.state.kind === 'offline' || accountOffline}
                  onClick={() => (conflict ? setHiddenConflict(null) : setAccountOpen(true))}
                />
              )}
            </div>
          </header>

          <nav
            className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
            aria-label="Điều hướng chính"
          >
            {MENU.map(([target, label, isCurrent]) => (
              <a
                key={label}
                href={href(target)}
                aria-current={isCurrent(route) ? 'page' : undefined}
                className={`flex min-h-14 items-center justify-center px-1 text-center text-xs leading-tight ${isCurrent(route) ? 'font-semibold text-primary' : 'text-ink-soft hover:text-ink'}`}
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="mx-auto max-w-[75rem] px-4 pt-3 sm:px-6">
            <p className="max-w-2xl text-xs leading-relaxed text-ink-soft">
              SkinWise là công cụ nhắc nhở và giáo dục, không thay thế tư vấn của bác sĩ da liễu hay dược sĩ. Nếu bạn
              đang mang thai, đang điều trị bệnh da hoặc dùng thuốc kê đơn, hãy hỏi ý kiến chuyên gia.
            </p>
          </div>

          {passwordReset && (
            <div className="mx-auto max-w-[75rem] px-4 pt-3 sm:px-6">
              <p className="flex max-w-2xl items-start gap-3 rounded-md bg-surface p-3 text-sm leading-relaxed text-ink-soft ring-1 ring-line">
                <span className="flex-1">Đã đặt mật khẩu mới. Các thiết bị khác đã được đăng xuất.</span>
                <button onClick={() => setPasswordReset(false)} className="shrink-0 text-link underline underline-offset-2">
                  Đóng
                </button>
              </p>
            </div>
          )}

          <main className="mx-auto max-w-[75rem] px-4 pt-6 pb-24 sm:px-6 lg:pb-12">
            <Suspense fallback={<p className="text-sm text-ink-mute">Đang tải…</p>}>
            {route.page === 'shelf-product' ? (
              <>
                <RoutineTabs tab="shelf" check={check} />
                <div className="mt-6 lg:mt-8">
                  <ProductDetailPage
                    key={route.key}
                    productKey={route.key}
                    actions={actions}
                    found={found}
                    check={check}
                    onRemove={(key) => setRemoved(actions.removeProduct(key))}
                  />
                </div>
              </>
            ) : route.page === 'routine' ? (
              <>
                <RoutineTabs tab={route.tab} check={check} />
                <div className="mt-6 lg:mt-8">
                  {route.tab === 'today' ? (
                    <TodayPage actions={actions} check={check} />
                  ) : route.tab === 'week' ? (
                    <RoutineBoard
                      actions={actions}
                      flagged={flagged}
                      found={found}
                      check={check}
                      onShare={() => setSharing(true)}
                    />
                  ) : route.tab === 'shelf' ? (
                    <MyProducts
                      actions={actions}
                      found={found}
                      flagged={flagged}
                      check={check}
                      onAdd={() => setAdding(true)}
                      onRemove={(key) => setRemoved(actions.removeProduct(key))}
                    />
                  ) : (
                    <WarningsPanel state={check} products={actions.routine.products} found={found} page />
                  )}
                </div>
                {(route.tab === 'week' || route.tab === 'shelf') && <ResultsBar check={check} />}
              </>
            ) : page === 'goals' ? (
              <GoalsPage routine={actions.routine} found={found} />
            ) : route.page === 'goal-article' ? (
              <GoalArticlePage key={route.code} code={route.code} />
            ) : page === 'myths' ? (
              <div className="mx-auto max-w-[47.5rem]">
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
                <a href={href({ page: 'routine', tab: 'today' })} className="text-link underline underline-offset-2">
                  Về lịch dùng
                </a>
              </div>
            )}
            </Suspense>
          </main>

          <footer className="mx-auto max-w-[75rem] border-t border-line px-4 pt-6 pb-[calc(5rem+env(safe-area-inset-bottom))] text-xs leading-relaxed text-ink-mute sm:px-6 lg:pb-8">
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
          title={<DialogTitle>Thêm sản phẩm</DialogTitle>}
        >
          <AddProduct actions={actions} draft={addDraft} setDraft={setAddDraft} />
        </Dialog>

        {me && (
          <Dialog open={accountOpen} onClose={() => setAccountOpen(false)} title={<DialogTitle>Tài khoản</DialogTitle>}>
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
          title={<DialogTitle>Routine đã đổi trên thiết bị khác</DialogTitle>}
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
          title={<DialogTitle>Lưu & chia sẻ routine</DialogTitle>}
        >
          <ShareRoutine actions={actions} onDone={() => setSharing(false)} />
        </Dialog>

        <Dialog
          open={incoming !== null}
          onClose={dismiss}
          title={<DialogTitle>Routine được chia sẻ với bạn</DialogTitle>}
        >
          {incoming?.kind === 'loading' && <p className="text-sm text-ink-mute">Đang mở routine…</p>}
          {incoming?.kind === 'error' && (
            <div className="text-sm text-avoid-ink">
              <p>{incoming.message}</p>
              <button
                onClick={retryIncoming}
                className="mt-2 min-h-10 rounded-full bg-surface px-4 font-medium text-avoid-ink ring-1 ring-avoid/40 hover:bg-neutral"
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
        <UndoRemove
          removed={removed}
          onUndo={(r) => {
            actions.restoreProduct(r)
            setRemoved(null)
          }}
          onExpire={expireRemoved}
        />
      </ProfileContext>
      </FunctionsContext>
    </GroupsContext>
  )
}

/**
 * The round account button. The sync state stays visible: as text from 1280px, as a dot on the
 * button and in its name on phones, so a conflict or a failed save is never hidden.
 */
function AccountButton({
  email,
  status,
  warn,
  onClick,
}: {
  email: string
  status: string | null
  warn: boolean
  onClick: () => void
}) {
  const name = status ? `Tài khoản ${email}, ${status.toLowerCase()}` : `Tài khoản ${email}`
  return (
    <button
      onClick={onClick}
      aria-label={name}
      title={name}
      className="ml-auto flex min-h-11 min-w-0 items-center gap-3 rounded-full xl:pl-1"
    >
      <span className="hidden min-w-0 flex-col items-end text-right xl:flex" aria-hidden="true">
        <span className="max-w-[16rem] truncate text-sm font-medium">{email}</span>
        <span className={`text-xs ${warn ? 'text-caution-ink' : 'text-ink-mute'}`}>{status ?? 'Tài khoản'}</span>
      </span>
      <span
        aria-hidden="true"
        className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-thistle text-sm font-semibold text-thistle-ink lg:size-12 lg:text-base"
      >
        {initial(email)}
        {warn && (
          <span className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full bg-caution ring-2 ring-surface" />
        )}
      </span>
    </button>
  )
}

/** First letter of the address, for the round account button. */
function initial(email: string): string {
  return (Array.from(email.trim())[0] ?? '?').toLocaleUpperCase('vi')
}

const TABS: [RoutineTab, string][] = [
  ['today', 'Hôm nay'],
  ['week', 'Lịch tuần'],
  ['shelf', 'Tủ đồ'],
  ['check', 'Kiểm tra'],
]

/**
 * The four tabs of "Lịch dùng". "Kiểm tra" carries the number of combination warnings from the
 * last check (usage notes are not warnings).
 */
function RoutineTabs({ tab, check }: { tab: RoutineTab; check: CheckState }) {
  const result = currentResult(check)
  const warnings = result ? result.warnings.filter((w) => !isUsageNote(w)).length : 0
  return (
    <nav aria-label="Lịch dùng">
      <div className="grid grid-cols-4 gap-1 rounded-md border border-line bg-surface p-1 lg:inline-flex lg:rounded-full">
        {TABS.map(([value, label]) => {
          const on = tab === value
          return (
            <a
              key={value}
              href={href({ page: 'routine', tab: value })}
              aria-current={on ? 'page' : undefined}
              className={`flex min-h-11 items-center justify-center rounded-sm px-1 text-center text-xs font-semibold whitespace-nowrap lg:min-h-10 lg:rounded-full lg:px-5 lg:text-sm ${
                on
                  ? 'bg-primary text-surface lg:bg-thistle/40 lg:text-primary'
                  : 'text-ink-soft hover:bg-thistle/25 hover:text-ink'
              }`}
            >
              {label}
              {value === 'check' && warnings > 0 && <span className="ml-1 tabular-nums"> · {warnings}</span>}
            </a>
          )
        })}
      </div>
    </nav>
  )
}

/**
 * Phones, on the week and shelf tabs: how many warnings the schedule has, above the tab bar, with
 * the way to the check tab. Silence reads as "safe", so even the empty line says what it does not mean.
 */
function ResultsBar({ check }: { check: CheckState }) {
  const result = currentResult(check)
  const warnings = result?.warnings ?? []
  if (check.kind === 'empty') return null
  return (
    <a
      href={href({ page: 'routine', tab: 'check' })}
      className="dusk-panel fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 rounded-md bg-dusk py-2.5 pr-4 pl-3 text-sm text-on-dusk shadow-float lg:hidden"
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
          'Chưa có cảnh báo, không có nghĩa là chắc chắn an toàn'
        )}
      </span>
      <span className="shrink-0 font-semibold text-thistle">Xem kết quả</span>
    </a>
  )
}

export default App
