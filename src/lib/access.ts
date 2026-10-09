import { formatPeriod, freshPeriod } from './period.ts'
import type { Employee, Indicator, PeriodSnapshot, SmartIndicator, SmartTask, TeamData } from '../types.ts'

export type Role = 'admin' | 'user'

export function isRole(value: unknown): value is Role {
  return value === 'admin' || value === 'user'
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
  if (after.tasks.length < before.tasks.length) return false
  const afterTasks = new Map(after.tasks.map((task) => [task.id, task]))
  const known = new Set(before.tasks.map((task) => task.id))
  const kept = before.tasks.every((task) => {
    const next = afterTasks.get(task.id)
    if (!next || stable(withoutStatus(task)) !== stable(withoutStatus(next))) return false
    return next.status === task.status || (next.status === 'done' && task.status !== 'done' && task.status !== 'closed')
  })
  if (!kept) return false
  return after.tasks.every((task) => known.has(task.id) || newTaskAllowed(task))
}

function newTaskAllowed(task: SmartTask) {
  return task.status === 'created' && task.name.trim().length > 0 && task.weight > 0
}

function withoutStatus(task: SmartTask) {
  return { ...task, status: 'created' }
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
