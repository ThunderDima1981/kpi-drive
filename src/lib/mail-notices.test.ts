import { describe, expect, it } from 'vitest'
import { smartLetters } from './mail-notices.ts'
import { moveSmartTask, publishPeriods } from './period.ts'
import { defaultSmartPoints } from './smart.ts'
import type { SmartActor } from './smart-access.ts'
import type { SmartStatus, SmartTask, TeamData } from '../types.ts'

const employee: SmartActor = { role: 'user', employeeId: 'person' }
const manager: SmartActor = { role: 'user', employeeId: 'boss' }

function task(status: SmartStatus, id = 'task'): SmartTask {
  return { id, name: 'Отчёт', weight: 40, detail: '', criterion: '', status, comments: [] }
}

function team(status: SmartStatus, tasks = [task(status)]): TeamData {
  return publishPeriods(
    [
      {
        id: '2026-10',
        kpiCatalog: [],
        employees: [
          { id: 'boss', name: 'Павел Орлов', position: 'Руководитель', managerId: null, indicators: [] },
          {
            id: 'person',
            name: 'Ирина Соколова',
            position: 'Специалист',
            managerId: 'boss',
            indicators: [{ id: 'smart', type: 'smart', weight: 30, points: defaultSmartPoints(), tasks }],
          },
        ],
      },
    ],
    '2026-10',
  )
}

describe('smart mail', () => {
  it('tells the employee and the manager when the employee creates a task', () => {
    const letters = smartLetters(team('created', []), team('created'), employee)
    expect(letters.map((letter) => letter.toEmployeeId)).toEqual(['person', 'boss'])
    expect(letters[0]?.subject).toContain('Вы создали')
    expect(letters[1]?.text).toContain('Ирина Соколова')
  })

  it('tells the employee and the manager when the manager creates the task', () => {
    const letters = smartLetters(team('in_progress', []), team('in_progress'), manager)
    expect(letters.map((letter) => letter.toEmployeeId)).toEqual(['person', 'boss'])
    expect(letters[0]?.text).toBe(
      'Вам создана smart-задача «Отчёт» в матрице за Октябрь 2026. Создал: Павел Орлов. Статус: В работе.',
    )
    expect(letters[1]?.subject).toContain('сотруднику Ирина Соколова')
  })

  it('tells the manager about a status change and the employee when the manager closes it', () => {
    const letters = smartLetters(team('done'), team('closed'), manager)
    expect(letters.map((letter) => [letter.toEmployeeId, letter.subject])).toEqual([
      ['boss', 'Изменился статус smart-задачи «Отчёт»'],
      ['person', 'Руководитель закрыл smart-задачу «Отчёт»'],
    ])
    expect(letters[1]?.text).toContain('Павел Орлов')
  })

  it('does not treat a move to the next month as a new task', () => {
    const moved = moveSmartTask(team('in_progress'), 'person', 'task', '2026-10')
    if ('error' in moved) throw new Error(moved.error)
    expect(smartLetters(team('in_progress'), moved.team, manager)).toEqual([])
  })
})
