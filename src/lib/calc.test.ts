import { describe, expect, it } from 'vitest'
import { createSeed } from '../data/seed.ts'
import {
  completionOf,
  explainKpi,
  explainStandard,
  kpiCompletion,
  kpiCompletionOf,
  matrixResult,
  normalizeEvaluatorId,
  planPoint,
  pointsFromLegacyScale,
  scaleOrderIssue,
  standardSeries,
  weightedOf,
  type KpiScale,
} from './calc.ts'
import { collapseSmartIndicators, normalizeIndicator, smartCompletion } from './smart.ts'
import type { CatalogKpi } from '../types.ts'

function leads(fact: number, extra: Partial<KpiScale> = {}): KpiScale {
  return {
    threshold: 500,
    plan: 1000,
    maximum: 1200,
    fact,
    inverse: false,
    maxCap: 130,
    ...extra,
  }
}

function catalogFrom(id: string, scale: KpiScale, unit = 'шт'): CatalogKpi {
  return {
    id,
    name: 'Лиды',
    unit,
    fact: scale.fact,
    points: pointsFromLegacyScale(id, scale),
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

describe('shared kpi catalog', () => {
  it('keeps the classic threshold-plan-maximum scale as chart points', () => {
    expect(kpiCompletionOf(catalogFrom('kpi-leads', leads(900)))).toBe(kpiCompletion(leads(900)))
    expect(kpiCompletionOf(catalogFrom('kpi-leads', leads(499)))).toBe(0)
    expect(kpiCompletionOf(catalogFrom('kpi-leads', leads(1100)))).toBe(115)
    expect(kpiCompletionOf(catalogFrom('kpi-leads', leads(1400)))).toBe(130)
    const inverse = leads(320, { threshold: 400, plan: 300, maximum: 250, inverse: true })
    expect(kpiCompletionOf(catalogFrom('kpi-cpl', inverse, '₽'))).toBe(80)
    expect(planPoint(pointsFromLegacyScale('kpi-leads', leads(900)))?.value).toBe(1000)
  })

  it('uses one shared fact for every matrix that includes the indicator', () => {
    const seed = createSeed()
    const catalog = seed.kpiCatalog.map((item) => (item.id === 'kpi-leads' ? { ...item, fact: 1000 } : item))
    const ivanov = seed.employees.find((employee) => employee.id === 'emp-ivanov')
    const leads = ivanov?.indicators.find((item) => item.type === 'kpi' && item.catalogId === 'kpi-leads')
    expect(completionOf(leads!, catalog)).toBe(100)
    expect(seed.kpiCatalog.find((item) => item.id === 'kpi-leads')?.fact).toBe(900)
  })
})

describe('matrixResult', () => {
  it('calculates Ivanov exactly as the weighted sum of the demo matrix', () => {
    const seed = createSeed()
    const ivanov = seed.employees.find((employee) => employee.id === 'emp-ivanov')
    expect(ivanov).toBeDefined()
    const result = matrixResult(ivanov!.indicators, seed.kpiCatalog)
    expect(result.weightSum).toBe(100)
    expect(completionOf(ivanov!.indicators[0]!, seed.kpiCatalog)).toBe(80)
    expect(weightedOf(ivanov!.indicators[0]!, seed.kpiCatalog)).toBe(32)
    expect(completionOf(ivanov!.indicators[1]!, seed.kpiCatalog)).toBe(80)
    expect(weightedOf(ivanov!.indicators[1]!, seed.kpiCatalog)).toBe(16)
    expect(completionOf(ivanov!.indicators[2]!, seed.kpiCatalog)).toBe(0)
    expect(weightedOf(ivanov!.indicators[2]!, seed.kpiCatalog)).toBe(0)
    expect(completionOf(ivanov!.indicators[3]!, seed.kpiCatalog)).toBe(100)
    expect(weightedOf(ivanov!.indicators[3]!, seed.kpiCatalog)).toBe(10)
    expect(result.kr).toBe(58)
    expect(result.byType).toEqual({ kpi: 48, smart: 0, standard: 10 })
  })

  it('keeps every demo matrix at 100% weight', () => {
    const seed = createSeed()
    for (const employee of seed.employees) {
      expect(matrixResult(employee.indicators, seed.kpiCatalog).weightSum).toBe(100)
    }
  })

  it('places the demo team into the expected zones', () => {
    const seed = createSeed()
    const results = Object.fromEntries(
      seed.employees.map((employee) => [employee.id, matrixResult(employee.indicators, seed.kpiCatalog).kr]),
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

  it('turns a saved progress value into a task status', () => {
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
    expect(closed).toMatchObject({
      weight: 10,
      tasks: [{ status: 'closed', weight: 100, detail: '', comments: [] }],
    })
    expect(started).toMatchObject({ tasks: [{ status: 'in_progress' }] })
  })

  it('lets each task weight change the smart block completion', () => {
    const block = {
      id: 'smart',
      type: 'smart' as const,
      weight: 30,
      tasks: [
        { id: 'a', name: 'A', weight: 60, detail: '', criterion: '', status: 'closed' as const, comments: [] },
        { id: 'b', name: 'B', weight: 40, detail: '', criterion: '', status: 'done' as const, comments: [] },
      ],
    }
    expect(completionOf(block)).toBe(60)
    expect(weightedOf(block)).toBe(18)
  })

  it('folds several matrix smart rows into one block and keeps the same KR contribution', () => {
    const collapsed = collapseSmartIndicators([
      normalizeIndicator({ id: 'a', type: 'smart', name: 'A', weight: 30, status: 'closed' } as never),
      normalizeIndicator({ id: 'b', type: 'smart', name: 'B', weight: 20, status: 'in_progress' } as never),
    ])
    expect(collapsed).toHaveLength(1)
    const smart = collapsed[0]
    expect(smart?.type).toBe('smart')
    if (smart?.type !== 'smart') return
    expect(smart.weight).toBe(50)
    expect(smart.tasks.map((task) => task.weight)).toEqual([60, 40])
    expect(weightedOf(smart)).toBe(30)
  })
})

describe('scale checks', () => {
  it('rejects a direct scale that is ordered backwards', () => {
    expect(scaleOrderIssue(leads(900, { threshold: 400, plan: 300, maximum: 250 }))).toMatch(/порог/)
    expect(scaleOrderIssue(leads(320, { threshold: 400, plan: 300, maximum: 250, inverse: true }))).toBeNull()
  })

  it('explains a shared KPI from its chart points', () => {
    expect(explainKpi(catalogFrom('kpi-leads', leads(900)))).toMatch(/80%/)
    expect(explainKpi(catalogFrom('kpi-leads', leads(900)))).toMatch(/План/)
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
