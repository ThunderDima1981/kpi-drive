import { publishPeriods } from './period.ts'
import type { TeamData } from '../types.ts'

export type EvaluationItem = {
  employeeId: string
  employeeName: string
  position: string
  indicatorId: string
  name: string
  weight: number
  score: number
  points: { score: number; completion: number }[]
}

export function hasEvaluations(team: TeamData, evaluatorId: string | null) {
  if (!evaluatorId) return false
  return team.periods.some((period) => evaluationItems(team, evaluatorId, period.id).length > 0)
}

export function evaluationItems(team: TeamData, evaluatorId: string | null, periodId: string): EvaluationItem[] {
  if (!evaluatorId) return []
  const period = team.periods.find((item) => item.id === periodId)
  if (!period) return []
  return period.employees.flatMap((employee) => {
    if (employee.id === evaluatorId) return []
    return employee.indicators.flatMap((indicator) => {
      if (indicator.type !== 'standard' || indicator.evaluatorId !== evaluatorId) return []
      return [
        {
          employeeId: employee.id,
          employeeName: employee.name,
          position: employee.position,
          indicatorId: indicator.id,
          name: indicator.name,
          weight: indicator.weight,
          score: indicator.score,
          points: indicator.points
            .slice()
            .sort((a, b) => a.score - b.score)
            .map((point) => ({ score: point.score, completion: point.completion })),
        },
      ]
    })
  })
}

export function applyEvaluation(
  team: TeamData,
  evaluatorId: string | null,
  periodId: string,
  employeeId: string,
  indicatorId: string,
  score: number,
): { team: TeamData } | { error: string } {
  if (!evaluatorId) return { error: 'К учётной записи не привязан сотрудник.' }
  if (employeeId === evaluatorId) return { error: 'Оценивать можно только других сотрудников.' }
  const period = team.periods.find((item) => item.id === periodId)
  if (!period) return { error: 'Месяц не найден.' }
  const employee = period.employees.find((item) => item.id === employeeId)
  const indicator = employee?.indicators.find((item) => item.id === indicatorId)
  if (!employee || !indicator || indicator.type !== 'standard') return { error: 'Показатель не найден.' }
  if (indicator.evaluatorId !== evaluatorId) return { error: 'Этот показатель оценивает другой сотрудник.' }
  if (!indicator.points.some((point) => sameScore(point.score, score))) return { error: 'Такой оценки нет на шкале.' }
  const periods = team.periods.map((item) =>
    item.id === periodId
      ? {
          ...item,
          employees: item.employees.map((person) =>
            person.id === employeeId
              ? {
                  ...person,
                  indicators: person.indicators.map((current) =>
                    current.id === indicatorId && current.type === 'standard' ? { ...current, score } : current,
                  ),
                }
              : person,
          ),
        }
      : item,
  )
  return { team: publishPeriods(periods, team.currentPeriod) }
}

export function scoreLabel(score: number) {
  if (score > 0) return `+${score}`
  return String(score)
}

function sameScore(left: number, right: number) {
  return Math.abs(left - right) < 1e-6
}
