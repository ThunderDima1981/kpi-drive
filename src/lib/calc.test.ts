import { describe, expect, it } from 'vitest'
import { createSeed } from '../data/seed.ts'
import {
  completionOf,
  explainKpi,
  explainStandard,
  kpiCompletion,
  matrixResult,
  normalizeEvaluatorId,
  scaleOrderIssue,
  standardSeries,
  weightedOf,
} from './calc.ts'
import { normalizeIndicator, smartCompletion } from './smart.ts'
import type { KpiIndicator } from '../types.ts'

function leads(fact: number, extra: Partial<KpiIndicator> = {}): KpiIndicator {
  return {
    id: 'kpi',
    type: 'kpi',
    name: 'Лиды',
    weight: 40,
    threshold: 500,
    plan: 1000,
    maximum: 1200,
    fact,
    inverse: false,
    maxCap: 130,
    unit: 'шт',
    ...extra,
  }
}

describe('kpiCompletion', () => {
  it('zeroes a direct KPI below the threshold', () => {
    expect(kpiCompletion(leads(499))).toBe(0)
    expect(kpiCompletion(leads(500))).toBe(0)
  })

  it('interpolates a direct KPI between threshold and plan', () => {
    expect(kpiCompletion(leads(900))).toBe(80)
    expect(kpiCompletion(leads(1000))).toBe(100)
  })

  it('interpolates overperformance up to the cap', () => {
    expect(kpiCompletion(leads(1100))).toBe(115)
    expect(kpiCompletion(leads(1200))).toBe(130)
    expect(kpiCompletion(leads(1400))).toBe(130)
  })

  it('uses a custom cap', () => {
    expect(kpiCompletion(leads(1200, { maxCap: 150 }))).toBe(150)
    expect(kpiCompletion(leads(1100, { maxCap: 150 }))).toBe(125)
  })

  it('scores an inverse KPI from the expensive side toward the cheap side', () => {
    const cpl = leads(320, {
      threshold: 400,
      plan: 300,
      maximum: 250,
      inverse: true,
      unit: '₽',
    })
    expect(kpiCompletion(cpl)).toBe(80)
    expect(kpiCompletion({ ...cpl, fact: 400 })).toBe(0)
    expect(kpiCompletion({ ...cpl, fact: 450 })).toBe(0)
    expect(kpiCompletion({ ...cpl, fact: 300 })).toBe(100)
    expect(kpiCompletion({ ...cpl, fact: 270 })).toBe(118)
    expect(kpiCompletion({ ...cpl, fact: 250 })).toBe(130)
    expect(kpiCompletion({ ...cpl, fact: 200 })).toBe(130)
  })
})

describe('matrixResult', () => {
  it('calculates Ivanov exactly as the weighted sum of the demo matrix', () => {
    const ivanov = createSeed().employees.find((employee) => employee.id === 'emp-ivanov')
    expect(ivanov).toBeDefined()
    const result = matrixResult(ivanov!.indicators)
    expect(result.weightSum).toBe(100)
    expect(completionOf(ivanov!.indicators[0]!)).toBe(80)
    expect(weightedOf(ivanov!.indicators[0]!)).toBe(32)
    expect(completionOf(ivanov!.indicators[1]!)).toBe(80)
    expect(weightedOf(ivanov!.indicators[1]!)).toBe(16)
    expect(completionOf(ivanov!.indicators[2]!)).toBe(0)
    expect(weightedOf(ivanov!.indicators[2]!)).toBe(0)
    expect(completionOf(ivanov!.indicators[3]!)).toBe(100)
    expect(weightedOf(ivanov!.indicators[3]!)).toBe(10)
    expect(result.kr).toBe(58)
    expect(result.byType).toEqual({ kpi: 48, smart: 0, standard: 10 })
  })

  it('keeps every demo matrix at 100% weight', () => {
    for (const employee of createSeed().employees) {
      expect(matrixResult(employee.indicators).weightSum).toBe(100)
    }
  })

  it('places the demo team into the expected zones', () => {
    const results = Object.fromEntries(
      createSeed().employees.map((employee) => [employee.id, matrixResult(employee.indicators).kr]),
    )
    expect(results['emp-petrova']).toBeCloseTo(109.75)
    expect(results['emp-sidorov']).toBeCloseTo(14.5)
    expect(results['emp-kozlova']).toBeCloseTo(76.875)
    expect(results['emp-volkov']).toBeCloseTo(115.107142, 4)
  })
})

describe('smart tasks', () => {
  it('counts only a closed task as complete', () => {
    expect(smartCompletion('closed')).toBe(100)
    expect(smartCompletion('created')).toBe(0)
    expect(smartCompletion('in_progress')).toBe(0)
    expect(smartCompletion('done')).toBe(0)
  })

  it('turns a saved progress value into a status', () => {
    const closed = normalizeIndicator({
      id: 's',
      type: 'smart',
      name: 'Задача',
      weight: 10,
      progress: 100,
    } as never)
    const started = normalizeIndicator({
      id: 's2',
      type: 'smart',
      name: 'Задача',
      weight: 10,
      progress: 80,
    } as never)
    expect(closed).toMatchObject({ status: 'closed', detail: '', comments: [] })
    expect(started).toMatchObject({ status: 'in_progress' })
  })
})

describe('scale checks', () => {
  it('rejects a direct scale that is ordered backwards', () => {
    expect(scaleOrderIssue(leads(900, { threshold: 400, plan: 300, maximum: 250 }))).toMatch(/порог/)
    expect(scaleOrderIssue(leads(320, { threshold: 400, plan: 300, maximum: 250, inverse: true }))).toBeNull()
  })

  it('explains the Ivanov lead fact in plain language', () => {
    expect(explainKpi(leads(900))).toMatch(/порогом и планом/)
  })
})

describe('standard scale', () => {
  const deadlines = createSeed().employees[0]?.indicators.find((item) => item.id === 'std-deadlines')

  it('maps each default score to a point on the completion line', () => {
    expect(deadlines?.type).toBe('standard')
    if (deadlines?.type !== 'standard') return
    expect(standardSeries(deadlines).map((point) => point.completion)).toEqual([0, 70, 100, 115, 130])
    expect(standardSeries({ ...deadlines, score: 1 }).find((point) => point.marker)?.score).toBe(1)
    expect(explainStandard({ ...deadlines, score: -1 })).toMatch(/70%/)
    expect(explainStandard(deadlines)).toMatch(/100%/)
  })

  it('uses a custom point completion', () => {
    expect(deadlines?.type).toBe('standard')
    if (deadlines?.type !== 'standard') return
    const custom = {
      ...deadlines,
      score: 0,
      points: deadlines.points.map((point) => (point.score === 0 ? { ...point, completion: 80 } : point)),
    }
    expect(completionOf(custom)).toBe(80)
    expect(completionOf({ ...custom, score: -0.5 })).toBe(75)
  })

  it('assigns an evaluator from the team', () => {
    const ids = new Set(['emp-ivanov', 'emp-sidorov', 'emp-petrova'])
    expect(normalizeEvaluatorId('emp-petrova', ids, 'emp-ivanov')).toBe('emp-petrova')
    expect(normalizeEvaluatorId(undefined, ids, 'emp-ivanov')).toBe('emp-ivanov')
    expect(normalizeEvaluatorId(null, ids, 'emp-ivanov')).toBe(null)
    expect(normalizeEvaluatorId('missing', ids, 'emp-ivanov')).toBe('emp-ivanov')
    expect(normalizeEvaluatorId('missing', ids, null)).toBe(null)
    const sidorov = createSeed().employees.find((employee) => employee.id === 'emp-sidorov')
    const comms = sidorov?.indicators.find((item) => item.id === 'std-comms')
    expect(comms?.type === 'standard' ? comms.evaluatorId : null).toBe('emp-ivanov')
    const ivanov = createSeed().employees[0]?.indicators.find((item) => item.id === 'std-deadlines')
    expect(ivanov?.type === 'standard' ? ivanov.evaluatorId : null).toBe('emp-petrova')
  })
})
