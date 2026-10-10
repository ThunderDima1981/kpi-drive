import { describe, expect, it } from 'vitest'
import { kpiScale, matchEmployee, parseKpiSheet, parseUserSheet } from './spreadsheet.ts'

describe('excel sheets', () => {
  it('reads a user row and rejects a short password and a repeated email', () => {
    const parsed = parseUserSheet([
      ['Имя', 'Почта', 'Пароль', 'Права', 'Сотрудник', 'Матрицы'],
      ['Ирина Соколова', 'Irina@example.com', 'parol-123', 'Пользователь', 'Ирина Соколова', 'Ирина Соколова, Павел Орлов'],
      ['Павел Орлов', 'irina@example.com', 'parol-123', 'Администратор', '', ''],
      ['Без пароля', 'short@example.com', '123', 'Пользователь', '', ''],
    ])
    expect(parsed.rows).toEqual([
      {
        line: 2,
        name: 'Ирина Соколова',
        email: 'irina@example.com',
        password: 'parol-123',
        role: 'user',
        employeeName: 'Ирина Соколова',
        matrixNames: ['Ирина Соколова', 'Павел Орлов'],
      },
    ])
    expect(parsed.errors.map((item) => item.line)).toEqual([3, 4])
  })

  it('reads a kpi row with a comma decimal and skips a repeated name', () => {
    const parsed = parseKpiSheet([
      ['Название', 'Единица', 'План', 'Факт'],
      ['Прибыль', 'руб', '1 000,5', ''],
      ['Прибыль', 'руб', 10, 1],
      ['', '', '', ''],
    ])
    expect(parsed.rows).toEqual([{ line: 2, name: 'Прибыль', unit: 'руб', plan: 1000.5, fact: 0 }])
    expect(parsed.errors[0]?.line).toBe(3)
  })

  it('matches one employee and builds a scale around the plan', () => {
    expect(matchEmployee(' ирина ', [{ id: 'a', name: 'Ирина' }, { id: 'b', name: 'Павел' }])).toEqual({ id: 'a' })
    const missing = matchEmployee('Нет', [{ id: 'a', name: 'Ирина' }])
    expect('error' in missing ? missing.error : '').toContain('не найден')
    const scale = kpiScale(80)
    if (!('points' in scale)) throw new Error(scale.error)
    expect(scale.points.map((point) => [point.value, point.completion])).toEqual([
      [0, 0],
      [80, 100],
      [160, 130],
    ])
  })
})
