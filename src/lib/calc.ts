import { formatNumber } from './format.ts'
import { defaultSmartPoints, smartGroupCompletion } from './smart.ts'
import type { CatalogKpi, Indicator, KpiPoint, ScalePoint, SmartIndicator, StandardIndicator, StandardScore } from '../types.ts'

export const DEFAULT_MAX_CAP = 130

export const STANDARD_COMPLETION: Record<StandardScore, number> = {
  [-2]: 0,
  [-1]: 70,
  0: 100,
  1: 115,
  2: 130,
}

export interface KpiScale {
  threshold: number
  plan: number
  maximum: number
  fact: number
  inverse: boolean
  maxCap: number
}

function nearlyEqual(a: number, b: number) {
  const scale = Math.max(1, Math.abs(a), Math.abs(b))
  return Math.abs(a - b) <= 1e-6 * scale
}

export function kpiCompletion(input: KpiScale): number {
  const cap = Number.isFinite(input.maxCap) ? input.maxCap : DEFAULT_MAX_CAP
  const { threshold, plan, maximum, fact, inverse } = input
  if (![threshold, plan, maximum, fact, cap].every(Number.isFinite)) return 0
  if (nearlyEqual(fact, plan)) return 100

  if (!inverse) {
    if (fact < threshold) return 0
    if (fact < plan) {
      const span = plan - threshold
      if (span <= 0) return 0
      return ((fact - threshold) / span) * 100
    }
    const span = maximum - plan
    if (span <= 0 || fact >= maximum) return cap
    return 100 + ((fact - plan) / span) * (cap - 100)
  }

  if (fact > threshold) return 0
  if (fact > plan) {
    const span = threshold - plan
    if (span <= 0) return 0
    return ((threshold - fact) / span) * 100
  }
  const span = plan - maximum
  if (span <= 0 || fact <= maximum) return cap
  return 100 + ((plan - fact) / span) * (cap - 100)
}

export function pointsFromLegacyScale(id: string, input: KpiScale): KpiPoint[] {
  const cap = Number.isFinite(input.maxCap) ? input.maxCap : DEFAULT_MAX_CAP
  if (input.inverse) {
    return [
      { id: `${id}-max`, value: input.maximum, completion: cap },
      { id: `${id}-plan`, value: input.plan, completion: 100 },
      { id: `${id}-threshold`, value: input.threshold, completion: 0 },
    ]
  }
  return [
    { id: `${id}-threshold`, value: input.threshold, completion: 0 },
    { id: `${id}-plan`, value: input.plan, completion: 100 },
    { id: `${id}-max`, value: input.maximum, completion: cap },
  ]
}

export function defaultKpiPoints(prefix = 'kpi'): KpiPoint[] {
  return [
    { id: `${prefix}-0`, value: 0, completion: 0 },
    { id: `${prefix}-plan`, value: 100, completion: 100 },
    { id: `${prefix}-max`, value: 200, completion: 130 },
  ]
}

export function asScalePoints(points: KpiPoint[]): ScalePoint[] {
  return points.map((point) => ({ id: point.id, score: point.value, completion: point.completion }))
}

export function planPoint(points: KpiPoint[]): KpiPoint | null {
  return (
    points
      .filter((point) => Number.isFinite(point.value) && nearlyEqual(point.completion, 100))
      .slice()
      .sort((a, b) => a.value - b.value || a.id.localeCompare(b.id))[0] ?? null
  )
}

export function kpiCompletionOf(kpi: CatalogKpi): number {
  return completionOnScale(kpi.fact, asScalePoints(kpi.points))
}

export function normalizeKpiPoints(value: unknown, prefix = 'kpi'): KpiPoint[] {
  if (!Array.isArray(value)) return defaultKpiPoints(prefix)
  const points = value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const point = item as Partial<KpiPoint>
    if (!Number.isFinite(point.value) || !Number.isFinite(point.completion)) return []
    return [
      {
        id: typeof point.id === 'string' && point.id ? point.id : crypto.randomUUID(),
        value: point.value as number,
        completion: point.completion as number,
      },
    ]
  })
  return points.length >= 2 ? points : defaultKpiPoints(prefix)
}

export function normalizeCatalogKpi(value: unknown): CatalogKpi | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<CatalogKpi>
  if (typeof item.id !== 'string' || !item.id) return null
  return {
    id: item.id,
    name: typeof item.name === 'string' ? item.name : '',
    unit: typeof item.unit === 'string' ? item.unit : '',
    fact: Number.isFinite(item.fact) ? (item.fact as number) : 0,
    points: normalizeKpiPoints(item.points, item.id),
  }
}

export function defaultStandardPoints(): ScalePoint[] {
  return ([-2, -1, 0, 1, 2] as StandardScore[]).map((score) => ({
    id: `std-point-${score}`,
    score,
    completion: STANDARD_COMPLETION[score],
  }))
}

export function completionOnScale(score: number, points: ScalePoint[]) {
  const sorted = sortedPoints(points)
  if (sorted.length === 0 || !Number.isFinite(score)) return 0
  const exact = sorted.find((point) => nearlyEqual(point.score, score))
  if (exact) return exact.completion
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (!first || !last) return 0
  if (score <= first.score) return first.completion
  if (score >= last.score) return last.completion
  const upperIndex = sorted.findIndex((point) => point.score > score)
  const upper = sorted[upperIndex]
  const lower = sorted[upperIndex - 1]
  if (!upper || !lower || upper.score === lower.score) return upper?.completion ?? 0
  const ratio = (score - lower.score) / (upper.score - lower.score)
  return lower.completion + ratio * (upper.completion - lower.completion)
}

export function normalizeEvaluatorId(
  value: unknown,
  employeeIds: ReadonlySet<string>,
  managerId: string | null,
): string | null {
  if (typeof value === 'string' && employeeIds.has(value)) return value
  if (value === null) return null
  if (managerId && employeeIds.has(managerId)) return managerId
  return null
}

export function normalizeStandard(indicator: Indicator): Indicator {
  if (indicator.type !== 'standard') return indicator
  const legacy = indicator as StandardIndicator
  return {
    ...legacy,
    score: Number.isFinite(legacy.score) ? legacy.score : 0,
    points: normalizePoints(legacy.points),
    evaluatorId: typeof legacy.evaluatorId === 'string' ? legacy.evaluatorId : null,
  }
}

function normalizePoints(value: unknown): ScalePoint[] {
  if (!Array.isArray(value)) return defaultStandardPoints()
  const points = value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const point = item as Partial<ScalePoint>
    if (!Number.isFinite(point.score) || !Number.isFinite(point.completion)) return []
    return [
      {
        id: typeof point.id === 'string' && point.id ? point.id : crypto.randomUUID(),
        score: point.score as number,
        completion: point.completion as number,
      },
    ]
  })
  return points.length >= 2 ? points : defaultStandardPoints()
}

function sortedPoints(points: ScalePoint[]) {
  return points
    .filter((point) => Number.isFinite(point.score) && Number.isFinite(point.completion))
    .slice()
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
}

export function findCatalogKpi(catalog: CatalogKpi[], catalogId: string) {
  return catalog.find((item) => item.id === catalogId) ?? null
}

export function smartInfluence(indicator: SmartIndicator) {
  const points = indicator.points?.length >= 2 ? indicator.points : defaultSmartPoints()
  return completionOnScale(smartGroupCompletion(indicator), points)
}

export function fitsMatrixWeight(
  indicators: { id?: string; weight: number }[],
  exceptId: string | undefined,
  weight: number,
) {
  if (!Number.isFinite(weight) || weight <= 0) return false
  const used = indicators.reduce((sum, item) => sum + (item.id === exceptId ? 0 : item.weight), 0)
  return used + weight <= 100 + 1e-6
}

export function completionOf(indicator: Indicator, catalog: CatalogKpi[] = []): number {
  if (indicator.type === 'kpi') {
    const shared = findCatalogKpi(catalog, indicator.catalogId)
    return shared ? kpiCompletionOf(shared) : 0
  }
  if (indicator.type === 'smart') return smartInfluence(indicator)
  return completionOnScale(indicator.score, indicator.points ?? [])
}

export function weightedOf(indicator: Indicator, catalog: CatalogKpi[] = []): number {
  return completionOf(indicator, catalog) * (indicator.weight / 100)
}

export interface MatrixResult {
  kr: number
  weightSum: number
  byType: Record<Indicator['type'], number>
}

export function matrixResult(indicators: Indicator[], catalog: CatalogKpi[] = []): MatrixResult {
  const byType: MatrixResult['byType'] = { kpi: 0, smart: 0, standard: 0 }
  let kr = 0
  let weightSum = 0
  for (const indicator of indicators) {
    const weighted = weightedOf(indicator, catalog)
    kr += weighted
    weightSum += indicator.weight
    byType[indicator.type] += weighted
  }
  return { kr, weightSum, byType }
}

export function scaleOrderIssue(indicator: KpiScale): string | null {
  if (!indicator.inverse) {
    if (indicator.threshold < indicator.plan && indicator.plan < indicator.maximum) return null
    return 'Для прямого KPI нужен порядок: порог < план < максимум.'
  }
  if (indicator.threshold > indicator.plan && indicator.plan > indicator.maximum) return null
  return 'Для обратного KPI нужен порядок: порог > план > максимум.'
}

export function explainKpi(kpi: CatalogKpi): string {
  const completion = roundLabel(kpiCompletionOf(kpi))
  const exact = kpi.points.some((point) => nearlyEqual(point.value, kpi.fact))
  const plan = planPoint(kpi.points)
  const unit = kpi.unit ? ` ${kpi.unit}` : ''
  const planText = plan ? ` План — ${formatNumber(plan.value)}${unit}.` : ''
  const where = exact ? 'Факт стоит на точке шкалы.' : 'Факт между точками шкалы.'
  return `${where} Выполнение — ${completion}.${planText}`
}

function roundLabel(value: number) {
  const rounded = Math.round(value * 10) / 10
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',')
  return `${text}%`
}

export function standardSeries(indicator: StandardIndicator) {
  const points = sortedPoints(indicator.points).map((point) => ({
    score: point.score,
    completion: point.completion,
    marker: nearlyEqual(point.score, indicator.score),
  }))
  if (!points.some((point) => point.marker)) {
    points.push({
      score: indicator.score,
      completion: completionOnScale(indicator.score, indicator.points),
      marker: true,
    })
    points.sort((a, b) => a.score - b.score || Number(a.marker) - Number(b.marker))
  }
  return points
}

export function explainStandard(indicator: StandardIndicator) {
  const completion = roundLabel(completionOnScale(indicator.score, indicator.points))
  const exact = sortedPoints(indicator.points).find((point) => nearlyEqual(point.score, indicator.score))
  if (exact) return `Оценка ${formatScoreLabel(indicator.score)} стоит на точке шкалы. Выполнение — ${completion}.`
  return `Оценка ${formatScoreLabel(indicator.score)} между точками шкалы. Выполнение — ${completion}.`
}

function formatScoreLabel(score: number) {
  if (score > 0) return `+${score}`
  if (score < 0) return `−${Math.abs(score)}`
  return '0'
}

export function explainSmart(indicator: SmartIndicator) {
  const done = smartGroupCompletion(indicator)
  const influence = roundLabel(smartInfluence(indicator))
  const exact = (indicator.points ?? []).some((point) => nearlyEqual(point.score, done))
  const where = exact ? 'Процент выполненных задач стоит на точке шкалы.' : 'Процент выполненных задач между точками шкалы.'
  return `${where} Влияние на вес блока в матрице — ${influence}.`
}

export function smartSeries(indicator: SmartIndicator) {
  const done = smartGroupCompletion(indicator)
  const points = (indicator.points?.length >= 2 ? indicator.points : defaultSmartPoints())
    .filter((point) => Number.isFinite(point.score) && Number.isFinite(point.completion))
    .slice()
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
    .map((point) => ({
      score: point.score,
      completion: point.completion,
      marker: nearlyEqual(point.score, done),
    }))
  if (!points.some((point) => point.marker)) {
    points.push({ score: done, completion: smartInfluence(indicator), marker: true })
    points.sort((a, b) => a.score - b.score || Number(a.marker) - Number(b.marker))
  }
  return points
}

export function kpiSeries(kpi: CatalogKpi) {
  const points = kpi.points
    .filter((point) => Number.isFinite(point.value) && Number.isFinite(point.completion))
    .slice()
    .sort((a, b) => a.value - b.value || a.id.localeCompare(b.id))
    .map((point) => ({
      value: point.value,
      completion: point.completion,
      marker: nearlyEqual(point.value, kpi.fact),
    }))
  if (!points.some((point) => point.marker)) {
    points.push({
      value: kpi.fact,
      completion: kpiCompletionOf(kpi),
      marker: true,
    })
    points.sort((a, b) => a.value - b.value || Number(a.marker) - Number(b.marker))
  }
  return points
}
