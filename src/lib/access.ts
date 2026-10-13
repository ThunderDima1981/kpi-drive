import { formatPeriod, freshPeriod, publishPeriods } from './period.ts'
import {
  canChangeStatus,
  newSmartStatus,
  newTaskStatusError,
  statusChangeError,
  type SmartActor,
} from './smart-access.ts'
import type { Employee, Indicator, PeriodSnapshot, SmartIndicator, SmartTask, TeamData } from '../types.ts'

export type Role = 'admin' | 'user'

export function isRole(value: unknown): value is Role {
  return value === 'admin' || value === 'user'
}

export function documentOwnerId(user: { id: string; role: Role; teamOwnerId: string | null }) {
  if (user.teamOwnerId) return user.teamOwnerId
  return user.role === 'admin' ? user.id : null
}

export function userChangeAllowed(before: TeamData, after: TeamData) {
  if (!isPeriodSet(after)) return false
  if (after.periodLabel !== formatPeriod(after.currentPeriod)) return false
  const beforeIds = new Set(before.periods.map((period) => period.id))
  for (const period of before.periods) {
    const next = after.periods.find((item) => item.id === period.id)
    if (!next || !periodAllowed(period, next)) return false
  }
  for (const period of after.periods) {
    if (beforeIds.has(period.id)) continue
    const copied = after.periods.some(
      (source) => source.id !== period.id && stable(freshPeriod(source, period.id)) === stable(period),
    )
    if (!copied) return false
  }
  const current = after.periods.find((period) => period.id === after.currentPeriod)
  if (!current) return false
  return stable(after.employees) === stable(current.employees) && stable(after.kpiCatalog) === stable(current.kpiCatalog)
}

function isPeriodSet(data: TeamData) {
  return data.periods.some((period) => period.id === data.currentPeriod)
}

function periodAllowed(before: PeriodSnapshot, after: PeriodSnapshot) {
  if (stable(before.kpiCatalog) !== stable(after.kpiCatalog)) return false
  if (before.employees.length !== after.employees.length) return false
  const afterEmployees = new Map(after.employees.map((employee) => [employee.id, employee]))
  return before.employees.every((employee) => {
    const next = afterEmployees.get(employee.id)
    return next ? employeeAllowed(employee, next) : false
  })
}

function employeeAllowed(before: Employee, after: Employee) {
  if (before.name !== after.name || before.position !== after.position || before.managerId !== after.managerId) return false
  if (before.indicators.length !== after.indicators.length) return false
  const afterIndicators = new Map(after.indicators.map((indicator) => [indicator.id, indicator]))
  return before.indicators.every((indicator) => {
    const next = afterIndicators.get(indicator.id)
    return next ? indicatorAllowed(indicator, next) : false
  })
}

function indicatorAllowed(before: Indicator, after: Indicator) {
  if (before.type !== after.type) return false
  if (before.type !== 'smart' || after.type !== 'smart') return stable(before) === stable(after)
  return smartAllowed(before, after)
}

function smartAllowed(before: SmartIndicator, after: SmartIndicator) {
  if (before.weight !== after.weight || stable(before.points) !== stable(after.points)) return false
  return Array.isArray(applySmartTasks(before, after, null, null))
}

function applySmartTasks(
  before: SmartIndicator,
  after: SmartIndicator,
  actor: SmartActor | null,
  employee: { id: string; managerId: string | null } | null,
): SmartTask[] | { error: string } | null {
  if (after.tasks.length < before.tasks.length) return null
  const afterTasks = new Map(after.tasks.map((task) => [task.id, task]))
  if (afterTasks.size !== after.tasks.length) return null
  const known = new Set(before.tasks.map((task) => task.id))
  const tasks: SmartTask[] = []
  for (const task of before.tasks) {
    const next = afterTasks.get(task.id)
    if (!next || stable(withoutStatus(task)) !== stable(withoutStatus(next))) return null
    const statusOk =
      actor && employee
        ? canChangeStatus(actor, employee, task.status, next.status)
        : next.status === task.status || (next.status === 'done' && task.status !== 'done' && task.status !== 'closed')
    if (!statusOk) return actor && employee ? { error: statusChangeError(task.status, next.status) } : null
    tasks.push(next.status === task.status ? task : { ...task, status: next.status })
  }
  for (const task of after.tasks) {
    if (known.has(task.id)) continue
    if (task.name.trim().length === 0 || !(task.weight > 0)) return null
    if (actor && employee) {
      const expected = newSmartStatus(actor, employee)
      if (task.status !== expected) return { error: newTaskStatusError(expected) }
    } else if (task.status !== 'created') {
      return null
    }
    tasks.push(task)
  }
  return tasks
}

function withoutStatus(task: SmartTask) {
  return { ...task, status: 'created' }
}

export function visibleTeam(team: TeamData, allowedIds: ReadonlySet<string>, periodId = team.currentPeriod) {
  return publishPeriods(
    team.periods.map((period) => visiblePeriod(period, allowedIds)),
    periodId,
  )
}

export function mergeUserTeam(stored: TeamData, incoming: TeamData, allowedIds: ReadonlySet<string>, actor: SmartActor) {
  if (!isPeriodSet(incoming)) return null
  if (incoming.periodLabel !== formatPeriod(incoming.currentPeriod)) return null
  const draft = structuredClone(stored)
  const known = new Set(draft.periods.map((period) => period.id))
  for (const period of incoming.periods) {
    if (known.has(period.id)) {
      const current = draft.periods.find((item) => item.id === period.id)
      if (!current) return null
      const merged = mergePeriod(current, period, allowedIds, actor)
      if (!isPeriod(merged)) return merged
      draft.periods = draft.periods.map((item) => (item.id === period.id ? merged : item))
      continue
    }
    const created = createPeriod(draft.periods, period, allowedIds, stored.currentPeriod, actor)
    if (!isPeriod(created)) return created
    draft.periods = [...draft.periods, created]
    known.add(created.id)
  }
  if (!draft.periods.some((period) => period.id === incoming.currentPeriod)) return null
  const saved = publishPeriods(draft.periods, stored.currentPeriod)
  return {
    saved,
    view: publishPeriods(
      saved.periods.map((period) => visiblePeriod(period, allowedIds)),
      incoming.currentPeriod,
    ),
  }
}

function visiblePeriod(period: PeriodSnapshot, allowedIds: ReadonlySet<string>): PeriodSnapshot {
  return {
    ...period,
    employees: period.employees.filter((employee) => allowedIds.has(employee.id)),
  }
}

function isPeriod(value: PeriodSnapshot | { error: string } | null): value is PeriodSnapshot {
  return Boolean(value && 'employees' in value)
}

function mergePeriod(
  stored: PeriodSnapshot,
  incoming: PeriodSnapshot,
  allowedIds: ReadonlySet<string>,
  actor: SmartActor,
): PeriodSnapshot | { error: string } | null {
  const visible = visiblePeriod(stored, allowedIds).employees
  if (!sameIds(visible, incoming.employees)) return null
  const incomingEmployees = new Map(incoming.employees.map((employee) => [employee.id, employee]))
  const employees: Employee[] = []
  for (const employee of stored.employees) {
    if (!allowedIds.has(employee.id)) {
      employees.push(employee)
      continue
    }
    const next = incomingEmployees.get(employee.id)
    if (!next) return null
    const applied = applyEmployeeEdit(employee, next, actor)
    if (!applied) return null
    if (!('indicators' in applied)) return applied
    employees.push(applied)
  }
  return { ...stored, employees }
}

function applyEmployeeEdit(
  before: Employee,
  after: Employee,
  actor: SmartActor,
): Employee | { error: string } | null {
  if (before.indicators.length !== after.indicators.length) return null
  const afterIndicators = new Map(after.indicators.map((indicator) => [indicator.id, indicator]))
  const indicators: Indicator[] = []
  for (const indicator of before.indicators) {
    const next = afterIndicators.get(indicator.id)
    if (!next || next.type !== indicator.type) return null
    if (indicator.type !== 'smart' || next.type !== 'smart') {
      indicators.push(indicator)
      continue
    }
    const tasks = applySmartTasks(indicator, next, actor, before)
    if (!Array.isArray(tasks)) return tasks
    indicators.push({ ...indicator, tasks })
  }
  return { ...before, indicators }
}

function createPeriod(
  storedPeriods: PeriodSnapshot[],
  incoming: PeriodSnapshot,
  allowedIds: ReadonlySet<string>,
  currentPeriod: string,
  actor: SmartActor,
): PeriodSnapshot | { error: string } | null {
  let statusError: string | null = null
  const ranked = storedPeriods
    .map((source) => {
      const base = freshPeriod(source, incoming.id)
      const merged = mergePeriod(base, incoming, allowedIds, actor)
      if (!merged) return null
      if (!isPeriod(merged)) {
        statusError = merged.error
        return null
      }
      const exact = stable(ordered(visiblePeriod(base, allowedIds).employees)) === stable(ordered(incoming.employees))
      return { merged, exact, current: source.id === currentPeriod }
    })
    .filter((item): item is { merged: PeriodSnapshot; exact: boolean; current: boolean } => item !== null)
    .sort((a, b) => Number(b.exact) - Number(a.exact) || Number(b.current) - Number(a.current))
  return ranked[0]?.merged ?? (statusError ? { error: statusError } : null)
}

function sameIds(before: Employee[], after: Employee[]) {
  if (before.length !== after.length) return false
  const ids = new Set(after.map((employee) => employee.id))
  return before.every((employee) => ids.has(employee.id))
}

function ordered(employees: Employee[]) {
  return employees.slice().sort((a, b) => a.id.localeCompare(b.id))
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stable(item)).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}
