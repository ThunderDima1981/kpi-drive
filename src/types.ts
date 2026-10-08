export type IndicatorType = 'kpi' | 'smart' | 'standard'

export type StandardScore = -2 | -1 | 0 | 1 | 2

export interface KpiIndicator {
  id: string
  type: 'kpi'
  name: string
  weight: number
  threshold: number
  plan: number
  maximum: number
  fact: number
  inverse: boolean
  maxCap: number
  unit: string
}

export interface SmartIndicator {
  id: string
  type: 'smart'
  name: string
  weight: number
  progress: number
}

export interface StandardIndicator {
  id: string
  type: 'standard'
  name: string
  weight: number
  score: StandardScore
}

export type Indicator = KpiIndicator | SmartIndicator | StandardIndicator

export interface Employee {
  id: string
  name: string
  position: string
  indicators: Indicator[]
}

export interface TeamData {
  periodLabel: string
  employees: Employee[]
}
