import { formatPeriod } from './period.ts'
import { SMART_STATUS_LABEL } from './smart.ts'
import type { CatalogKpi, Employee, Indicator, PeriodSnapshot, SmartTask, TeamData } from '../types.ts'

export const AUDIT_DETAIL_LIMIT = 40

export function describeTeamChanges(before: TeamData, after: TeamData): string[] {
  const lines: string[] = []
  const oldPeriods = new Map(before.periods.map((period) => [period.id, period]))
  const newPeriods = new Map(after.periods.map((period) => [period.id, period]))
  for (const period of after.periods) {
    if (!oldPeriods.has(period.id)) lines.push(`Открыт период «${formatPeriod(period.id)}»`)
  }
  for (const period of before.periods) {
    if (!newPeriods.has(period.id)) lines.push(`Удалён период «${formatPeriod(period.id)}»`)
  }
  for (const period of after.periods) {
    const old = oldPeriods.get(period.id)
    if (!old) continue
    const changes = periodChanges(old, period)
    const prefix = after.periods.length > 1 ? `${formatPeriod(period.id)}: ` : ''
    lines.push(...changes.map((line) => prefix + line))
  }
  return lines
}

export function mergeDetails(existing: string[], incoming: string[]) {
  const merged = existing.filter((line) => !incoming.includes(line))
  merged.push(...incoming)
  return merged.slice(-AUDIT_DETAIL_LIMIT)
}

function periodChanges(before: PeriodSnapshot, after: PeriodSnapshot) {
  const lines: string[] = []
  lines.push(...catalogChanges(before.kpiCatalog, after.kpiCatalog))
  const oldPeople = new Map(before.employees.map((employee) => [employee.id, employee]))
  const newPeople = new Map(after.employees.map((employee) => [employee.id, employee]))
  const nameOf = (id: string | null) => (id ? (newPeople.get(id) ?? oldPeople.get(id))?.name || 'без имени' : 'нет')
  for (const employee of after.employees) {
    const old = oldPeople.get(employee.id)
    if (!old) {
      lines.push(`Добавлен сотрудник «${label(employee.name)}»`)
      continue
    }
    lines.push(...employeeChanges(old, employee, nameOf, after.kpiCatalog))
  }
  for (const employee of before.employees) {
    if (!newPeople.has(employee.id)) lines.push(`Удалён сотрудник «${label(employee.name)}»`)
  }
  return lines
}

function catalogChanges(before: CatalogKpi[], after: CatalogKpi[]) {
  const lines: string[] = []
  const old = new Map(before.map((kpi) => [kpi.id, kpi]))
  for (const kpi of after) {
    const previous = old.get(kpi.id)
    if (!previous) {
      lines.push(`Добавлен показатель «${label(kpi.name)}»`)
      continue
    }
    if (previous.name !== kpi.name) lines.push(`Показатель «${label(previous.name)}» переименован в «${label(kpi.name)}»`)
    if (previous.unit !== kpi.unit) lines.push(`Показатель «${label(kpi.name)}»: единица измерения «${kpi.unit}»`)
    if (previous.fact !== kpi.fact) lines.push(`Показатель «${label(kpi.name)}»: факт ${previous.fact} → ${kpi.fact}`)
    if (!samePoints(previous.points, kpi.points)) lines.push(`Показатель «${label(kpi.name)}»: изменена шкала`)
  }
  const kept = new Set(after.map((kpi) => kpi.id))
  for (const kpi of before) {
    if (!kept.has(kpi.id)) lines.push(`Удалён показатель «${label(kpi.name)}»`)
  }
  return lines
}

function employeeChanges(
  before: Employee,
  after: Employee,
  nameOf: (id: string | null) => string,
  catalog: CatalogKpi[],
) {
  const who = label(after.name)
  const lines: string[] = []
  if (before.name !== after.name) lines.push(`Сотрудник «${label(before.name)}» переименован в «${who}»`)
  if (before.position !== after.position) lines.push(`${who}: должность «${after.position || 'не указана'}»`)
  if (before.managerId !== after.managerId) lines.push(`${who}: руководитель — ${nameOf(after.managerId)}`)
  const old = new Map(before.indicators.map((indicator) => [indicator.id, indicator]))
  for (const indicator of after.indicators) {
    const previous = old.get(indicator.id)
    const title = indicatorTitle(indicator, catalog)
    if (!previous || previous.type !== indicator.type) {
      lines.push(`${who}: добавлен показатель ${title}`)
      continue
    }
    lines.push(...indicatorChanges(previous, indicator, title).map((line) => `${who}: ${line}`))
  }
  const kept = new Set(after.indicators.map((indicator) => indicator.id))
  for (const indicator of before.indicators) {
    if (!kept.has(indicator.id)) lines.push(`${who}: удалён показатель ${indicatorTitle(indicator, catalog)}`)
  }
  return lines
}

function indicatorChanges(before: Indicator, after: Indicator, title: string) {
  const lines: string[] = []
  if (before.weight !== after.weight) lines.push(`вес ${title} ${before.weight}% → ${after.weight}%`)
  if (before.type === 'standard' && after.type === 'standard') {
    if (before.name !== after.name) lines.push(`стандарт «${label(before.name)}» переименован в «${label(after.name)}»`)
    if (before.score !== after.score) lines.push(`оценка ${title} ${before.score} → ${after.score}`)
    if (before.evaluatorId !== after.evaluatorId) lines.push(`сменён оценщик ${title}`)
    if (!samePoints(before.points, after.points)) lines.push(`изменена шкала ${title}`)
  }
  if (before.type === 'kpi' && after.type === 'kpi' && before.catalogId !== after.catalogId) {
    lines.push(`заменён количественный показатель на ${title}`)
  }
  if (before.type === 'smart' && after.type === 'smart') {
    lines.push(...smartChanges(before.tasks, after.tasks))
    if (!samePoints(before.points, after.points)) lines.push('изменена шкала смартов')
  }
  return lines
}

function smartChanges(before: SmartTask[], after: SmartTask[]) {
  const lines: string[] = []
  const old = new Map(before.map((task) => [task.id, task]))
  for (const task of after) {
    const previous = old.get(task.id)
    const name = `«${label(task.name)}»`
    if (!previous) {
      lines.push(`добавлен смарт ${name}`)
      continue
    }
    if (previous.name !== task.name) lines.push(`смарт «${label(previous.name)}» переименован в ${name}`)
    if (previous.status !== task.status) {
      lines.push(`смарт ${name}: ${SMART_STATUS_LABEL[previous.status]} → ${SMART_STATUS_LABEL[task.status]}`)
    }
    if (previous.weight !== task.weight) lines.push(`смарт ${name}: вес ${previous.weight}% → ${task.weight}%`)
    if (previous.detail !== task.detail || previous.criterion !== task.criterion) {
      lines.push(`смарт ${name}: изменено описание`)
    }
    const added = task.comments.length - previous.comments.length
    if (added > 0) lines.push(`смарт ${name}: добавлен комментарий`)
    else if (JSON.stringify(previous.comments) !== JSON.stringify(task.comments)) lines.push(`смарт ${name}: изменены комментарии`)
  }
  const kept = new Set(after.map((task) => task.id))
  for (const task of before) {
    if (!kept.has(task.id)) lines.push(`удалён смарт «${label(task.name)}»`)
  }
  return lines
}

function indicatorTitle(indicator: Indicator, catalog: CatalogKpi[]) {
  if (indicator.type === 'standard') return `«${label(indicator.name)}»`
  if (indicator.type === 'smart') return '«Смарты»'
  const kpi = catalog.find((item) => item.id === indicator.catalogId)
  return `«${label(kpi?.name ?? 'КПЭ')}»`
}

function samePoints(before: { id: string; completion: number }[], after: { id: string; completion: number }[]) {
  return JSON.stringify(before) === JSON.stringify(after)
}

function label(text: string) {
  const trimmed = text.trim()
  return trimmed || 'без названия'
}
