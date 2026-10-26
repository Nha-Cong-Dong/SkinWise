import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api, type CosmeticFunction, type Group, type Severity } from './api'
import { AddProduct } from './components/AddProduct'
import { Dialog } from './components/Dialog'
import { Mark } from './components/Icons'
import { MyProducts } from './components/MyProducts'
import { MythPage } from './components/MythPage'
import { ReviewPage } from './components/ReviewPage'
import { RoutineBoard } from './components/RoutineBoard'
import { SeverityCounts, WarningsPanel } from './components/WarningsPanel'
import { FunctionsContext, GroupsContext } from './groups'
import { SEVERITY } from './labels'
import {
  EMPTY_ADD_DRAFT,
  currentResult,
  isUsageNote,
  useRoutine,
  useRoutineCheck,
  type CheckState,
} from './routine'

type Page = 'routine' | 'myths' | 'review'

// The review page has no nav entry for users; reviewers open #review.
const pageFromHash = (): Page => (window.location.hash === '#review' ? 'review' : 'routine')

const SEVERITY_RANK = Object.keys(SEVERITY) as Severity[] // most severe first

function App() {
  const [page, setPage] = useState<Page>(pageFromHash)
  const [adding, setAdding] = useState(false)
  const [addDraft, setAddDraft] = useState(EMPTY_ADD_DRAFT) // outlives the dialog's content
  const [groups, setGroups] = useState<Map<string, Group>>(new Map())
  const [functions, setFunctions] = useState<Map<string, CosmeticFunction>>(new Map())
  const actions = useRoutine()
  const check = useRoutineCheck(actions.routine)

  useEffect(() => {
    const onHash = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

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

  return (
    <GroupsContext value={groups}>
      <FunctionsContext value={functions}>
        <div className="min-h-screen">
          <header className="bg-surface ring-1 ring-line">
            <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-2.5">
                <Mark className="size-8" />
                <span className="text-xl leading-none font-bold tracking-tight">
                  SkinWise
                </span>
              </div>
              <nav className="flex gap-1 text-[0.9375rem]" aria-label="Trang">
                {(
                  [
                    ['routine', 'Routine của tôi'],
                    ['myths', 'Sự thật hay myth'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => {
                      // Leaving #review (or the #results anchor) for a page of the menu.
                      if (window.location.hash) history.replaceState(null, '', window.location.pathname)
                      setPage(value)
                    }}
                    aria-current={page === value ? 'page' : undefined}
                    className={`rounded-full px-3.5 py-1.5 ${page === value ? 'bg-ink font-medium text-white' : 'text-ink-soft hover:bg-paper hover:text-ink'}`}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <p className="hidden text-sm text-ink-mute xl:ml-auto xl:block">
                Xếp lịch dùng sản phẩm, phát hiện trùng hoạt chất và kết hợp cần thận trọng.
              </p>
            </div>
          </header>

          <div className="mx-auto max-w-[90rem] px-4 pt-3 sm:px-6">
            <p className="max-w-2xl text-xs leading-relaxed text-ink-soft">
              SkinWise là công cụ nhắc nhở và giáo dục, không thay thế tư vấn của bác sĩ da liễu hay dược sĩ. Nếu bạn
              đang mang thai, đang điều trị bệnh da hoặc dùng thuốc kê đơn, hãy hỏi ý kiến chuyên gia.
            </p>
          </div>

          <main className="mx-auto max-w-[90rem] px-4 pt-6 pb-24 sm:px-6 lg:pb-12">
            {page === 'routine' ? (
              <div className="grid gap-x-6 gap-y-10 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[18.5rem_minmax(0,1fr)_23rem]">
                <div className="lg:col-start-1 lg:row-start-1">
                  <MyProducts actions={actions} onAdd={() => setAdding(true)} />
                </div>
                <div className="lg:col-start-1 lg:row-start-2 xl:col-start-2 xl:row-start-1">
                  <RoutineBoard actions={actions} flagged={flagged} />
                </div>
                <ResultsAside check={check}>
                  <WarningsPanel state={check} products={actions.routine.products} />
                </ResultsAside>
              </div>
            ) : page === 'myths' ? (
              <div className="mx-auto max-w-2xl">
                <MythPage products={actions.routine.products} />
              </div>
            ) : (
              <div className="mx-auto max-w-4xl">
                <ReviewPage />
              </div>
            )}
          </main>

          <footer className="mx-auto max-w-[90rem] border-t border-line px-4 py-6 text-xs leading-relaxed text-ink-mute sm:px-6">
            Cảnh báo chỉ đến từ các luật đã được người duyệt đối chiếu với nguồn. Routine được lưu trên trình duyệt này.
          </footer>
        </div>

        <Dialog
          open={adding}
          onClose={() => setAdding(false)}
          title={<h2 className="text-xl font-bold">Thêm sản phẩm</h2>}
        >
          <AddProduct actions={actions} draft={addDraft} setDraft={setAddDraft} />
        </Dialog>
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
            {warnings.length > 0 ? (
              <SeverityCounts warnings={warnings} />
            ) : check.kind === 'error' ? (
              'Không kiểm tra được routine'
            ) : check.kind === 'loading' && !result ? (
              'Đang kiểm tra…'
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
