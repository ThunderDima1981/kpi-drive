import { describe, expect, it } from 'vitest'
import { defaultSmartPoints } from './smart.ts'
import { moveSmartTask, nextPeriodId, publishPeriods } from './period.ts'
import { canChangeStatus, canMoveSmart, newSmartStatus, smartChangeError, type SmartActor } from './smart-access.ts'
import type { SmartTask, TeamData } from '../types.ts'

const employee: SmartActor = { role: 'user', employeeId: 'person' }
const manager: SmartActor = { role: 'user', employeeId: 'boss' }
const admin: SmartActor = { role: 'admin', employeeId: 'admin-person' }
const stranger: SmartActor = { role: 'user', employeeId: 'other' }
const matrix = { id: 'person', managerId: 'boss' }

function task(status: SmartTask['status'], id = 'task', name = 'Задача'): SmartTask {
  return {
    id,
    name,
    weight: 40,
    detail: 'Как делать',
    criterion: 'Готово',
    status,
    comments: [{ id: 'c1', text: 'Уточнение', createdAt: '2026-10-09T00:00:00.000Z' }],
  }
}

function team(status: SmartTask['status'] = 'created', extra?: SmartTask): TeamData {
  return publishPeriods(
    [
      {
        id: '2026-10',
        kpiCatalog: [],
        employees: [
          {
            id: 'person',
            name: 'Сотрудник',
            position: 'Роль',
            managerId: 'boss',
            indicators: [
              {
                id: 'smart',
                type: 'smart',
                weight: 30,
                points: defaultSmartPoints(),
                tasks: extra ? [task(status), extra] : [task(status)],
              },
            ],
          },
        ],
      },
    ],
    '2026-10',
  )
}

function withStatus(source: TeamData, status: SmartTask['status'], id = 'task') {
  const next = structuredClone(source)
  const smart = next.periods[0]?.employees[0]?.indicators[0]
  if (smart?.type !== 'smart') throw new Error('missing smart')
  const item = smart.tasks.find((task) => task.id === id)
  if (!item) throw new Error('missing task')
  item.status = status
  next.employees = next.periods[0]!.employees
  return next
}

describe('smart status rules', () => {
  it('creates a task as created for the employee and in progress for the manager or administrator', () => {
    expect(newSmartStatus(employee, matrix)).toBe('created')
    expect(newSmartStatus(admin, { id: 'admin-person', managerId: 'boss' })).toBe('created')
    expect(newSmartStatus(manager, matrix)).toBe('in_progress')
    expect(newSmartStatus(admin, matrix)).toBe('in_progress')
    expect(newSmartStatus(stranger, matrix)).toBe('created')
  })

  it('allows only the direct manager or an administrator to start work', () => {
    expect(canChangeStatus(employee, matrix, 'created', 'in_progress')).toBe(false)
    expect(canChangeStatus(stranger, matrix, 'created', 'in_progress')).toBe(false)
    expect(canChangeStatus(manager, matrix, 'created', 'in_progress')).toBe(true)
    expect(canChangeStatus(admin, matrix, 'created', 'in_progress')).toBe(true)
  })

  it('lets the employee, manager and administrator mark in-progress work done', () => {
    expect(canChangeStatus(employee, matrix, 'in_progress', 'done')).toBe(true)
    expect(canChangeStatus(manager, matrix, 'in_progress', 'done')).toBe(true)
    expect(canChangeStatus(admin, matrix, 'in_progress', 'done')).toBe(true)
    expect(canChangeStatus(stranger, matrix, 'in_progress', 'done')).toBe(false)
    expect(canChangeStatus(employee, matrix, 'created', 'done')).toBe(false)
  })

  it('lets only the direct manager close a finished task', () => {
    expect(canChangeStatus(manager, matrix, 'done', 'closed')).toBe(true)
    expect(canChangeStatus(employee, matrix, 'done', 'closed')).toBe(false)
    expect(canChangeStatus(admin, matrix, 'done', 'closed')).toBe(false)
    expect(canChangeStatus(manager, matrix, 'in_progress', 'closed')).toBe(false)
    expect(canChangeStatus(manager, matrix, 'created', 'closed')).toBe(false)
  })

  it('rejects an administrator closing a task and accepts a legal start', () => {
    expect(smartChangeError(team('done'), withStatus(team('done'), 'closed'), admin)).toBe(
      'Статус «Закрыт» ставит только руководитель сотрудника.',
    )
    expect(smartChangeError(team(), withStatus(team(), 'in_progress'), admin)).toBeNull()
    expect(smartChangeError(team(), withStatus(team(), 'in_progress'), employee)).toBe(
      'В статус «В работе» смарт переводит руководитель или администратор.',
    )
  })

  it('requires a new task to use the status of the person who creates it', () => {
    const incoming = withStatus(team(), 'created')
    const smart = incoming.periods[0]?.employees[0]?.indicators[0]
    if (smart?.type !== 'smart') throw new Error('missing smart')
    smart.tasks.push(task('in_progress', 'fresh', 'Новая'))
    expect(smartChangeError(team(), incoming, employee)).toBe('Сотрудник создаёт смарт со статусом «Создан».')
    smart.tasks[1] = task('created', 'fresh', 'Новая')
    expect(smartChangeError(team(), incoming, employee)).toBeNull()
    smart.tasks[1] = task('in_progress', 'fresh', 'Новая')
    expect(smartChangeError(team(), incoming, manager)).toBeNull()
  })
})

describe('move smart task to the next month', () => {
  it('rolls December into January of the next year', () => {
    expect(nextPeriodId('2026-10')).toBe('2026-11')
    expect(nextPeriodId('2026-12')).toBe('2027-01')
    expect(nextPeriodId('year')).toBeNull()
  })

  it('moves the task into the next month and leaves the current month and its other tasks', () => {
    const source = team('in_progress', task('created', 'stay', 'Остаётся'))
    const moved = moveSmartTask(source, 'person', 'task', '2026-10')
    if (!('team' in moved)) throw new Error(moved.error)
    expect(moved.team.currentPeriod).toBe('2026-10')
    const october = moved.team.periods.find((period) => period.id === '2026-10')
    const november = moved.team.periods.find((period) => period.id === '2026-11')
    const octoberSmart = october?.employees[0]?.indicators[0]
    const novemberSmart = november?.employees[0]?.indicators[0]
    expect(octoberSmart?.type === 'smart' ? octoberSmart.tasks.map((item) => item.name) : []).toEqual(['Остаётся'])
    expect(novemberSmart?.type === 'smart' ? novemberSmart.tasks.map((item) => item.status) : []).toEqual(['in_progress'])
    const copy = novemberSmart?.type === 'smart' ? novemberSmart.tasks[0] : null
    expect(copy?.id).not.toBe('task')
    expect(copy?.name).toBe('Задача')
    expect(copy?.detail).toBe('Как делать')
    expect(copy?.comments[0]?.text).toBe('Уточнение')
    expect(source.periods).toHaveLength(1)
  })

  it('moves a December task into January without changing the open month', () => {
    const source = team('done')
    source.periods[0]!.id = '2026-12'
    source.currentPeriod = '2026-12'
    source.periodLabel = 'Декабрь 2026'
    const moved = moveSmartTask(source, 'person', 'task', '2026-12')
    if (!('team' in moved)) throw new Error(moved.error)
    expect(moved.team.currentPeriod).toBe('2026-12')
    const january = moved.team.periods.find((period) => period.id === '2027-01')
    const smart = january?.employees[0]?.indicators[0]
    expect(smart?.type === 'smart' ? smart.tasks[0]?.status : null).toBe('done')
  })

  it('refuses a closed task and a next month that has no smart block', () => {
    expect(moveSmartTask(team('closed'), 'person', 'task', '2026-10')).toEqual({
      error: 'Закрытый смарт не переносится на следующий месяц.',
    })
    const source = team()
    const next = structuredClone(source.periods[0]!)
    next.id = '2026-11'
    next.employees[0]!.indicators = []
    source.periods.push(next)
    expect(moveSmartTask(source, 'person', 'task', '2026-10')).toEqual({
      error: 'В следующем месяце нет блока smart-задач. Администратор должен добавить блок.',
    })
  })

  it('lets only the direct manager move a task to the next month', () => {
    expect(canMoveSmart(manager, matrix)).toBe(true)
    expect(canMoveSmart({ role: 'admin', employeeId: 'boss' }, matrix)).toBe(true)
    expect(canMoveSmart(employee, matrix)).toBe(false)
    expect(canMoveSmart(admin, matrix)).toBe(false)
    expect(canMoveSmart(stranger, matrix)).toBe(false)
  })
})
