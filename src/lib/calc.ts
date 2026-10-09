import { smartCompletion } from './smart.ts'
import type { Indicator, KpiIndicator, ScalePoint, StandardIndicator, StandardScore } from '../types.ts'

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

export function completionOf(indicator: Indicator): number {
  if (indicator.type === 'kpi') return kpiCompletion(indicator)
  if (indicator.type === 'smart') return smartCompletion(indicator.status)
  return completionOnScale(indicator.score, indicator.points ?? [])
}

export function weightedOf(indicator: Indicator): number {
  return completionOf(indicator) * (indicator.weight / 100)
}

export interface MatrixResult {
  kr: number
  weightSum: number
  byType: Record<Indicator['type'], number>
}

export function matrixResult(indicators: Indicator[]): MatrixResult {
  const byType: MatrixResult['byType'] = { kpi: 0, smart: 0, standard: 0 }
  let kr = 0
  let weightSum = 0
  for (const indicator of indicators) {
    const weighted = weightedOf(indicator)
    kr += weighted
    weightSum += indicator.weight
    byType[indicator.type] += weighted
  }
  return { kr, weightSum, byType }
}

export function scaleOrderIssue(indicator: KpiIndicator): string | null {
  if (!indicator.inverse) {
    if (indicator.threshold < indicator.plan && indicator.plan < indicator.maximum) return null
    return 'Для прямого KPI нужен порядок: порог < план < максимум.'
  }
  if (indicator.threshold > indicator.plan && indicator.plan > indicator.maximum) return null
  return 'Для обратного KPI нужен порядок: порог > план > максимум.'
}

export function explainKpi(indicator: KpiIndicator): string {
  const completion = kpiCompletion(indicator)
  const cap = Number.isFinite(indicator.maxCap) ? indicator.maxCap : DEFAULT_MAX_CAP
  if (nearlyEqual(indicator.fact, indicator.plan)) {
    return 'Факт совпал с планом, поэтому выполнение равно 100%.'
  }
  if (!indicator.inverse) {
    if (indicator.fact < indicator.threshold) {
      return 'Факт ниже порога. Выполнение этого KPI обнуляется.'
    }
    if (indicator.fact < indicator.plan) {
      return `Факт между порогом и планом. Шкала линейно поднимает выполнение от 0% до 100%. Сейчас ${roundLabel(completion)}.`
    }
    if (indicator.fact >= indicator.maximum) {
      return `Факт достиг максимума шкалы. Выполнение ограничено потолком ${roundLabel(cap)}.`
    }
    return `Факт между планом и максимумом. Выполнение растёт от 100% до ${roundLabel(cap)}. Сейчас ${roundLabel(completion)}.`
  }
  if (indicator.fact > indicator.threshold) {
    return 'Факт хуже порога. Для обратного показателя выполнение обнуляется.'
  }
  if (indicator.fact > indicator.plan) {
    return `Факт между планом и порогом. У обратного показателя здесь шкала от 100% к 0%. Сейчас ${roundLabel(completion)}.`
  }
  if (indicator.fact <= indicator.maximum) {
    return `Факт достиг лучшей точки шкалы. Выполнение ограничено потолком ${roundLabel(cap)}.`
  }
  return `Факт лучше плана, но ещё не дошёл до максимума. Выполнение растёт от 100% до ${roundLabel(cap)}. Сейчас ${roundLabel(completion)}.`
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

export function scaleSeries(indicator: KpiIndicator, steps = 48) {
  const anchors = [indicator.threshold, indicator.plan, indicator.maximum, indicator.fact]
  const low = Math.min(...anchors)
  const high = Math.max(...anchors)
  const span = high - low || Math.max(Math.abs(indicator.plan), 1)
  const start = low - span * 0.15
  const end = high + span * 0.15
  const points: { fact: number; completion: number; marker: boolean }[] = []
  for (let index = 0; index <= steps; index += 1) {
    const fact = start + ((end - start) * index) / steps
    points.push({
      fact,
      completion: kpiCompletion({ ...indicator, fact }),
      marker: false,
    })
  }
  points.push({
    fact: indicator.fact,
    completion: kpiCompletion(indicator),
    marker: true,
  })
  points.sort((a, b) => a.fact - b.fact || Number(a.marker) - Number(b.marker))
  return points
}
