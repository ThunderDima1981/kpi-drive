import { KPI_COLUMNS, USER_COLUMNS } from './spreadsheet.ts'

type SheetSpec = {
  name: string
  rows: (string | number)[][]
  widths: number[]
}

export function userTemplate(): SheetSpec[] {
  return [
    {
      name: 'Пользователи',
      widths: [28, 32, 18, 18, 28, 42],
      rows: [
        [...USER_COLUMNS],
        ['Ирина Соколова', 'irina@example.com', 'parol-1234', 'Пользователь', 'Ирина Соколова', 'Ирина Соколова'],
      ],
    },
    {
      name: 'Как заполнять',
      widths: [110],
      rows: [
        ['Поле'],
        ['Имя — имя учётной записи, не короче 2 символов.'],
        ['Почта — адрес для входа.'],
        ['Пароль — не короче 8 символов.'],
        ['Права — Администратор или Пользователь.'],
        ['Сотрудник — ФИО из состава команды. Можно оставить пустым. Его матрица откроется этой учётной записи.'],
        ['Матрицы — ФИО через запятую. Администратор и без этого списка видит всю команду.'],
        ['Строку-пример на листе «Пользователи» замените или удалите перед загрузкой.'],
      ],
    },
  ]
}

export function kpiTemplate(): SheetSpec[] {
  return [
    {
      name: 'Показатели',
      widths: [32, 16, 14, 14],
      rows: [
        [...KPI_COLUMNS],
        ['Прибыль компании', 'руб', 100, 0],
      ],
    },
    {
      name: 'Как заполнять',
      widths: [110],
      rows: [
        ['Поле'],
        ['Название — показатель справочника открытого месяца.'],
        ['Единица — шт, руб или другое обозначение. Можно оставить пустым.'],
        ['План — значение со 100% выполнения. Порог шкалы будет 0, максимум — удвоенный план со 130%.'],
        ['Факт — значение открытого месяца. Пустая ячейка означает 0.'],
        ['Если показатель с таким названием уже есть, обновляются единица, план и факт этого месяца.'],
        ['Строку-пример на листе «Показатели» замените или удалите перед загрузкой.'],
      ],
    },
  ]
}

export async function workbookFile(sheets: SheetSpec[]) {
  const excel = await import('exceljs')
  const workbook = new excel.Workbook()
  for (const spec of sheets) {
    const sheet = workbook.addWorksheet(spec.name)
    for (const row of spec.rows) sheet.addRow(row)
    sheet.getRow(1).font = { bold: true }
    spec.widths.forEach((width, index) => {
      sheet.getColumn(index + 1).width = width
    })
  }
  return workbook.xlsx.writeBuffer()
}

export async function readFirstSheet(data: ArrayBuffer) {
  const excel = await import('exceljs')
  const workbook = new excel.Workbook()
  await workbook.xlsx.load(data)
  const sheet = workbook.worksheets[0]
  if (!sheet) return []
  const rows: unknown[][] = []
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: unknown[] = []
    for (let column = 1; column <= row.cellCount; column += 1) cells.push(plainCell(row.getCell(column).value))
    rows.push(cells)
  })
  return rows
}

export async function downloadWorkbook(filename: string, sheets: SheetSpec[]) {
  const buffer = await workbookFile(sheets)
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function plainCell(value: unknown): unknown {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return ''
  if (typeof value === 'object') {
    const record = value as { result?: unknown; text?: unknown; richText?: { text?: string }[] }
    if ('result' in record) return plainCell(record.result)
    if (Array.isArray(record.richText)) return record.richText.map((part) => part.text ?? '').join('')
    if (typeof record.text === 'string') return record.text
  }
  return ''
}
