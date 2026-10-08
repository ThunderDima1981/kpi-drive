import type { Indicator, KpiIndicator, StandardScore } from '../types.ts'

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

export function clampProgress(progress: number) {
  if (!Number.isFinite(progress)) return 0
  return Math.min(100, Math.max(0, progress))
}

export function completionOf(indicator: Indicator): number {
  if (indicator.type === 'kpi') return kpiCompletion(indicator)
  if (indicator.type === 'smart') return clampProgress(indicator.progress)
  return STANDARD_COMPLETION[indicator.score] ?? 0
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
