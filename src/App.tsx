import { useEffect, useState } from 'react'
import { AuthScreen } from './components/auth-screen.tsx'
import { Dashboard } from './components/dashboard.tsx'
import { MatrixView } from './components/matrix-view.tsx'
import { SettingsView } from './components/settings-view.tsx'
import { Shell } from './components/shell.tsx'
import { ApiError, api } from './lib/api.ts'
import { hrefFor, parseHash, type Route } from './lib/routes.ts'
import type { User } from './lib/session.ts'
import { RoleProvider } from './lib/role.tsx'
import { clearTeamLocal, flushTeamSync, loadTeam, startTeamEvents, startTeamSync } from './lib/sync.ts'

type Session =
  | { status: 'loading' }
  | { status: 'out' }
  | { status: 'error'; message: string }
  | { status: 'in'; user: User }

export default function App() {
  const [session, setSession] = useState<Session>({ status: 'loading' })
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (session.status === 'in' && session.user.role !== 'admin' && route.name === 'settings') {
      navigate({ name: 'dashboard' })
    }
  }, [route, session])

  useEffect(() => {
    if (session.status !== 'in') return
    return startTeamEvents()
  }, [session.status])

  useEffect(() => {
    if (session.status !== 'in') return
    if (route.name === 'settings') document.title = 'Настройки команды — KPI-Drive'
    else if (route.name === 'matrix') document.title = 'Матрица КР — KPI-Drive'
    else document.title = 'Результативность команды — KPI-Drive'
  }, [route, session.status])

  useEffect(() => {
    let cancelled = false
    startTeamSync()
    void (async () => {
      try {
        const me = await api<{ user: User }>('/api/auth/me')
        await loadTeam()
        if (!cancelled) setSession({ status: 'in', user: me.user })
      } catch (reason) {
        if (cancelled) return
        if (reason instanceof ApiError && reason.status === 401) {
          setSession({ status: 'out' })
          return
        }
        setSession({ status: 'error', message: 'Не удалось открыть базу. Проверьте, что сервер запущен.' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function navigate(next: Route) {
    const href = hrefFor(next)
    if (window.location.hash === href) {
      setRoute(next)
      return
    }
    window.location.hash = href
  }

  async function logout() {
    await flushTeamSync()
    clearTeamLocal()
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    setSession({ status: 'out' })
    navigate({ name: 'dashboard' })
  }

  if (session.status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center bg-paper text-ink">
        <div className="text-center">
          <p className="font-display text-4xl text-pine">KPI-Drive</p>
          <p className="mt-2 text-sm text-ink-soft">Открываем учётную запись</p>
        </div>
      </div>
    )
  }

  if (session.status === 'error') {
    return (
      <div className="grid min-h-screen place-items-center bg-paper px-4 text-ink">
        <div className="max-w-md text-center">
          <p className="font-display text-4xl text-pine">KPI-Drive</p>
          <p className="mt-3 text-sm text-ink-soft">{session.message}</p>
        </div>
      </div>
    )
  }

  if (session.status === 'out') {
    return (
      <AuthScreen
        onSuccess={async (user) => {
          await loadTeam()
          setSession({ status: 'in', user })
        }}
      />
    )
  }

  return (
    <RoleProvider role={session.user.role}>
    <Shell route={route} user={session.user} onNavigate={navigate} onLogout={() => void logout()}>
      {route.name === 'dashboard' ? (
        <Dashboard
          onOpenEmployee={(employeeId) => navigate({ name: 'matrix', employeeId })}
          onOpenSettings={() => navigate({ name: 'settings' })}
        />
      ) : null}
      {route.name === 'matrix' ? (
        <MatrixView employeeId={route.employeeId} onBack={() => navigate({ name: 'dashboard' })} />
      ) : null}
      {route.name === 'settings' && session.user.role === 'admin' ? (
        <SettingsView
          currentUserId={session.user.id}
          onAccountChange={(user) => {
            if (user.id === session.user.id) setSession({ status: 'in', user })
          }}
          onSelfRemoved={() => void logout()}
          onOpenEmployee={(employeeId) => navigate({ name: 'matrix', employeeId })}
        />
      ) : null}
    </Shell>
    </RoleProvider>
  )
}
