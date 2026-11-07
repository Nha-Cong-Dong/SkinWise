import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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
import { ThemeSwitch } from './components/ThemeSwitch'
import { TodayPage } from './components/TodayPage'
import { UndoRemove } from './components/UndoRemove'
import { SeverityCounts, WarningsPanel } from './components/WarningsPanel'
import { clearSelectedGoals } from './goals'
import { FunctionsContext, GroupsContext } from './groups'
import { FEEDBACK_URL, SEVERITY } from './labels'
import { useApplyTheme } from './theme'
import { useUnreadCount } from './components/blog/unread'
import { ProfileContext, useProfileOwner } from './profile'
import { ALL_POSTS, href, isBlogPage, useRoute, type Route, type RoutineTab } from './router'
import { useIncomingRoutine } from './share'
import { syncLabel, useRoutineSync, type ServerCopy } from './sync'
import {
  EMPTY_ADD_DRAFT,
  currentResult,
  groupByRule,
  isCombinationAlert,
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
const LandingPage = lazy(() => import('./components/LandingPage').then((m) => ({ default: m.LandingPage })))
const ActivityPage = lazy(() => import('./components/blog/ActivityPage').then((m) => ({ default: m.ActivityPage })))
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
  useApplyTheme(route.page === 'review') // the reviewers' page stays light
  const page = route.page
  const [adding, setAdding] = useState(false)
  // Signed out: null shows the landing page; otherwise the form its buttons opened.
  const [door, setDoor] = useState<'sign-in' | 'register' | null>(null)
  // A form opened from the bottom of the landing page starts at the top.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [door])
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
    if (account.state.kind === 'signed-out') {
      // A shared routine link goes straight to sign-in, as before; everyone else sees the landing page first.
      if (door || window.location.hash.startsWith('#routine=')) {
        return (
          <SignIn
            key={door ?? 'sign-in'}
            onSignedIn={account.signedIn}
            initialMode={door ?? 'sign-in'}
            onBack={door ? () => setDoor(null) : undefined}
          />
        )
      }
      return (
        <GroupsContext value={groups}>
          <Suspense fallback={<p className="motion-loading p-6 text-sm text-ink-mute">Đang tải…</p>}>
            <LandingPage onStart={() => setDoor('register')} onSignIn={() => setDoor('sign-in')} />
          </Suspense>
        </GroupsContext>
      )
    }
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
          <p className="motion-loading">Đang tải…</p>
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
            <div className="mx-auto flex min-h-16 max-w-[75rem] items-center gap-6 px-4 sm:px-6 lg:gap-6 lg:px-10 xl:gap-8">
              <a href={href({ page: 'routine', tab: 'today' })} className="inline-flex shrink-0 rounded-md">
                <Logo className="h-9 w-auto lg:h-10" />
              </a>
              <nav className="hidden flex-1 gap-1 lg:flex xl:gap-2" aria-label="Điều hướng chính">
                {MENU.map(([target, label, isCurrent]) => (
                  <a
                    key={label}
                    href={href(target)}
                    aria-current={isCurrent(route) ? 'page' : undefined}
                    className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-[0.9375rem] whitespace-nowrap xl:px-4.5 ${isCurrent(route) ? 'bg-primary font-semibold text-surface' : 'text-ink-soft hover:bg-thistle/25 hover:text-ink'}`}
                  >
                    {label}
                    {target === ALL_POSTS && me && <UnreadBadge />}
                  </a>
                ))}
              </nav>
              <div className="ml-auto flex items-center gap-3">
                {/* Hidden on a wrapper: "hidden" on the switch itself would lose to its own inline-grid. */}
                <div className="hidden lg:block">
                  <ThemeSwitch />
                </div>
                {me && (
                  <AccountButton
                    email={me.email}
                    status={accountOffline ? 'Mất kết nối, sẽ thử lại' : (syncLabel(sync.state) ?? null)}
                    warn={conflict !== null || sync.state.kind === 'offline' || accountOffline}
                    onClick={() => (conflict ? setHiddenConflict(null) : setAccountOpen(true))}
                  />
                )}
              </div>
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
                {target === ALL_POSTS && me && <UnreadBadge />}
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
            <Suspense fallback={<p className="motion-loading text-sm text-ink-mute">Đang tải…</p>}>
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
                <TabPanel key={route.tab} tab={route.tab}>
                  {route.tab === 'today' ? (
                    <TodayPage actions={actions} check={check} />
                  ) : route.tab === 'week' ? (
                    <RoutineBoard
                      key={route.focus ?? ''}
                      focus={route.focus}
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
                    <WarningsPanel
                      key={route.focus ?? ''}
                      focus={route.focus}
                      state={check}
                      products={actions.routine.products}
                      found={found}
                      page
                    />
                  )}
                </TabPanel>
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
              <div key={currentPage} data-motion="enter" className="motion-enter mx-auto max-w-6xl">
                <BlogListPage filter={route.filter} />
              </div>
            ) : route.page === 'activity' ? (
              <div key={currentPage} data-motion="enter" className="motion-enter mx-auto max-w-6xl">
                <ActivityPage />
              </div>
            ) : route.page === 'saved' ? (
              <div key={currentPage} data-motion="enter" className="motion-enter mx-auto max-w-6xl">
                <SavedPage />
              </div>
            ) : route.page === 'write' ? (
              <div key={currentPage} data-motion="enter" className="motion-enter mx-auto max-w-6xl">
                <WritePage key={route.product ?? 'new'} actions={actions} product={route.product} account={me?.email ?? ''} />
              </div>
            ) : route.page === 'edit' ? (
              <div key={currentPage} data-motion="enter" className="motion-enter mx-auto max-w-6xl">
                <EditPage key={route.id} id={route.id} actions={actions} account={me?.email ?? ''} />
              </div>
            ) : route.page === 'post' ? (
              <div key={currentPage} data-motion="enter" className="motion-enter mx-auto max-w-6xl">
                <PostPage key={route.id} id={route.id} actions={actions} />
              </div>
            ) : route.page === 'product' ? (
              <div key={currentPage} data-motion="enter" className="motion-enter mx-auto max-w-6xl">
                <ProductPage key={route.id} id={route.id} />
              </div>
            ) : route.page === 'author' ? (
              <div key={currentPage} data-motion="enter" className="motion-enter mx-auto max-w-6xl">
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
  // Only the round avatar; a sync problem shows as a dot and is part of the button's name.
  const name = status ? `Tài khoản, ${status.toLowerCase()}` : 'Tài khoản'
  const shown = email.length > 40 ? `${email.slice(0, 39)}…` : email
  return (
    <button
      onClick={onClick}
      aria-label={name}
      title={status ? `${shown} · ${status}` : shown}
      className="motion-press inline-flex size-11 shrink-0 items-center justify-center rounded-full"
    >
      <span
        aria-hidden="true"
        className="relative inline-flex size-11 items-center justify-center rounded-full bg-thistle text-sm font-semibold text-thistle-ink lg:size-10"
      >
        {initial(email)}
        {warn && (
          <span className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full bg-caution ring-2 ring-surface" />
        )}
      </span>
    </button>
  )
}

/**
 * Unread activity on the review pages, next to "Đánh giá" (rendered only when signed in: asking
 * without a session would be a 401). Thistle, not a severity colour; read out as part of the link.
 */
function UnreadBadge() {
  const unread = useUnreadCount()
  if (!unread) return null
  return (
    <>
      <span
        aria-hidden="true"
        className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-thistle px-1.5 text-xs leading-5 font-semibold text-thistle-ink tabular-nums"
      >
        {unread > 99 ? '99+' : unread}
      </span>
      <span className="sr-only">, {unread} hoạt động chưa đọc</span>
    </>
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
 * The four tabs of "Lịch dùng". "Kiểm tra" carries the number of combination warnings of severity
 * avoid / caution from the last check (usage notes are not warnings; a bare number on an info / safe
 * card such as a myth would read as a warning).
 */
function RoutineTabs({ tab, check }: { tab: RoutineTab; check: CheckState }) {
  const result = currentResult(check)
  // Counted as cards: one per rule, however many pairs of products it lists.
  const warnings = result ? groupByRule(result.warnings.filter(isCombinationAlert)).length : 0
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
              className={`motion-press flex min-h-11 items-center justify-center rounded-sm px-1 text-center text-xs font-semibold whitespace-nowrap lg:min-h-10 lg:rounded-full lg:px-5 lg:text-sm ${
                on
                  ? 'bg-primary text-surface lg:bg-wash-strong lg:text-primary'
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

/** Tabs already shown in this page load: their next visit fades as one block (ANIMATION.md 5.2). */
const seenTabs = new Set<RoutineTab>()

/**
 * The content of one routine tab, keyed by the tab so it remounts on a switch. The first visit lets
 * the tab's blocks rise in reading order (`motion-enter`); later visits fade the whole panel once.
 * Decided when the panel mounts, so a re-render (a new check result) never replays it.
 */
function TabPanel({ tab, children }: { tab: RoutineTab; children: ReactNode }) {
  const [motion] = useState(() => (seenTabs.has(tab) ? 'tab' : 'enter'))
  useEffect(() => {
    seenTabs.add(tab)
  }, [tab])
  return (
    <div data-motion={motion} className="mt-6 lg:mt-8">
      {children}
    </div>
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
