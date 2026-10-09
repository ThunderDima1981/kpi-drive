import { describe, expect, it } from 'vitest'
import { completionOf, defaultStandardPoints, matrixResult, planPoint } from './calc.ts'
import { defaultSmartPoints } from './smart.ts'
import { emptyTeam, ensurePeriod, formatPeriod, parsePeriodLabel, publishPeriods } from './period.ts'
import { useTeamStore } from '../store/team-store.ts'
import type { TeamData } from '../types.ts'

function filledMonth(): TeamData {
  return publishPeriods(
    [
      {
        id: '2026-10',
        kpiCatalog: [
          {
            id: 'leads',
            name: 'Лиды',
            unit: 'шт',
            fact: 900,
            points: [
              { id: 'a', value: 500, completion: 0 },
              { id: 'b', value: 1000, completion: 100 },
              { id: 'c', value: 1200, completion: 130 },
            ],
          },
          {
            id: 'cpl',
            name: 'CPL',
            unit: '₽',
            fact: 320,
            points: [
              { id: 'd', value: 250, completion: 130 },
              { id: 'e', value: 300, completion: 100 },
              { id: 'f', value: 400, completion: 0 },
            ],
          },
        ],
        employees: [
          {
            id: 'person',
            name: 'Сотрудник',
            position: 'Роль',
            managerId: null,
            indicators: [
              { id: 'k1', type: 'kpi', catalogId: 'leads', weight: 40 },
              { id: 'k2', type: 'kpi', catalogId: 'cpl', weight: 20 },
              {
                id: 'smart',
                type: 'smart',
                weight: 30,
                points: defaultSmartPoints(),
                tasks: [
                  {
                    id: 'task',
                    name: 'Задача',
                    weight: 100,
                    detail: '',
                    criterion: '',
                    status: 'in_progress',
                    comments: [],
                  },
                ],
              },
              {
                id: 'std',
                type: 'standard',
                name: 'Срок',
                weight: 10,
                score: 1,
                points: defaultStandardPoints(),
                evaluatorId: null,
              },
            ],
          },
        ],
      },
    ],
    '2026-10',
  )
}

describe('periods', () => {
  it('names a month', () => {
    expect(formatPeriod('2026-10')).toBe('Октябрь 2026')
    expect(parsePeriodLabel('Октябрь 2026')).toBe('2026-10')
  })

  it('starts an account with an empty current month', () => {
    const team = emptyTeam(new Date(2026, 9, 9))
    expect(team.currentPeriod).toBe('2026-10')
    expect(team.employees).toEqual([])
    expect(team.kpiCatalog).toEqual([])
  })

  it('opens a new month without changing the month that is already filled in', () => {
    const opened = ensurePeriod(filledMonth(), '2026-11')
    const october = opened.periods.find((period) => period.id === '2026-10')
    const november = opened.periods.find((period) => period.id === '2026-11')
    expect(opened.currentPeriod).toBe('2026-11')
    expect(opened.periodLabel).toBe('Ноябрь 2026')
    expect(october?.kpiCatalog.find((item) => item.id === 'leads')?.fact).toBe(900)
    expect(november?.kpiCatalog.find((item) => item.id === 'leads')?.fact).toBe(500)
    expect(november?.kpiCatalog.find((item) => item.id === 'cpl')?.fact).toBe(400)

    const octoberPerson = october?.employees[0]
    const novemberPerson = november?.employees[0]
    const octoberSmart = octoberPerson?.indicators.find((item) => item.type === 'smart')
    const novemberSmart = novemberPerson?.indicators.find((item) => item.type === 'smart')
    expect(octoberSmart?.type === 'smart' ? octoberSmart.tasks.map((task) => task.status) : []).toEqual(['in_progress'])
    expect(novemberSmart?.type === 'smart' ? novemberSmart.tasks : null).toEqual([])
    expect(novemberPerson ? completionOf(novemberPerson.indicators[0]!, november!.kpiCatalog) : null).toBe(0)
    expect(novemberPerson ? matrixResult(novemberPerson.indicators, november!.kpiCatalog).kr : null).toBe(10)

    const octoberStandard = octoberPerson?.indicators.find((item) => item.id === 'std')
    const novemberStandard = novemberPerson?.indicators.find((item) => item.id === 'std')
    expect(octoberStandard?.type === 'standard' ? octoberStandard.score : null).toBe(1)
    expect(novemberStandard?.type === 'standard' ? novemberStandard.score : null).toBe(0)

    const back = ensurePeriod(opened, '2026-10')
    expect(back.kpiCatalog.find((item) => item.id === 'leads')?.fact).toBe(900)
    expect(back.employees[0]?.indicators.find((item) => item.type === 'smart')).toMatchObject({
      tasks: [{ status: 'in_progress' }],
    })
  })

  it('stores a later month’s plan and fact apart from the month they were copied from', () => {
    useTeamStore.getState().replaceTeam(filledMonth())
    expect(useTeamStore.getState().setCatalogPlan('leads', 1100)).toBeNull()
    useTeamStore.getState().setCatalogFact('leads', 42)
    useTeamStore.getState().selectPeriod('2026-11')
    const opened = useTeamStore.getState()
    expect(opened.kpiCatalog.find((item) => item.id === 'leads')?.fact).toBe(500)
    expect(planPoint(opened.kpiCatalog.find((item) => item.id === 'leads')!.points)?.value).toBe(1100)
    expect(opened.employees[0]?.indicators.find((item) => item.type === 'smart')).toMatchObject({ tasks: [] })
    expect(useTeamStore.getState().setCatalogPlan('leads', 800)).toBeNull()
    useTeamStore.getState().setCatalogFact('leads', 700)
    useTeamStore.getState().selectPeriod('2026-10')
    const october = useTeamStore.getState()
    expect(october.kpiCatalog.find((item) => item.id === 'leads')?.fact).toBe(42)
    expect(planPoint(october.kpiCatalog.find((item) => item.id === 'leads')!.points)?.value).toBe(1100)
    expect(october.employees[0]?.indicators.find((item) => item.type === 'standard')).toMatchObject({ score: 1 })
    useTeamStore.getState().selectPeriod('2026-11')
    const november = useTeamStore.getState()
    expect(november.kpiCatalog.find((item) => item.id === 'leads')?.fact).toBe(700)
    expect(planPoint(november.kpiCatalog.find((item) => item.id === 'leads')!.points)?.value).toBe(800)
    expect(november.employees[0]?.indicators.find((item) => item.type === 'standard')).toMatchObject({ score: 0 })
  })
})
