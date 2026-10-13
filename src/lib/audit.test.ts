import { describe, expect, it } from 'vitest'
import { defaultStandardPoints } from './calc.ts'
import { publishPeriods } from './period.ts'
import { defaultSmartPoints } from './smart.ts'
import { describeTeamChanges, mergeDetails } from './audit.ts'
import type { Employee, TeamData } from '../types.ts'

function person(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'anna',
    name: 'Анна',
    position: 'Менеджер',
    managerId: null,
    indicators: [
      {
        id: 'smart',
        type: 'smart',
        weight: 30,
        points: defaultSmartPoints(),
        tasks: [{ id: 't1', name: 'Отчёт', weight: 40, detail: '', criterion: '', status: 'created', comments: [] }],
      },
      { id: 'std', type: 'standard', name: 'Срок', weight: 10, score: 0, points: defaultStandardPoints(), evaluatorId: null },
    ],
    ...overrides,
  }
}

function team(employees: Employee[], periods = ['2026-10']): TeamData {
  return publishPeriods(
    periods.map((id) => ({ id, employees, kpiCatalog: [{ id: 'k', name: 'Выручка', unit: '₽', fact: 10, points: [] }] })),
    periods[0],
  )
}

describe('describeTeamChanges', () => {
  it('ignores identical documents and plain period switches', () => {
    const before = team([person()], ['2026-10', '2026-11'])
    expect(describeTeamChanges(before, { ...before, currentPeriod: '2026-11' })).toEqual([])
  })

  it('names added, removed and renamed employees', () => {
    const before = team([person(), person({ id: 'boris', name: 'Борис' })])
    const after = team([person({ name: 'Анна Петрова' }), person({ id: 'vera', name: 'Вера' })])
    expect(describeTeamChanges(before, after)).toEqual([
      'Сотрудник «Анна» переименован в «Анна Петрова»',
      'Добавлен сотрудник «Вера»',
      'Удалён сотрудник «Борис»',
    ])
  })

  it('describes indicator, smart status and fact changes', () => {
    const before = team([person()])
    const changed = person()
    const smart = changed.indicators[0]
    const standard = changed.indicators[1]
    if (smart.type !== 'smart' || standard.type !== 'standard') throw new Error('fixture')
    changed.indicators = [
      { ...smart, tasks: [{ ...smart.tasks[0], status: 'in_progress', comments: [{ id: 'c', text: 'Готово', createdAt: '' }] }] },
      { ...standard, weight: 20, score: 1 },
    ]
    const after = team([changed])
    after.periods[0].kpiCatalog[0].fact = 15
    expect(describeTeamChanges(before, after)).toEqual([
      'Показатель «Выручка»: факт 10 → 15',
      'Анна: смарт «Отчёт»: Создан → В работе',
      'Анна: смарт «Отчёт»: добавлен комментарий',
      'Анна: вес «Срок» 10% → 20%',
      'Анна: оценка «Срок» 0 → 1',
    ])
  })

  it('prefixes lines with the month when there are several periods', () => {
    const before = team([person()], ['2026-10', '2026-11'])
    const after = team([person({ position: 'Директор' })], ['2026-10', '2026-11'])
    after.periods[1] = before.periods[1]
    expect(describeTeamChanges(before, after)).toEqual(['Октябрь 2026: Анна: должность «Директор»'])
  })

  it('reports opened periods', () => {
    expect(describeTeamChanges(team([person()]), team([person()], ['2026-10', '2026-11']))).toEqual([
      'Открыт период «Ноябрь 2026»',
    ])
  })
})

describe('mergeDetails', () => {
  it('moves repeated lines to the end and caps the list', () => {
    expect(mergeDetails(['a', 'b'], ['a', 'c'])).toEqual(['b', 'a', 'c'])
    const many = Array.from({ length: 50 }, (_, index) => String(index))
    expect(mergeDetails([], many)).toHaveLength(40)
    expect(mergeDetails([], many).at(-1)).toBe('49')
  })
})
