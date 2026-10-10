import { isSmartStatus } from './smart.ts'
import type { Employee, SmartIndicator, SmartStatus, SmartTask, TeamData } from '../types.ts'

export type SmartActor = {
  role: 'admin' | 'user'
  employeeId: string | null
}

type MatrixEmployee = {
  id: string
  managerId: string | null
}

export function isDirectManager(actor: SmartActor, employee: MatrixEmployee) {
  return Boolean(actor.employeeId && actor.employeeId === employee.managerId)
}

export function newSmartStatus(actor: SmartActor, employee: MatrixEmployee): SmartStatus {
  if (actor.employeeId === employee.id) return 'created'
  if (isDirectManager(actor, employee)) return 'in_progress'
  if (actor.role === 'admin') return 'in_progress'
  return 'created'
}

export function canChangeStatus(actor: SmartActor, employee: MatrixEmployee, from: SmartStatus, to: SmartStatus) {
  if (from === to) return true
  const manager = isDirectManager(actor, employee)
  const self = actor.employeeId === employee.id
  const admin = actor.role === 'admin'
  if (from === 'created' && to === 'in_progress') return manager || admin
  if (from === 'in_progress' && to === 'done') return self || manager || admin
  if (from === 'done' && to === 'closed') return manager
  return false
}

export function canMoveSmart(actor: SmartActor, employee: MatrixEmployee) {
  return isDirectManager(actor, employee)
}

export function statusChangeError(from: SmartStatus, to: SmartStatus) {
  if (to === 'closed') return 'Статус «Закрыт» ставит только руководитель сотрудника.'
  if (to === 'in_progress') return 'В статус «В работе» смарт переводит руководитель или администратор.'
  if (from !== 'in_progress' && to === 'done') return 'Статус «Выполнено» ставится только из «В работе».'
  if (to === 'done') return 'Статус «Выполнено» может поставить сотрудник, его руководитель или администратор.'
  return 'Этот переход статуса недоступен.'
}

export function newTaskStatusError(status: SmartStatus) {
  return status === 'in_progress'
    ? 'Руководитель создаёт смарт сотруднику сразу со статусом «В работе».'
    : 'Сотрудник создаёт смарт со статусом «Создан».'
}

export function smartChangeError(stored: TeamData, incoming: TeamData, actor: SmartActor) {
  for (const period of incoming.periods) {
    const beforePeriod = stored.periods.find((item) => item.id === period.id)
    for (const employee of period.employees) {
      if (!employee || typeof employee.id !== 'string' || !Array.isArray(employee.indicators)) continue
      const storedEmployee = beforePeriod?.employees.find((item) => item.id === employee.id)
      const identity = {
        id: employee.id,
        managerId: storedEmployee ? storedEmployee.managerId : employeeManagerId(employee),
      }
      const beforeBlocks = new Map(smartBlocks(storedEmployee).map((item) => [item.id, item]))
      for (const indicator of employee.indicators) {
        if (!isSmartBlock(indicator)) continue
        const known = new Map(tasksOf(beforeBlocks.get(indicator.id)).map((task) => [task.id, task]))
        const seen = new Set<string>()
        for (const raw of indicator.tasks) {
          if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !isSmartStatus(raw.status)) {
            return 'Некорректная smart-задача.'
          }
          if (seen.has(raw.id)) return 'Некорректная smart-задача.'
          seen.add(raw.id)
          const prior = known.get(raw.id)
          if (!prior) {
            const expected = newSmartStatus(actor, identity)
            if (raw.status !== expected) return newTaskStatusError(expected)
            continue
          }
          const from = storedStatus(prior)
          if (from !== raw.status && !canChangeStatus(actor, identity, from, raw.status)) {
            return statusChangeError(from, raw.status)
          }
        }
      }
    }
  }
  return null
}

function employeeManagerId(employee: Employee) {
  return typeof employee.managerId === 'string' ? employee.managerId : null
}

function smartBlocks(employee: Employee | undefined) {
  if (!employee || !Array.isArray(employee.indicators)) return []
  return employee.indicators.filter(isSmartBlock)
}

function isSmartBlock(indicator: { type?: unknown; tasks?: unknown; id?: unknown }): indicator is SmartIndicator {
  return indicator?.type === 'smart' && typeof indicator.id === 'string' && Array.isArray(indicator.tasks)
}

function tasksOf(indicator: SmartIndicator | undefined) {
  return indicator?.tasks ?? []
}

function storedStatus(task: SmartTask & { progress?: unknown }): SmartStatus {
  if (isSmartStatus(task.status)) return task.status
  if (typeof task.progress === 'number' && task.progress >= 100) return 'closed'
  if (typeof task.progress === 'number' && task.progress > 0) return 'in_progress'
  return 'created'
}
