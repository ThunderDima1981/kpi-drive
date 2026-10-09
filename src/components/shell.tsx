import { useEffect, useState } from 'react'
import { LayoutDashboard, Menu, Settings, X } from 'lucide-react'
import { PeriodCalendar } from './period-calendar.tsx'
import { cn } from '@/lib/utils'
import { OrgSearch, OrgToggle } from './org-toggle.tsx'
import { useOrgList } from './use-org-list.ts'
import type { OrgNode } from '../lib/org.ts'
import type { Route } from '../lib/routes.ts'
import type { User } from '../lib/session.ts'
import { useSaveStatus } from '../lib/sync.ts'
import { useTeamStore } from '../store/team-store.ts'

export function Shell({
  route,
  user,
  onNavigate,
  onLogout,
  children,
}: {
  route: Route
  user: User
  onNavigate: (route: Route) => void
  onLogout: () => void
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function go(next: Route) {
    setOpen(false)
    onNavigate(next)
  }

  return (
    <div className="min-h-screen bg-paper text-ink md:grid md:grid-cols-[16.5rem_1fr]">
      <aside className="sticky top-0 hidden h-screen md:block">
        <Sidebar route={route} user={user} onNavigate={go} onLogout={onLogout} />
      </aside>
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" aria-label="Закрыть меню" className="absolute inset-0 bg-ink/45" onClick={() => setOpen(false)} />
          <div className="relative h-full w-[16.5rem] max-w-[86vw] shadow-xl">
            <Sidebar route={route} user={user} onNavigate={go} onLogout={onLogout} />
          </div>
        </div>
      ) : null}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-paper/95 px-4 py-3 backdrop-blur md:hidden">
          <button type="button" className="grid size-10 place-items-center rounded-lg border border-line bg-card" aria-label="Открыть меню" onClick={() => setOpen(true)}>
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
          <p className="text-sm font-semibold">KPI-Drive</p>
          <span className="size-10" />
        </header>
        <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  )
}

function Sidebar({
  route,
  user,
  onNavigate,
  onLogout,
}: {
  route: Route
  user: User
  onNavigate: (route: Route) => void
  onLogout: () => void
}) {
  const employees = useTeamStore((state) => state.employees)
  const periodLabel = useTeamStore((state) => state.periodLabel)
  const currentPeriod = useTeamStore((state) => state.currentPeriod)
  const selectPeriod = useTeamStore((state) => state.selectPeriod)
  const saveStatus = useSaveStatus()
  const [periodOpen, setPeriodOpen] = useState(false)
  const org = useOrgList(employees)

  return (
    <div className="flex h-full flex-col bg-ink text-[#f6f3ec]">
      <div className="flex items-center gap-3 px-5 pt-6 pb-5">
        <svg viewBox="0 0 32 32" className="size-10" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="#243044" />
          <path d="M8 20a8 8 0 1 1 16 0" fill="none" stroke="#e7d7b0" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M10.2 19.2a6 6 0 0 1 9.4-2.6" fill="none" stroke="#d7b15a" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        <div>
          <p className="text-sm font-semibold tracking-wide">KPI-Drive</p>
          <p className="text-xs text-white/55">Матрица Литягина</p>
        </div>
      </div>
      <nav className="grid gap-1 px-3">
        <NavButton
          active={route.name === 'dashboard'}
          onClick={() => onNavigate({ name: 'dashboard' })}
          icon={<LayoutDashboard className="size-4" />}
          label="Дашборд"
        />
        <NavButton
          active={route.name === 'settings'}
          onClick={() => onNavigate({ name: 'settings' })}
          icon={<Settings className="size-4" />}
          label="Настройки"
        />
      </nav>
      <p className="mt-6 px-5 text-[11px] font-semibold tracking-[0.16em] text-white/45 uppercase">Матрицы</p>
      <div className="mt-2 px-3">
        <OrgSearch value={org.query} onChange={org.setQuery} tone="dark" />
      </div>
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {employees.length === 0 ? (
          <p className="px-2 py-2 text-sm text-white/50">Список пуст</p>
        ) : org.nodes.length === 0 ? (
          <p className="px-2 py-2 text-sm text-white/50">Никого не нашли</p>
        ) : (
          <SidebarBranches
            nodes={org.nodes}
            depth={0}
            open={org.open}
            route={route}
            onToggle={org.toggle}
            onNavigate={onNavigate}
          />
        )}
      </div>
      <div className="relative border-t border-white/10 px-5 py-4">
        {periodOpen ? (
          <div className="absolute bottom-full left-3 z-20 mb-2 w-[20rem] rounded-2xl border border-line bg-paper p-3 text-ink shadow-xl">
            <PeriodCalendar
              value={currentPeriod}
              onChange={(id) => {
                selectPeriod(id)
                setPeriodOpen(false)
              }}
            />
          </div>
        ) : null}
        <button type="button" className="w-full text-left" aria-expanded={periodOpen} onClick={() => setPeriodOpen((open) => !open)}>
          <p className="text-xs text-white/45">Период</p>
          <p className="mt-1 text-sm font-medium">{periodLabel || 'Не задан'}</p>
        </button>
        <p className="mt-3 text-xs leading-relaxed text-white/45">Считается только КР. Оклады и премии не участвуют.</p>
        <p className="mt-3 truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-white/45">{user.email}</p>
        <p className="mt-1 text-xs text-white/45">
          {saveStatus === 'saving' ? 'Сохраняем…' : saveStatus === 'error' ? 'Не удалось сохранить' : 'Данные в базе'}
        </p>
        <button type="button" className="mt-2 text-sm font-medium text-white/80 hover:text-white" onClick={onLogout}>
          Выйти
        </button>
      </div>
    </div>
  )
}

function SidebarBranches({
  nodes,
  depth,
  open,
  route,
  onToggle,
  onNavigate,
}: {
  nodes: OrgNode[]
  depth: number
  open: Set<string>
  route: Route
  onToggle: (id: string) => void
  onNavigate: (route: Route) => void
}) {
  return (
    <div className="grid gap-1">
      {nodes.map((node) => {
        const expanded = open.has(node.employee.id)
        const hasChildren = node.children.length > 0
        const active = route.name === 'matrix' && route.employeeId === node.employee.id
        return (
          <div key={node.employee.id} className="grid gap-1" style={{ marginLeft: depth > 0 ? 16 : 0 }}>
            <div className="flex items-start gap-1">
              {hasChildren ? (
                <OrgToggle
                  open={expanded}
                  name={node.employee.name}
                  tone="dark"
                  onClick={() => onToggle(node.employee.id)}
                />
              ) : (
                <span className="size-6 shrink-0" />
              )}
              <button
                type="button"
                onClick={() => onNavigate({ name: 'matrix', employeeId: node.employee.id })}
                className={cn(
                  'min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left',
                  active ? 'bg-white/10' : 'hover:bg-white/5',
                )}
              >
                <span className="block truncate text-sm font-medium">{node.employee.name}</span>
                <span className="block truncate text-xs text-white/50">{node.employee.position}</span>
              </button>
            </div>
            {hasChildren && expanded ? (
              <SidebarBranches
                nodes={node.children}
                depth={depth + 1}
                open={open}
                route={route}
                onToggle={onToggle}
                onNavigate={onNavigate}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function NavButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium',
        active ? 'bg-white/10 text-white' : 'text-white/75 hover:bg-white/5 hover:text-white',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
