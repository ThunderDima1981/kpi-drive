import { describe, expect, it } from 'vitest'
import { defaultStandardPoints } from './calc.ts'
import { publishPeriods } from './period.ts'
import { defaultSmartPoints } from './smart.ts'
import { userChangeAllowed } from './access.ts'
import type { SmartTask, TeamData } from '../types.ts'

function task(status: SmartTask['status'], id = 'task'): SmartTask {
  return { id, name: 'Задача', weight: 40, detail: '', criterion: '', status, comments: [] }
}

function team(status: SmartTask['status'] = 'created'): TeamData {
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
            managerId: null,
            indicators: [
              {
                id: 'smart',
                type: 'smart',
                weight: 30,
                points: defaultSmartPoints(),
                tasks: [task(status)],
              },
              {
                id: 'std',
                type: 'standard',
                name: 'Срок',
                weight: 10,
                score: 0,
                points: defaultStandardPoints(),
                evaluatorId: null,
              },
            ],
          },
        ],
      },
    ],
    '2026-10',
  )
}

describe('user permissions', () => {
  it('allows a new smart task and the done status', () => {
    const before = team()
    const after = structuredClone(before)
    const smart = after.employees[0]?.indicators.find((item) => item.type === 'smart')
    if (smart?.type !== 'smart') throw new Error('missing smart')
    smart.tasks[0]!.status = 'done'
    smart.tasks.push({ ...task('created', 'next'), name: 'Вторая' })
    after.periods = after.periods.map((period) =>
      period.id === after.currentPeriod ? { ...period, employees: after.employees, kpiCatalog: after.kpiCatalog } : period,
    )
    expect(userChangeAllowed(before, after)).toBe(true)
  })

  it('rejects closing a task, editing a standard, and opening settings data', () => {
    const closed = structuredClone(team('done'))
    const smart = closed.employees[0]?.indicators.find((item) => item.type === 'smart')
    if (smart?.type !== 'smart') throw new Error('missing smart')
    smart.tasks[0]!.status = 'closed'
    closed.periods[0]!.employees = closed.employees
    expect(userChangeAllowed(team('done'), closed)).toBe(false)

    const scored = structuredClone(team())
    const standard = scored.employees[0]?.indicators.find((item) => item.type === 'standard')
    if (standard?.type !== 'standard') throw new Error('missing standard')
    standard.score = 2
    scored.periods[0]!.employees = scored.employees
    expect(userChangeAllowed(team(), scored)).toBe(false)
  })

  it('allows a comment on a new task and rejects one on an existing task', () => {
    const created = structuredClone(team())
    const smart = created.employees[0]?.indicators.find((item) => item.type === 'smart')
    if (smart?.type !== 'smart') throw new Error('missing smart')
    smart.tasks.push({
      ...task('created', 'next'),
      comments: [{ id: 'c1', text: 'Уточнение', createdAt: '2026-10-09T00:00:00.000Z' }],
    })
    created.periods[0]!.employees = created.employees
    expect(userChangeAllowed(team(), created)).toBe(true)

    const commented = structuredClone(team())
    const existing = commented.employees[0]?.indicators.find((item) => item.type === 'smart')
    if (existing?.type !== 'smart') throw new Error('missing smart')
    existing.tasks[0]!.comments = [{ id: 'c1', text: 'Позже', createdAt: '2026-10-09T00:00:00.000Z' }]
    commented.periods[0]!.employees = commented.employees
    expect(userChangeAllowed(team(), commented)).toBe(false)
  })
})
