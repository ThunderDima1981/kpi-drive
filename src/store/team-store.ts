import { create } from 'zustand'
import { normalizeCatalogKpi, normalizeEvaluatorId, normalizeStandard, pointsFromLegacyScale, pointsWithPlan, DEFAULT_MAX_CAP, fitsMatrixWeight } from '../lib/calc.ts'
import { directManagerId, sanitizeEmployees } from '../lib/org.ts'
import { emptyTeam, ensurePeriod, mapCurrentPeriod, mapEveryPeriod, parsePeriodLabel, publishPeriods } from '../lib/period.ts'
import { collapseSmartIndicators, defaultSmartPoints, normalizeIndicator } from '../lib/smart.ts'
import type { CatalogKpi, Employee, Indicator, KpiIndicator, PeriodSnapshot, SmartComment, SmartStatus, SmartTask, TeamData } from '../types.ts'

interface TeamState extends TeamData {
  replaceTeam: (data: unknown) => void
  selectPeriod: (id: string) => void
  setCatalogPlan: (id: string, plan: number) => string | null
  addEmployee: (name: string, position: string) => string | null
  updateEmployee: (id: string, patch: Pick<Employee, 'name' | 'position'>) => void
  setManager: (id: string, managerId: string | null) => void
  removeEmployee: (id: string) => void
  addIndicator: (employeeId: string, indicator: Indicator) => void
  updateIndicator: (employeeId: string, indicator: Indicator) => void
  removeIndicator: (employeeId: string, indicatorId: string) => void
  addCatalogKpi: (kpi: CatalogKpi) => void
  updateCatalogKpi: (kpi: CatalogKpi) => void
  removeCatalogKpi: (id: string) => void
  setCatalogFact: (id: string, fact: number) => void
  assignKpi: (employeeId: string, catalogId: string, weight: number) => void
  setSmartWeight: (employeeId: string, weight: number) => void
  addSmartTask: (employeeId: string, task: SmartTask, matrixWeight?: number) => void
  updateSmartTask: (employeeId: string, task: SmartTask) => void
  removeSmartTask: (employeeId: string, taskId: string) => void
  setStatus: (employeeId: string, taskId: string, status: SmartStatus) => void
  addComment: (employeeId: string, taskId: string, comment: SmartComment) => void
  setScore: (employeeId: string, indicatorId: string, score: number) => void
  setPeriodScore: (periodId: string, employeeId: string, indicatorId: string, score: number) => void
  setEvaluator: (employeeId: string, indicatorId: string, evaluatorId: string | null) => void
}

function uid() {
  return crypto.randomUUID()
}

function normalizeTeam(persisted: unknown): TeamData {
  const data = persisted as Partial<TeamData> | undefined
  if (Array.isArray(data?.periods) && data.periods.length > 0) {
    const periods = data.periods.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const period = item as Partial<PeriodSnapshot>
      if (typeof period.id !== 'string' || !/^\d{4}-\d{2}$/.test(period.id)) return []
      const snapshot = normalizeSnapshot(period.employees, period.kpiCatalog)
      return [{ id: period.id, ...snapshot }]
    })
    if (periods.length > 0) {
      const requested = typeof data.currentPeriod === 'string' ? data.currentPeriod : ''
      const current = periods.some((period) => period.id === requested) ? requested : periods[0]!.id
      return publishPeriods(periods, current)
    }
  }
  const snapshot = normalizeSnapshot(data?.employees, data?.kpiCatalog)
  const id = parsePeriodLabel(typeof data?.periodLabel === 'string' ? data.periodLabel : '') ?? '2026-10'
  return publishPeriods([{ id, ...snapshot }], id)
}

function normalizeSnapshot(employeesRaw: unknown, catalogRaw: unknown) {
  const raw = Array.isArray(employeesRaw) ? employeesRaw : []
  const employeeIds = new Set(
    raw.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const id = (item as Partial<Employee>).id
      return typeof id === 'string' && id ? [id] : []
    }),
  )
  const employees = sanitizeEmployees(
    raw.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const employee = item as Partial<Employee>
      if (typeof employee.id !== 'string' || !employee.id) return []
      const managerId = typeof employee.managerId === 'string' ? employee.managerId : null
      return [
        {
          id: employee.id,
          name: typeof employee.name === 'string' ? employee.name : '',
          position: typeof employee.position === 'string' ? employee.position : '',
          managerId,
          indicators: Array.isArray(employee.indicators)
            ? employee.indicators.map((indicator) => {
                const rawEvaluator =
                  indicator && typeof indicator === 'object'
                    ? (indicator as { evaluatorId?: unknown }).evaluatorId
                    : undefined
                const normalized = normalizeStandard(normalizeIndicator(indicator))
                if (normalized.type !== 'standard') return normalized
                return {
                  ...normalized,
                  evaluatorId: normalizeEvaluatorId(rawEvaluator, employeeIds, managerId),
                }
              })
            : [],
        },
      ]
    }),
  )
  const catalog = new Map<string, CatalogKpi>()
  if (Array.isArray(catalogRaw)) {
    for (const item of catalogRaw) {
      const normalized = normalizeCatalogKpi(item)
      if (normalized) catalog.set(normalized.id, normalized)
    }
  }
  const withCatalog = employees.map((employee) => ({
    ...employee,
    indicators: employee.indicators.flatMap((indicator) => adoptKpi(indicator, catalog)),
  }))
  const known = new Set(catalog.keys())
  return {
    employees: withCatalog.map((employee) => ({
      ...employee,
      indicators: collapseSmartIndicators(
        employee.indicators.filter((indicator) => indicator.type !== 'kpi' || known.has(indicator.catalogId)),
      ),
    })),
    kpiCatalog: [...catalog.values()],
  }
}

function adoptKpi(indicator: Indicator, catalog: Map<string, CatalogKpi>): Indicator[] {
  if (indicator.type !== 'kpi') return [indicator]
  const raw = indicator as KpiIndicator & {
    threshold?: unknown
    plan?: unknown
    maximum?: unknown
    fact?: unknown
    inverse?: unknown
    maxCap?: unknown
    name?: unknown
    unit?: unknown
  }
  const legacyThreshold = Number(raw.threshold)
  const legacyPlan = Number(raw.plan)
  const legacyMaximum = Number(raw.maximum)
  const legacyFact = Number(raw.fact)
  const isLegacy = [legacyThreshold, legacyPlan, legacyMaximum, legacyFact].every(Number.isFinite)
  if (isLegacy) {
    const id = indicator.id
    if (!catalog.has(id)) {
      catalog.set(id, {
        id,
        name: typeof raw.name === 'string' ? raw.name : '',
        unit: typeof raw.unit === 'string' ? raw.unit : '',
        fact: legacyFact,
        points: pointsFromLegacyScale(id, {
          threshold: legacyThreshold,
          plan: legacyPlan,
          maximum: legacyMaximum,
          fact: legacyFact,
          inverse: raw.inverse === true,
          maxCap: Number.isFinite(Number(raw.maxCap)) ? Number(raw.maxCap) : DEFAULT_MAX_CAP,
        }),
      })
    }
    return [{ id, type: 'kpi', catalogId: id, weight: finiteWeight(indicator.weight) }]
  }
  if (typeof raw.catalogId === 'string' && raw.catalogId) {
    return [{ id: indicator.id, type: 'kpi', catalogId: raw.catalogId, weight: finiteWeight(indicator.weight) }]
  }
  return []
}

function finiteWeight(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function mapSmartTask(
  employees: Employee[],
  employeeId: string,
  taskId: string,
  update: (task: SmartTask) => SmartTask,
) {
  return employees.map((employee) => {
    if (employee.id !== employeeId) return employee
    return {
      ...employee,
      indicators: employee.indicators.map((indicator) => {
        if (indicator.type !== 'smart' || !indicator.tasks.some((task) => task.id === taskId)) return indicator
        return {
          ...indicator,
          tasks: indicator.tasks.map((task) => (task.id === taskId ? update(task) : task)),
        }
      }),
    }
  })
}

function mapIndicator(
  employees: Employee[],
  employeeId: string,
  indicatorId: string,
  update: (indicator: Indicator) => Indicator,
) {
  return employees.map((employee) => {
    if (employee.id !== employeeId) return employee
    return {
      ...employee,
      indicators: employee.indicators.map((indicator) =>
        indicator.id === indicatorId ? update(indicator) : indicator,
      ),
    }
  })
}

export const useTeamStore = create<TeamState>()((set) => ({
      ...emptyTeam(),
      replaceTeam: (data) => set(normalizeTeam(data)),
      selectPeriod: (id) => set((state) => ensurePeriod(state, id)),
      setCatalogPlan: (id, plan) => {
        const item = useTeamStore.getState().kpiCatalog.find((kpi) => kpi.id === id)
        if (!item) return 'Показатель не найден.'
        const next = pointsWithPlan(item.points, plan)
        if ('error' in next) return next.error
        set((state) =>
          mapCurrentPeriod(state, (period) => ({
            ...period,
            kpiCatalog: period.kpiCatalog.map((kpi) => (kpi.id === id ? { ...kpi, points: next.points } : kpi)),
          })),
        )
        return null
      },
      addEmployee: (name, position) => {
        const trimmedName = name.trim()
        const trimmedPosition = position.trim()
        if (!trimmedName || !trimmedPosition) return null
        const id = uid()
        set((state) =>
          mapEveryPeriod(state, (period) => ({
            ...period,
            employees: [
              ...period.employees,
              { id, name: trimmedName, position: trimmedPosition, managerId: null, indicators: [] },
            ],
          })),
        )
        return id
      },
      updateEmployee: (id, patch) =>
        set((state) => {
          const name = patch.name.trim()
          const position = patch.position.trim()
          if (!name || !position) return state
          return mapEveryPeriod(state, (period) => ({
            ...period,
            employees: period.employees.map((employee) =>
              employee.id === id ? { ...employee, name, position } : employee,
            ),
          }))
        }),
      setManager: (id, managerId) =>
        set((state) => {
          const next = state.employees.map((employee) =>
            employee.id === id ? { ...employee, managerId } : employee,
          )
          const byId = new Map(next.map((employee) => [employee.id, employee]))
          const employee = byId.get(id)
          if (!employee) return state
          if (directManagerId(employee, byId) !== managerId) return state
          return mapEveryPeriod(state, (period) => ({
            ...period,
            employees: period.employees.map((item) => (item.id === id ? { ...item, managerId } : item)),
          }))
        }),
      removeEmployee: (id) =>
        set((state) => {
          const removed = state.employees.find((employee) => employee.id === id)
          const nextManager = removed?.managerId ?? null
          return mapEveryPeriod(state, (period) => ({
            ...period,
            employees: period.employees
              .filter((employee) => employee.id !== id)
              .map((employee) => ({
                ...employee,
                managerId: employee.managerId === id ? nextManager : employee.managerId,
                indicators: employee.indicators.map((indicator) => {
                  if (indicator.type !== 'standard' || indicator.evaluatorId !== id) return indicator
                  const fallback = employee.managerId === id ? nextManager : employee.managerId
                  return { ...indicator, evaluatorId: fallback }
                }),
              })),
          }))
        }),
      addIndicator: (employeeId, indicator) =>
        set((state) => {
          const employee = state.employees.find((item) => item.id === employeeId)
          if (!employee || !fitsMatrixWeight(employee.indicators, undefined, indicator.weight)) return state
          return mapCurrentPeriod(state, (period) => ({
            ...period,
            employees: period.employees.map((item) =>
              item.id === employeeId ? { ...item, indicators: [...item.indicators, indicator] } : item,
            ),
          }))
        }),
      updateIndicator: (employeeId, indicator) =>
        set((state) => {
          const employee = state.employees.find((item) => item.id === employeeId)
          if (!employee || !fitsMatrixWeight(employee.indicators, indicator.id, indicator.weight)) return state
          return mapCurrentPeriod(state, (period) => ({
            ...period,
            employees: period.employees.map((item) =>
              item.id === employeeId
                ? { ...item, indicators: item.indicators.map((current) => (current.id === indicator.id ? indicator : current)) }
                : item,
            ),
          }))
        }),
      removeIndicator: (employeeId, indicatorId) =>
        set((state) =>
          mapCurrentPeriod(state, (period) => ({
            ...period,
            employees: period.employees.map((employee) =>
              employee.id === employeeId
                ? { ...employee, indicators: employee.indicators.filter((indicator) => indicator.id !== indicatorId) }
                : employee,
            ),
          })),
        ),
      addCatalogKpi: (kpi) =>
        set((state) =>
          mapEveryPeriod(state, (period) => ({
            ...period,
            kpiCatalog: period.kpiCatalog.some((item) => item.id === kpi.id)
              ? period.kpiCatalog.map((item) =>
                  item.id === kpi.id
                    ? period.id === state.currentPeriod
                      ? kpi
                      : { ...item, name: kpi.name, unit: kpi.unit }
                    : item,
                )
              : [...period.kpiCatalog, period.id === state.currentPeriod ? kpi : { ...structuredClone(kpi), fact: 0 }],
          })),
        ),
      updateCatalogKpi: (kpi) =>
        set((state) =>
          mapEveryPeriod(state, (period) => ({
            ...period,
            kpiCatalog: period.kpiCatalog.map((item) => {
              if (item.id !== kpi.id) return item
              return period.id === state.currentPeriod ? kpi : { ...item, name: kpi.name, unit: kpi.unit }
            }),
          })),
        ),
      removeCatalogKpi: (id) =>
        set((state) =>
          mapEveryPeriod(state, (period) => ({
            ...period,
            kpiCatalog: period.kpiCatalog.filter((item) => item.id !== id),
            employees: period.employees.map((employee) => ({
              ...employee,
              indicators: employee.indicators.filter(
                (indicator) => !(indicator.type === 'kpi' && indicator.catalogId === id),
              ),
            })),
          })),
        ),
      setCatalogFact: (id, fact) =>
        set((state) =>
          mapCurrentPeriod(state, (period) => ({
            ...period,
            kpiCatalog: period.kpiCatalog.map((item) => (item.id === id ? { ...item, fact } : item)),
          })),
        ),
      assignKpi: (employeeId, catalogId, weight) =>
        set((state) => {
          if (!state.kpiCatalog.some((item) => item.id === catalogId)) return state
          if (!Number.isFinite(weight) || weight <= 0) return state
          const employee = state.employees.find((item) => item.id === employeeId)
          if (!employee) return state
          if (employee.indicators.some((indicator) => indicator.type === 'kpi' && indicator.catalogId === catalogId)) {
            return state
          }
          if (!fitsMatrixWeight(employee.indicators, undefined, weight)) return state
          return mapCurrentPeriod(state, (period) => ({
            ...period,
            employees: period.employees.map((item) =>
              item.id === employeeId
                ? { ...item, indicators: [...item.indicators, { id: uid(), type: 'kpi', catalogId, weight }] }
                : item,
            ),
          }))
        }),
      setSmartWeight: (employeeId, weight) =>
        set((state) => {
          if (!Number.isFinite(weight) || weight <= 0) return state
          const employee = state.employees.find((item) => item.id === employeeId)
          const group = employee?.indicators.find((indicator) => indicator.type === 'smart')
          if (!employee || !group || !fitsMatrixWeight(employee.indicators, group.id, weight)) return state
          return mapCurrentPeriod(state, (period) => ({
            ...period,
            employees: period.employees.map((item) =>
              item.id === employeeId
                ? {
                    ...item,
                    indicators: item.indicators.map((indicator) =>
                      indicator.type === 'smart' ? { ...indicator, weight } : indicator,
                    ),
                  }
                : item,
            ),
          }))
        }),
      addSmartTask: (employeeId, task, matrixWeight) =>
        set((state) => {
          const employee = state.employees.find((item) => item.id === employeeId)
          if (!employee) return state
          const group = employee.indicators.find((indicator) => indicator.type === 'smart')
          if (group?.type === 'smart') {
            if (group.tasks.some((item) => item.id === task.id)) return state
            return mapCurrentPeriod(state, (period) => ({
              ...period,
              employees: period.employees.map((item) =>
                item.id === employeeId
                  ? {
                      ...item,
                      indicators: item.indicators.map((indicator) =>
                        indicator.type === 'smart' ? { ...indicator, tasks: [...indicator.tasks, task] } : indicator,
                      ),
                    }
                  : item,
              ),
            }))
          }
          if (
            matrixWeight === undefined ||
            !Number.isFinite(matrixWeight) ||
            !fitsMatrixWeight(employee.indicators, undefined, matrixWeight)
          ) {
            return state
          }
          return mapCurrentPeriod(state, (period) => ({
            ...period,
            employees: period.employees.map((item) =>
              item.id === employeeId
                ? {
                    ...item,
                    indicators: [
                      ...item.indicators,
                      { id: uid(), type: 'smart', weight: matrixWeight, tasks: [task], points: defaultSmartPoints() },
                    ],
                  }
                : item,
            ),
          }))
        }),
      updateSmartTask: (employeeId, task) =>
        set((state) =>
          mapCurrentPeriod(state, (period) => ({
            ...period,
            employees: mapSmartTask(period.employees, employeeId, task.id, () => task),
          })),
        ),
      removeSmartTask: (employeeId, taskId) =>
        set((state) =>
          mapCurrentPeriod(state, (period) => ({
            ...period,
            employees: period.employees.map((employee) => {
              if (employee.id !== employeeId) return employee
              return {
                ...employee,
                indicators: employee.indicators.map((indicator) =>
                  indicator.type === 'smart'
                    ? { ...indicator, tasks: indicator.tasks.filter((task) => task.id !== taskId) }
                    : indicator,
                ),
              }
            }),
          })),
        ),
      setStatus: (employeeId, taskId, status) =>
        set((state) =>
          mapCurrentPeriod(state, (period) => ({
            ...period,
            employees: mapSmartTask(period.employees, employeeId, taskId, (task) => ({ ...task, status })),
          })),
        ),
      addComment: (employeeId, taskId, comment) =>
        set((state) =>
          mapCurrentPeriod(state, (period) => ({
            ...period,
            employees: mapSmartTask(period.employees, employeeId, taskId, (task) => ({
              ...task,
              comments: [...task.comments, comment],
            })),
          })),
        ),
      setScore: (employeeId, indicatorId, score) =>
        set((state) =>
          mapCurrentPeriod(state, (period) => ({
            ...period,
            employees: mapIndicator(period.employees, employeeId, indicatorId, (indicator) =>
              indicator.type === 'standard' ? { ...indicator, score } : indicator,
            ),
          })),
        ),
      setPeriodScore: (periodId, employeeId, indicatorId, score) =>
        set((state) => {
          if (!state.periods.some((period) => period.id === periodId)) return state
          const periods = state.periods.map((period) =>
            period.id === periodId
              ? {
                  ...period,
                  employees: mapIndicator(period.employees, employeeId, indicatorId, (indicator) =>
                    indicator.type === 'standard' ? { ...indicator, score } : indicator,
                  ),
                }
              : period,
          )
          return publishPeriods(periods, state.currentPeriod)
        }),
      setEvaluator: (employeeId, indicatorId, evaluatorId) =>
        set((state) => {
          if (evaluatorId !== null && !state.employees.some((employee) => employee.id === evaluatorId)) return state
          return mapCurrentPeriod(state, (period) => ({
            ...period,
            employees: mapIndicator(period.employees, employeeId, indicatorId, (indicator) =>
              indicator.type === 'standard' ? { ...indicator, evaluatorId } : indicator,
            ),
          }))
        }),
    }),
)
