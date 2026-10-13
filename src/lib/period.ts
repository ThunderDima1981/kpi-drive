import { startingFact } from './calc.ts'
import { randomId } from './id.ts'
import type { Indicator, SmartTask, TeamData } from '../types.ts'

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

export function nextPeriodId(id: string) {
  const parsed = parsePeriodId(id)
  if (!parsed) return null
  return parsed.month === 12 ? periodId(parsed.year + 1, 1) : periodId(parsed.year, parsed.month + 1)
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

export function emptyTeam(date = new Date()): TeamData {
  const id = periodId(date.getFullYear(), date.getMonth() + 1)
  return publishPeriods([{ id, employees: [], kpiCatalog: [] }], id)
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
  if (indicator.type === 'smart') return { ...indicator, tasks: [] }
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

export function moveSmartTask(
  team: TeamData,
  employeeId: string,
  taskId: string,
  sourcePeriodId: string,
): { team: TeamData } | { error: string } {
  const nextId = nextPeriodId(sourcePeriodId)
  if (!nextId) return { error: 'Некорректный месяц.' }
  const source = team.periods.find((period) => period.id === sourcePeriodId)
  if (!source) return { error: 'Месяц не найден.' }
  const employee = source.employees.find((item) => item.id === employeeId)
  if (!employee) return { error: 'Сотрудник не найден.' }
  const sourceSmart = employee.indicators.find(
    (item) => item.type === 'smart' && item.tasks.some((task) => task.id === taskId),
  )
  if (!sourceSmart || sourceSmart.type !== 'smart') return { error: 'Задача не найдена.' }
  const task = sourceSmart.tasks.find((item) => item.id === taskId)
  if (!task) return { error: 'Задача не найдена.' }
  if (task.status === 'closed') return { error: 'Закрытый смарт не переносится на следующий месяц.' }

  let periods = team.periods
  if (!periods.some((period) => period.id === nextId)) periods = [...periods, freshPeriod(source, nextId)]
  const target = periods.find((period) => period.id === nextId)
  const targetEmployee = target?.employees.find((item) => item.id === employeeId)
  const targetSmart = targetEmployee?.indicators.find((item) => item.type === 'smart')
  if (!targetSmart || targetSmart.type !== 'smart') {
    return { error: 'В следующем месяце нет блока smart-задач. Администратор должен добавить блок.' }
  }

  const moved: SmartTask = { ...structuredClone(task), id: randomId() }
  const nextPeriods = periods.map((period) => {
    if (period.id === sourcePeriodId) {
      return replaceSmartTasks(period, employeeId, sourceSmart.id, (tasks) => tasks.filter((item) => item.id !== taskId))
    }
    if (period.id === nextId) {
      return replaceSmartTasks(period, employeeId, targetSmart.id, (tasks) => [...tasks, moved])
    }
    return period
  })
  return { team: publishPeriods(nextPeriods, team.currentPeriod) }
}

function replaceSmartTasks(
  period: TeamData['periods'][number],
  employeeId: string,
  smartId: string,
  update: (tasks: SmartTask[]) => SmartTask[],
) {
  return {
    ...period,
    employees: period.employees.map((employee) => {
      if (employee.id !== employeeId) return employee
      return {
        ...employee,
        indicators: employee.indicators.map((indicator) =>
          indicator.type === 'smart' && indicator.id === smartId ? { ...indicator, tasks: update(indicator.tasks) } : indicator,
        ),
      }
    }),
  }
}

export function mapEveryPeriod(
  state: TeamData,
  update: (period: TeamData['periods'][number]) => TeamData['periods'][number],
) {
  return publishPeriods(state.periods.map(update), state.currentPeriod)
}
