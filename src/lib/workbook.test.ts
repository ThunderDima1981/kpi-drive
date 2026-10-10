import { describe, expect, it } from 'vitest'
import { parseKpiSheet, parseUserSheet } from './spreadsheet.ts'
import { kpiTemplate, readFirstSheet, userTemplate, workbookFile } from './workbook.ts'

async function sheetBytes(sheets: Parameters<typeof workbookFile>[0]) {
  const raw = await workbookFile(sheets)
  const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : Uint8Array.from(raw)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

describe('excel workbooks', () => {
  it('writes a user template that loads back as one account', async () => {
    const grid = await readFirstSheet(await sheetBytes(userTemplate()))
    const parsed = parseUserSheet(grid)
    expect(parsed.errors).toEqual([])
    expect(parsed.rows[0]?.email).toBe('irina@example.com')
    expect(parsed.rows[0]?.role).toBe('user')
  })

  it('writes a kpi template that loads back with plan and fact', async () => {
    const grid = await readFirstSheet(await sheetBytes(kpiTemplate()))
    const parsed = parseKpiSheet(grid)
    expect(parsed.errors).toEqual([])
    expect(parsed.rows[0]).toMatchObject({ name: 'Прибыль компании', unit: 'руб', plan: 100, fact: 0 })
  })
})
