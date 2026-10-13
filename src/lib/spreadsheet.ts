import type { Role } from './access.ts'
import { randomId } from './id.ts'
import type { KpiPoint } from '../types.ts'

export const USER_COLUMNS = ['Имя', 'Почта', 'Пароль', 'Права', 'Сотрудник', 'Матрицы'] as const
export const KPI_COLUMNS = ['Название', 'Единица', 'План', 'Факт'] as const

export type SheetGrid = unknown[][]

export type UserSheetRow = {
  line: number
  name: string
  email: string
  password: string
  role: Role
  employeeName: string
  matrixNames: string[]
}

export type KpiSheetRow = {
  line: number
  name: string
  unit: string
  plan: number
  fact: number
}

export type SheetIssue = { line: number; message: string }

export function importReport(done: number, issues: SheetIssue[], verb: string) {
  const sorted = issues.slice().sort((a, b) => a.line - b.line || a.message.localeCompare(b.message, 'ru'))
  const head = sorted.length === 0 ? `${verb} ${done}.` : `${verb} ${done}. Не загружено: ${sorted.length}.`
  const details = sorted.map((item) => `Строка ${item.line}: ${item.message}`).join(' ')
  return details ? `${head} ${details}` : head
}

export function parseUserSheet(grid: SheetGrid): { rows: UserSheetRow[]; errors: SheetIssue[] } {
  const table = readTable(grid, USER_COLUMNS)
  if ('error' in table) return { rows: [], errors: [{ line: 1, message: table.error }] }
  const rows: UserSheetRow[] = []
  const errors: SheetIssue[] = []
  const seen = new Set<string>()
  for (const record of table.records) {
    const name = text(record['Имя'])
    const email = text(record['Почта']).toLowerCase()
    const password = text(record['Пароль'])
    const rights = text(record['Права'])
    const employeeName = text(record['Сотрудник'])
    const matrixNames = text(record['Матрицы'])
      .split(/[,;]/)
      .map((item) => item.trim())
      .filter(Boolean)
    if (!name && !email && !password && !rights && !employeeName && matrixNames.length === 0) continue
    const role = roleOf(rights)
    if (name.length < 2) errors.push({ line: record.line, message: 'Укажите имя.' })
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
      errors.push({ line: record.line, message: 'Укажите почту.' })
    } else if (password.length < 8) errors.push({ line: record.line, message: 'Пароль должен быть не короче 8 символов.' })
    else if (password.length > 72) errors.push({ line: record.line, message: 'Пароль слишком длинный.' })
    else if (!role) errors.push({ line: record.line, message: 'Права: Администратор или Пользователь.' })
    else if (seen.has(email)) errors.push({ line: record.line, message: 'Эта почта повторяется в файле.' })
    else {
      seen.add(email)
      rows.push({ line: record.line, name, email, password, role, employeeName, matrixNames })
    }
  }
  if (rows.length === 0 && errors.length === 0) {
    return { rows, errors: [{ line: 1, message: 'В файле нет строк для загрузки.' }] }
  }
  return { rows, errors }
}

export function parseKpiSheet(grid: SheetGrid): { rows: KpiSheetRow[]; errors: SheetIssue[] } {
  const table = readTable(grid, KPI_COLUMNS)
  if ('error' in table) return { rows: [], errors: [{ line: 1, message: table.error }] }
  const rows: KpiSheetRow[] = []
  const errors: SheetIssue[] = []
  const seen = new Set<string>()
  for (const record of table.records) {
    const name = text(record['Название'])
    const unit = text(record['Единица'])
    const planText = text(record['План'])
    const factText = text(record['Факт'])
    if (!name && !unit && !planText && !factText) continue
    const plan = parseSheetNumber(record['План'])
    const fact = factText === '' ? 0 : parseSheetNumber(record['Факт'])
    const key = name.toLocaleLowerCase('ru-RU')
    if (!name) errors.push({ line: record.line, message: 'Укажите название показателя.' })
    else if (plan === null) errors.push({ line: record.line, message: 'План — число.' })
    else if (fact === null) errors.push({ line: record.line, message: 'Факт — число или пустая ячейка.' })
    else if (seen.has(key)) errors.push({ line: record.line, message: 'Это название повторяется в файле.' })
    else {
      seen.add(key)
      rows.push({ line: record.line, name, unit, plan, fact })
    }
  }
  if (rows.length === 0 && errors.length === 0) {
    return { rows, errors: [{ line: 1, message: 'В файле нет строк для загрузки.' }] }
  }
  return { rows, errors }
}

export type EmployeeMatch = { id: string | null } | { error: string }

export function matchEmployee(name: string, employees: { id: string; name: string }[]): EmployeeMatch {
  const needle = name.trim().toLocaleLowerCase('ru-RU')
  if (!needle) return { id: null }
  const found = employees.filter((employee) => employee.name.trim().toLocaleLowerCase('ru-RU') === needle)
  if (found.length === 1) return { id: found[0]!.id }
  if (found.length === 0) return { error: `Сотрудник «${name.trim()}» не найден в составе команды.` }
  return { error: `В команде несколько сотрудников с именем «${name.trim()}».` }
}

export function kpiScale(plan: number): { points: KpiPoint[] } | { error: string } {
  if (!Number.isFinite(plan)) return { error: 'План — число.' }
  const threshold = plan === 0 ? -1 : 0
  const doubled = plan * 2
  const max = doubled === plan || doubled === threshold ? plan + 100 : doubled
  if (max === plan || max === threshold) return { error: 'Не удалось построить шкалу для этого плана.' }
  return {
    points: [
      { id: randomId(), value: threshold, completion: 0 },
      { id: randomId(), value: plan, completion: 100 },
      { id: randomId(), value: max, completion: 130 },
    ],
  }
}

export function parseSheetNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const cleaned = value.trim().replace(/\s/g, '').replace(',', '.')
  if (!cleaned) return null
  const number = Number(cleaned)
  return Number.isFinite(number) ? number : null
}

function roleOf(value: string): Role | null {
  const key = value.toLocaleLowerCase('ru-RU')
  if (key === 'администратор' || key === 'admin') return 'admin'
  if (key === 'пользователь' || key === 'user') return 'user'
  return null
}

function text(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string') return value.trim()
  return ''
}

function readTable(
  grid: SheetGrid,
  columns: readonly string[],
): { error: string } | { records: (Record<string, unknown> & { line: number })[] } {
  const header = grid[0]
  const missing = `В первой строке нужны столбцы: ${columns.join(', ')}.`
  if (!Array.isArray(header) || header.length === 0) return { error: missing }
  const titles = header.map((cell) => text(cell))
  const indexes = new Map<string, number>()
  for (const column of columns) {
    const index = titles.findIndex((title) => title.toLocaleLowerCase('ru-RU') === column.toLocaleLowerCase('ru-RU'))
    if (index < 0) return { error: missing }
    indexes.set(column, index)
  }
  const records = grid.slice(1).map((raw, offset) => {
    const cells = Array.isArray(raw) ? raw : []
    const record: Record<string, unknown> & { line: number } = { line: offset + 2 }
    for (const column of columns) record[column] = cells[indexes.get(column) ?? -1]
    return record
  })
  return { records }
}
