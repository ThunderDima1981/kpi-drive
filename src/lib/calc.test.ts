import { describe, expect, it } from 'vitest'
import {
  completionOf,
  defaultStandardPoints,
  explainKpi,
  explainSmart,
  explainStandard,
  fitsMatrixWeight,
  kpiCompletion,
  kpiCompletionOf,
  matrixResult,
  normalizeEvaluatorId,
  planPoint,
  pointsFromLegacyScale,
  pointsWithPlan,
  scaleOrderIssue,
  standardSeries,
  weightedOf,
  type KpiScale,
} from './calc.ts'
import { collapseSmartIndicators, defaultSmartPoints, normalizeIndicator, smartCompletion, smartGroupCompletion } from './smart.ts'
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

  it('moves the 100% point when the catalog plan changes', () => {
    const points = pointsFromLegacyScale('kpi-leads', leads(900))
    const moved = pointsWithPlan(points, 1100)
    expect('points' in moved && planPoint(moved.points)?.value).toBe(1100)
    expect(pointsWithPlan(points, 500)).toMatchObject({ error: expect.stringMatching(/шкале/) })
  })

  it('reads the fact from the catalog passed into the calculation', () => {
    const catalog = [catalogFrom('kpi-leads', leads(900))]
    const indicator = { id: 'row', type: 'kpi' as const, catalogId: 'kpi-leads', weight: 40 }
    const updated = catalog.map((item) => (item.id === 'kpi-leads' ? { ...item, fact: 1000 } : item))
    expect(completionOf(indicator, updated)).toBe(100)
    expect(weightedOf(indicator, updated)).toBe(40)
    expect(catalog[0]?.fact).toBe(900)
    expect(matrixResult([indicator], updated)).toMatchObject({ kr: 40, weightSum: 40, byType: { kpi: 40, smart: 0, standard: 0 } })
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
      points: defaultSmartPoints(),
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

  it('turns a smart completion above 100% into influence on the matrix weight', () => {
    const block = {
      id: 'smart',
      type: 'smart' as const,
      weight: 30,
      points: defaultSmartPoints(),
      tasks: [
        { id: 'a', name: 'A', weight: 150, detail: '', criterion: '', status: 'closed' as const, comments: [] },
      ],
    }
    expect(smartGroupCompletion(block)).toBe(150)
    expect(completionOf(block)).toBe(115)
    expect(weightedOf(block)).toBe(34.5)
    expect(explainSmart(block)).toMatch(/115%/)
  })

  it('keeps a matrix weight at or below 100%', () => {
    const indicators = [
      { id: 'kpi', weight: 70 },
      { id: 'smart', weight: 30 },
    ]
    expect(fitsMatrixWeight(indicators, 'smart', 30)).toBe(true)
    expect(fitsMatrixWeight(indicators, 'smart', 20)).toBe(true)
    expect(fitsMatrixWeight(indicators, 'smart', 31)).toBe(false)
    expect(fitsMatrixWeight([{ id: 'kpi', weight: 80 }], undefined, 20)).toBe(true)
    expect(fitsMatrixWeight([{ id: 'kpi', weight: 80 }], undefined, 21)).toBe(false)
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
  const deadlines = {
    id: 'std',
    type: 'standard' as const,
    name: 'Сроки',
    weight: 10,
    score: 0,
    points: defaultStandardPoints(),
    evaluatorId: null,
  }

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
  })
})
