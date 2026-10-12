import { describe, expect, it } from 'vitest'
import { applyEvaluation, evaluationItems, hasEvaluations } from './evaluations.ts'
import { defaultStandardPoints } from './calc.ts'
import { publishPeriods } from './period.ts'
import type { TeamData } from '../types.ts'

function team(): TeamData {
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
            indicators: [
              {
                id: 'discipline',
                type: 'standard',
                name: 'Дисциплина',
                weight: 10,
                score: 0,
                points: defaultStandardPoints(),
                evaluatorId: 'boss',
              },
              {
                id: 'self',
                type: 'standard',
                name: 'Самооценка',
                weight: 5,
                score: 0,
                points: defaultStandardPoints(),
                evaluatorId: 'person',
              },
            ],
          },
        ],
      },
    ],
    '2026-10',
  )
}

describe('evaluations', () => {
  it('lists standards a person sets for someone else', () => {
    expect(hasEvaluations(team(), 'boss')).toBe(true)
    expect(hasEvaluations(team(), 'person')).toBe(false)
    expect(evaluationItems(team(), 'boss', '2026-10').map((item) => item.name)).toEqual(['Дисциплина'])
  })

  it('saves only a scale score on a standard the actor evaluates', () => {
    const saved = applyEvaluation(team(), 'boss', '2026-10', 'person', 'discipline', 2)
    if ('error' in saved) throw new Error(saved.error)
    const score = saved.team.periods[0]?.employees
      .find((employee) => employee.id === 'person')
      ?.indicators.find((indicator) => indicator.id === 'discipline')
    expect(score && 'score' in score ? score.score : null).toBe(2)
    expect(applyEvaluation(team(), 'person', '2026-10', 'person', 'self', 1)).toEqual({
      error: 'Оценивать можно только других сотрудников.',
    })
    const offScale = applyEvaluation(team(), 'boss', '2026-10', 'person', 'discipline', 3)
    expect('error' in offScale ? offScale.error : '').toContain('шкале')
  })
})
