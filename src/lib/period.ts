import { startingFact } from './calc.ts'
import type { Indicator, TeamData } from '../types.ts'

export const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export function periodId(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function parsePeriodId(id: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(id)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isInteger(year) || month < 1 || month > 12) return null
  return { year, month }
}

export function formatPeriod(id: string) {
  const parsed = parsePeriodId(id)
  if (!parsed) return id
  return `${MONTHS[parsed.month - 1]} ${parsed.year}`
}

export function parsePeriodLabel(label: string) {
  const year = label.match(/20\d{2}/)
  if (!year) return null
  const lower = label.toLocaleLowerCase('ru')
  const month = MONTHS.findIndex((name) => lower.includes(name.toLocaleLowerCase('ru')))
  if (month < 0) return null
  return periodId(Number(year[0]), month + 1)
}

export function shiftPeriod(id: string, delta: number) {
  const parsed = parsePeriodId(id)
  if (!parsed) return id
  const date = new Date(parsed.year, parsed.month - 1 + delta, 1)
  return periodId(date.getFullYear(), date.getMonth() + 1)
}

export function calendarDays(year: number, month: number) {
  const start = (new Date(year, month - 1, 1).getDay() + 6) % 7
  const count = new Date(year, month, 0).getDate()
  const cells: (number | null)[] = Array.from({ length: start }, () => null)
  for (let day = 1; day <= count; day += 1) cells.push(day)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function publishPeriods(periods: TeamData['periods'], currentPeriod: string): TeamData {
  const current = periods.find((period) => period.id === currentPeriod) ?? periods[0]
  if (!current) {
    return {
      currentPeriod: '2026-10',
      periodLabel: 'Октябрь 2026',
      periods: [],
      employees: [],
      kpiCatalog: [],
    }
  }
  return {
    currentPeriod: current.id,
    periodLabel: formatPeriod(current.id),
    periods,
    employees: current.employees,
    kpiCatalog: current.kpiCatalog,
  }
}

export function ensurePeriod(state: TeamData, id: string): TeamData {
  if (!parsePeriodId(id)) return state
  if (state.periods.some((period) => period.id === id)) return publishPeriods(state.periods, id)
  const source = state.periods.find((period) => period.id === state.currentPeriod) ?? state.periods[0]
  if (!source) return publishPeriods([{ id, employees: [], kpiCatalog: [] }], id)
  return publishPeriods([...state.periods, freshPeriod(source, id)], id)
}

export function freshPeriod(source: TeamData['periods'][number], id: string) {
  const copy = structuredClone(source)
  return {
    id,
    employees: copy.employees.map((employee) => ({
      ...employee,
      indicators: employee.indicators.map(resetIndicator),
    })),
    kpiCatalog: copy.kpiCatalog.map((kpi) => ({ ...kpi, fact: startingFact(kpi.points) })),
  }
}

function resetIndicator(indicator: Indicator): Indicator {
  if (indicator.type === 'smart') {
    return {
      ...indicator,
      tasks: indicator.tasks.map((task) => ({ ...task, status: 'created', comments: [] })),
    }
  }
  if (indicator.type === 'standard') return { ...indicator, score: 0 }
  return indicator
}

export function mapCurrentPeriod(
  state: TeamData,
  update: (period: TeamData['periods'][number]) => TeamData['periods'][number],
) {
  const periods = state.periods.map((period) => (period.id === state.currentPeriod ? update(period) : period))
  return publishPeriods(periods, state.currentPeriod)
}

export function mapEveryPeriod(
  state: TeamData,
  update: (period: TeamData['periods'][number]) => TeamData['periods'][number],
) {
  return publishPeriods(state.periods.map(update), state.currentPeriod)
}
