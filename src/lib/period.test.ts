import { describe, expect, it } from 'vitest'
import { createSeed } from '../data/seed.ts'
import { completionOf, matrixResult } from './calc.ts'
import { ensurePeriod, formatPeriod, parsePeriodLabel } from './period.ts'

describe('periods', () => {
  it('names a month the same way as the demo period', () => {
    expect(formatPeriod('2026-10')).toBe('Октябрь 2026')
    expect(parsePeriodLabel('Октябрь 2026')).toBe('2026-10')
  })

  it('opens a new month without changing the month that is already filled in', () => {
    const opened = ensurePeriod(createSeed(), '2026-11')
    const october = opened.periods.find((period) => period.id === '2026-10')
    const november = opened.periods.find((period) => period.id === '2026-11')
    expect(opened.currentPeriod).toBe('2026-11')
    expect(opened.periodLabel).toBe('Ноябрь 2026')
    expect(october?.kpiCatalog.find((item) => item.id === 'kpi-leads')?.fact).toBe(900)
    expect(november?.kpiCatalog.find((item) => item.id === 'kpi-leads')?.fact).toBe(500)
    expect(november?.kpiCatalog.find((item) => item.id === 'kpi-cpl')?.fact).toBe(400)

    const octoberIvanov = october?.employees.find((employee) => employee.id === 'emp-ivanov')
    const novemberIvanov = november?.employees.find((employee) => employee.id === 'emp-ivanov')
    const octoberSmart = octoberIvanov?.indicators.find((item) => item.type === 'smart')
    const novemberSmart = novemberIvanov?.indicators.find((item) => item.type === 'smart')
    expect(octoberSmart?.type === 'smart' ? octoberSmart.tasks[0]?.status : null).toBe('in_progress')
    expect(novemberSmart?.type === 'smart' ? novemberSmart.tasks[0]?.status : null).toBe('created')
    expect(novemberIvanov ? completionOf(novemberIvanov.indicators[0]!, november!.kpiCatalog) : null).toBe(0)
    expect(novemberIvanov ? matrixResult(novemberIvanov.indicators, november!.kpiCatalog).kr : null).toBe(10)

    const petrova = october?.employees.find((employee) => employee.id === 'emp-petrova')
    const petrovaNext = november?.employees.find((employee) => employee.id === 'emp-petrova')
    const talks = petrova?.indicators.find((item) => item.id === 'std-talks')
    const talksNext = petrovaNext?.indicators.find((item) => item.id === 'std-talks')
    expect(talks?.type === 'standard' ? talks.score : null).toBe(1)
    expect(talksNext?.type === 'standard' ? talksNext.score : null).toBe(0)

    const back = ensurePeriod(opened, '2026-10')
    const ivanov = back.employees.find((employee) => employee.id === 'emp-ivanov')
    expect(back.kpiCatalog.find((item) => item.id === 'kpi-leads')?.fact).toBe(900)
    expect(ivanov ? matrixResult(ivanov.indicators, back.kpiCatalog).kr : null).toBe(58)
  })
})
