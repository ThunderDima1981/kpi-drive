import { useEffect, useState, useSyncExternalStore } from 'react'
import { Dashboard } from './components/dashboard.tsx'
import { MatrixView } from './components/matrix-view.tsx'
import { SettingsView } from './components/settings-view.tsx'
import { Shell } from './components/shell.tsx'
import { hrefFor, parseHash, type Route } from './lib/routes.ts'
import { useTeamStore } from './store/team-store.ts'

function useStoreHydrated() {
  return useSyncExternalStore(
    (onStoreChange) => useTeamStore.persist.onFinishHydration(onStoreChange),
    () => useTeamStore.persist.hasHydrated(),
    () => false,
  )
}

export default function App() {
  const hydrated = useStoreHydrated()
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (route.name === 'settings') document.title = 'Настройки команды — KPI-Drive'
    else if (route.name === 'matrix') document.title = 'Матрица КР — KPI-Drive'
    else document.title = 'Результативность команды — KPI-Drive'
  }, [route])

  function navigate(next: Route) {
    const href = hrefFor(next)
    if (window.location.hash === href) {
      setRoute(next)
      return
    }
    window.location.hash = href
  }

  if (!hydrated) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper text-ink">
        <div className="text-center">
          <p className="font-display text-4xl text-pine">KPI-Drive</p>
          <p className="mt-2 text-sm text-ink-soft">Открываем матрицы команды</p>
        </div>
      </div>
    )
  }

  return (
    <Shell route={route} onNavigate={navigate}>
      {route.name === 'dashboard' ? (
        <Dashboard
          onOpenEmployee={(employeeId) => navigate({ name: 'matrix', employeeId })}
          onOpenSettings={() => navigate({ name: 'settings' })}
        />
      ) : null}
      {route.name === 'matrix' ? (
        <MatrixView employeeId={route.employeeId} onBack={() => navigate({ name: 'dashboard' })} />
      ) : null}
      {route.name === 'settings' ? <SettingsView /> : null}
    </Shell>
  )
}
