export type IndicatorType = 'kpi' | 'smart' | 'standard'

export type StandardScore = -2 | -1 | 0 | 1 | 2

export interface KpiPoint {
  id: string
  value: number
  completion: number
}

export interface CatalogKpi {
  id: string
  name: string
  unit: string
  fact: number
  points: KpiPoint[]
}

export interface KpiIndicator {
  id: string
  type: 'kpi'
  catalogId: string
  weight: number
}

export type SmartStatus = 'created' | 'in_progress' | 'done' | 'closed'

export interface SmartComment {
  id: string
  text: string
  createdAt: string
}

export interface SmartTask {
  id: string
  name: string
  weight: number
  detail: string
  criterion: string
  status: SmartStatus
  comments: SmartComment[]
}

export interface SmartIndicator {
  id: string
  type: 'smart'
  weight: number
  tasks: SmartTask[]
}

export interface ScalePoint {
  id: string
  score: number
  completion: number
}

export interface StandardIndicator {
  id: string
  type: 'standard'
  name: string
  weight: number
  score: number
  points: ScalePoint[]
  evaluatorId: string | null
}

export type Indicator = KpiIndicator | SmartIndicator | StandardIndicator

export interface Employee {
  id: string
  name: string
  position: string
  managerId: string | null
  indicators: Indicator[]
}

export interface TeamData {
  periodLabel: string
  employees: Employee[]
  kpiCatalog: CatalogKpi[]
}
