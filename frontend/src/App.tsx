import { useEffect, useState } from 'react'

type Health = { status: string; db: string }
type HealthState = { kind: 'loading' } | { kind: 'ok'; health: Health } | { kind: 'error' }

function App() {
  const [state, setState] = useState<HealthState>({ kind: 'loading' })

  useEffect(() => {
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((health: Health) => setState({ kind: 'ok', health }))
      .catch(() => setState({ kind: 'error' }))
  }, [])

  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-3xl font-bold text-rose-600">SkinWise</h1>
      <p className="mt-2 text-slate-600">
        Sắp xếp routine skincare, phát hiện trùng hoạt chất và kết hợp cần thận trọng.
      </p>
      <p className="mt-8 text-sm text-slate-500">
        {state.kind === 'loading' && 'Đang kiểm tra kết nối…'}
        {state.kind === 'ok' && `API: ${state.health.status}, DB: ${state.health.db}`}
        {state.kind === 'error' && 'Không kết nối được API.'}
      </p>
    </main>
  )
}

export default App
