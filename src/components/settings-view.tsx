import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KpiCatalogSection } from './kpi-catalog.tsx'
import { PeriodCalendar } from './period-calendar.tsx'
import { OrgSearch, OrgToggle } from './org-toggle.tsx'
import { useOrgList } from './use-org-list.ts'
import { initials } from '../lib/format.ts'
import { managerChoices, type OrgNode } from '../lib/org.ts'
import { api } from '../lib/api.ts'
import type { User } from '../lib/session.ts'
import { useTeamStore } from '../store/team-store.ts'
import type { Employee } from '../types.ts'
import type { Role } from '../lib/access.ts'

export function SettingsView({ onRoleChange }: { onRoleChange: (user: User) => void }) {
  const employees = useTeamStore((state) => state.employees)
  const currentPeriod = useTeamStore((state) => state.currentPeriod)
  const selectPeriod = useTeamStore((state) => state.selectPeriod)
  const addEmployee = useTeamStore((state) => state.addEmployee)
  const org = useOrgList(employees)
  const [name, setName] = useState('')
  const [position, setPosition] = useState('')
  const [error, setError] = useState('')

  function add(event: React.FormEvent) {
    event.preventDefault()
    const id = addEmployee(name, position)
    if (!id) {
      setError('Укажите ФИО и должность.')
      return
    }
    setName('')
    setPosition('')
    setError('')
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-gold uppercase">Команда</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Настройки</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Состав команды и матрицы хранятся в базе для вашей учётной записи. Расчёт по-прежнему только про коэффициент результативности.
        </p>
      </header>

      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <PeriodCalendar value={currentPeriod} onChange={selectPeriod} />
      </section>

      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <h2 className="font-semibold">Новый сотрудник</h2>
        <form onSubmit={add} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Label className="grid gap-1.5">
            <span>ФИО</span>
            <Input value={name} onValueChange={setName} aria-label="ФИО нового сотрудника" />
          </Label>
          <Label className="grid gap-1.5">
            <span>Должность</span>
            <Input value={position} onValueChange={setPosition} aria-label="Должность нового сотрудника" />
          </Label>
          <Button type="submit">Добавить</Button>
        </form>
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      </section>

      <section className="rounded-2xl border border-line bg-card shadow-sm">
        <div className="flex flex-col gap-3 px-5 pt-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-semibold">Состав</h2>
            <p className="mt-1 text-sm text-ink-soft">Руководитель задаёт ветку. «+» раскрывает подчинённых.</p>
          </div>
          <div className="w-full sm:max-w-xs">
            <OrgSearch value={org.query} onChange={org.setQuery} tone="light" />
          </div>
        </div>
        {employees.length === 0 ? (
          <p className="px-5 py-8 text-sm text-ink-soft">Список пуст. Добавьте первого сотрудника.</p>
        ) : org.nodes.length === 0 ? (
          <p className="px-5 py-8 text-sm text-ink-soft">Никого не нашли по этому запросу.</p>
        ) : (
          <div className="mt-3">
            <SettingsBranches nodes={org.nodes} depth={0} open={org.open} employees={employees} onToggle={org.toggle} />
          </div>
        )}
      </section>

      <KpiCatalogSection />
      <UsersSection onRoleChange={onRoleChange} />
    </div>
  )
}

function UsersSection({ onRoleChange }: { onRoleChange: (user: User) => void }) {
  const [users, setUsers] = useState<User[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void api<{ users: User[] }>('/api/users')
      .then((result) => {
        if (!cancelled) setUsers(result.users)
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось загрузить список пользователей.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function changeRole(user: User, role: Role) {
    setError('')
    try {
      const result = await api<{ user: User }>(`/api/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      })
      setUsers((items) => items.map((item) => (item.id === result.user.id ? result.user : item)))
      onRoleChange(result.user)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось изменить права.')
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <h2 className="font-semibold">Права пользователей</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Администратор ведёт настройки и матрицу. Пользователь может только создавать smart-задачи и ставить статус «Выполнено».
      </p>
      {users.length === 0 ? <p className="mt-4 text-sm text-ink-soft">Пользователей пока нет.</p> : null}
      <ul className="mt-4 grid gap-3">
        {users.map((user) => (
          <li key={user.id} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_14rem] sm:items-center">
            <div>
              <p className="font-medium">{user.name}</p>
              <p className="text-sm text-ink-soft">{user.email}</p>
            </div>
            <select
              aria-label={`Права: ${user.name}`}
              value={user.role}
              onChange={(event) => void changeRole(user, event.target.value === 'user' ? 'user' : 'admin')}
              className="h-9 rounded-lg border border-input bg-white px-2 text-sm"
            >
              <option value="admin">Администратор</option>
              <option value="user">Пользователь</option>
            </select>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
    </section>
  )
}

function SettingsBranches({
  nodes,
  depth,
  open,
  employees,
  onToggle,
}: {
  nodes: OrgNode[]
  depth: number
  open: Set<string>
  employees: Employee[]
  onToggle: (id: string) => void
}) {
  return (
    <div>
      {nodes.map((node) => {
        const expanded = open.has(node.employee.id)
        const hasChildren = node.children.length > 0
        return (
          <div key={node.employee.id} style={{ marginLeft: depth > 0 ? 20 : 0 }}>
            <div className="flex items-start gap-2 border-t border-line px-5 py-4">
              {hasChildren ? (
                <div className="pt-2">
                  <OrgToggle open={expanded} name={node.employee.name} tone="light" onClick={() => onToggle(node.employee.id)} />
                </div>
              ) : (
                <span className="mt-2 size-6 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <EmployeeRow employee={node.employee} employees={employees} />
              </div>
            </div>
            {hasChildren && expanded ? (
              <SettingsBranches
                nodes={node.children}
                depth={depth + 1}
                open={open}
                employees={employees}
                onToggle={onToggle}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function EmployeeRow({ employee, employees }: { employee: Employee; employees: Employee[] }) {
  const updateEmployee = useTeamStore((state) => state.updateEmployee)
  const setManager = useTeamStore((state) => state.setManager)
  const removeEmployee = useTeamStore((state) => state.removeEmployee)
  const choices = managerChoices(employees, employee.id)
  const [name, setName] = useState(employee.name)
  const [position, setPosition] = useState(employee.position)
  const [source, setSource] = useState({ name: employee.name, position: employee.position })
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (source.name !== employee.name || source.position !== employee.position) {
    setSource({ name: employee.name, position: employee.position })
    setName(employee.name)
    setPosition(employee.position)
  }

  function commit() {
    const nextName = name.trim()
    const nextPosition = position.trim()
    if (!nextName || !nextPosition) {
      setName(employee.name)
      setPosition(employee.position)
      return
    }
    updateEmployee(employee.id, { name: nextName, position: nextPosition })
  }

  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold">
        {initials(name || employee.name)}
      </span>
      <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
      <Label className="grid flex-1 gap-1">
        <span className="sr-only">ФИО</span>
        <Input value={name} aria-label={`ФИО: ${employee.name}`} onValueChange={setName} onBlur={commit} />
      </Label>
      <Label className="grid flex-1 gap-1">
        <span className="sr-only">Должность</span>
        <Input value={position} aria-label={`Должность: ${employee.name}`} onValueChange={setPosition} onBlur={commit} />
      </Label>
      <Label className="grid min-w-40 flex-1 gap-1">
        <span className="sr-only">Руководитель</span>
        <select
          aria-label={`Руководитель: ${employee.name}`}
          value={employee.managerId ?? ''}
          onChange={(event) => setManager(employee.id, event.target.value || null)}
          className="h-9 w-full rounded-lg border border-input bg-white px-2 text-sm"
        >
          <option value="">Без руководителя</option>
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.name}
            </option>
          ))}
        </select>
      </Label>
      {confirmDelete ? (
        <div className="flex gap-2">
          <Button type="button" variant="destructive" onClick={() => removeEmployee(employee.id)}>
            Удалить
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
            Нет
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => setConfirmDelete(true)}>
          Удалить
        </Button>
      )}
      </div>
    </div>
  )
}
