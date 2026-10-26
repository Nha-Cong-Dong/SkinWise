import { useEffect, useState } from 'react'
import { api, type CosmeticFunction, type Group, type Severity } from './api'
import { AddProduct } from './components/AddProduct'
import { MyProducts } from './components/MyProducts'
import { MythPage } from './components/MythPage'
import { ReviewPage } from './components/ReviewPage'
import { RoutineBoard } from './components/RoutineBoard'
import { WarningsPanel } from './components/WarningsPanel'
import { FunctionsContext, GroupsContext } from './groups'
import { SEVERITY } from './labels'
import { useRoutine, useRoutineCheck } from './routine'

type Page = 'routine' | 'myths' | 'review'

// The review page has no nav entry for users; reviewers open #review.
const pageFromHash = (): Page => (window.location.hash === '#review' ? 'review' : 'routine')

const SEVERITY_RANK = Object.keys(SEVERITY) as Severity[] // most severe first

function App() {
  const [page, setPage] = useState<Page>(pageFromHash)
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

  // Most severe warning per product; keeps the previous result while a new check runs.
  const flagged = new Map<string, Severity>()
  const result = check.kind === 'done' ? check.result : check.kind === 'loading' ? check.previous : null
  for (const w of result?.warnings ?? []) {
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
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <div>
              <h1 className="text-xl font-bold text-rose-600">SkinWise</h1>
              <p className="text-xs text-slate-500">Routine skincare, trùng hoạt chất và kết hợp cần thận trọng</p>
            </div>
            <nav className="flex gap-1 text-sm">
              {(
                [
                  ['routine', 'Routine của tôi'],
                  ['myths', 'Sự thật hay myth'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => {
                    if (window.location.hash) history.replaceState(null, '', window.location.pathname)
                    setPage(value)
                  }}
                  aria-current={page === value ? 'page' : undefined}
                  className={`rounded-md px-3 py-1.5 ${page === value ? 'bg-rose-50 font-medium text-rose-700' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-4 pt-4">
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
            SkinWise là công cụ nhắc nhở và giáo dục, không thay thế tư vấn của bác sĩ da liễu hay dược sĩ. Nếu bạn
            đang mang thai, đang điều trị bệnh da hoặc dùng thuốc kê đơn, hãy hỏi ý kiến chuyên gia.
          </p>
        </div>

        <main className="mx-auto max-w-6xl px-4 py-6">
          {page === 'routine' ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <AddProduct actions={actions} />
                  <MyProducts actions={actions} />
                </div>
                <RoutineBoard actions={actions} flagged={flagged} />
              </div>
              <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
                <WarningsPanel state={check} products={actions.routine.products} />
              </aside>
            </div>
          ) : page === 'myths' ? (
            <div className="mx-auto max-w-3xl">
              <MythPage products={actions.routine.products} />
            </div>
          ) : (
            <div className="mx-auto max-w-4xl">
              <ReviewPage />
            </div>
          )}
        </main>

        <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-slate-400">
          Cảnh báo chỉ đến từ các luật đã được người duyệt đối chiếu với nguồn. Routine được lưu trên trình duyệt này.
        </footer>
      </div>
      </FunctionsContext>
    </GroupsContext>
  )
}

export default App
