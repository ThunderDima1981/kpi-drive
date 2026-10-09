import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createSeed } from '../data/seed.ts'
import { normalizeCatalogKpi, normalizeEvaluatorId, normalizeStandard, pointsFromLegacyScale, DEFAULT_MAX_CAP, fitsMatrixWeight } from '../lib/calc.ts'
import { directManagerId, sanitizeEmployees } from '../lib/org.ts'
import { collapseSmartIndicators, defaultSmartPoints, normalizeIndicator } from '../lib/smart.ts'
import type { CatalogKpi, Employee, Indicator, KpiIndicator, SmartComment, SmartStatus, SmartTask, TeamData } from '../types.ts'

interface TeamState extends TeamData {
  setPeriodLabel: (periodLabel: string) => void
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
  setEvaluator: (employeeId: string, indicatorId: string, evaluatorId: string | null) => void
  resetDemo: () => void
}

function uid() {
  return crypto.randomUUID()
}

function normalizeTeam(persisted: unknown): TeamData {
  const data = persisted as Partial<TeamData> | undefined
  const raw = Array.isArray(data?.employees) ? data.employees : []
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
  if (Array.isArray(data?.kpiCatalog)) {
    for (const item of data.kpiCatalog) {
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
    periodLabel: typeof data?.periodLabel === 'string' ? data.periodLabel : '',
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

const seed = createSeed()

export const useTeamStore = create<TeamState>()(
  persist(
    (set) => ({
      periodLabel: seed.periodLabel,
      employees: seed.employees,
      kpiCatalog: seed.kpiCatalog,
      setPeriodLabel: (periodLabel) => set({ periodLabel }),
      addEmployee: (name, position) => {
        const trimmedName = name.trim()
        const trimmedPosition = position.trim()
        if (!trimmedName || !trimmedPosition) return null
        const id = uid()
        set((state) => ({
          employees: [
            ...state.employees,
            { id, name: trimmedName, position: trimmedPosition, managerId: null, indicators: [] },
          ],
        }))
        return id
      },
      updateEmployee: (id, patch) =>
        set((state) => ({
          employees: state.employees.map((employee) => {
            if (employee.id !== id) return employee
            const name = patch.name.trim()
            const position = patch.position.trim()
            if (!name || !position) return employee
            return { ...employee, name, position }
          }),
        })),
      setManager: (id, managerId) =>
        set((state) => {
          const next = state.employees.map((employee) =>
            employee.id === id ? { ...employee, managerId } : employee,
          )
          const byId = new Map(next.map((employee) => [employee.id, employee]))
          const employee = byId.get(id)
          if (!employee) return state
          if (directManagerId(employee, byId) !== managerId) return state
          return { employees: next }
        }),
      removeEmployee: (id) =>
        set((state) => {
          const removed = state.employees.find((employee) => employee.id === id)
          const nextManager = removed?.managerId ?? null
          return {
            employees: state.employees
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
          }
        }),
      addIndicator: (employeeId, indicator) =>
        set((state) => ({
          employees: state.employees.map((employee) => {
            if (employee.id !== employeeId) return employee
            if (!fitsMatrixWeight(employee.indicators, undefined, indicator.weight)) return employee
            return { ...employee, indicators: [...employee.indicators, indicator] }
          }),
        })),
      updateIndicator: (employeeId, indicator) =>
        set((state) => ({
          employees: state.employees.map((employee) => {
            if (employee.id !== employeeId) return employee
            if (!fitsMatrixWeight(employee.indicators, indicator.id, indicator.weight)) return employee
            return {
              ...employee,
              indicators: employee.indicators.map((item) => (item.id === indicator.id ? indicator : item)),
            }
          }),
        })),
      removeIndicator: (employeeId, indicatorId) =>
        set((state) => ({
          employees: state.employees.map((employee) =>
            employee.id === employeeId
              ? {
                  ...employee,
                  indicators: employee.indicators.filter((indicator) => indicator.id !== indicatorId),
                }
              : employee,
          ),
        })),
      addCatalogKpi: (kpi) =>
        set((state) => ({
          kpiCatalog: state.kpiCatalog.some((item) => item.id === kpi.id)
            ? state.kpiCatalog.map((item) => (item.id === kpi.id ? kpi : item))
            : [...state.kpiCatalog, kpi],
        })),
      updateCatalogKpi: (kpi) =>
        set((state) => ({
          kpiCatalog: state.kpiCatalog.map((item) => (item.id === kpi.id ? kpi : item)),
        })),
      removeCatalogKpi: (id) =>
        set((state) => ({
          kpiCatalog: state.kpiCatalog.filter((item) => item.id !== id),
          employees: state.employees.map((employee) => ({
            ...employee,
            indicators: employee.indicators.filter(
              (indicator) => !(indicator.type === 'kpi' && indicator.catalogId === id),
            ),
          })),
        })),
      setCatalogFact: (id, fact) =>
        set((state) => ({
          kpiCatalog: state.kpiCatalog.map((item) => (item.id === id ? { ...item, fact } : item)),
        })),
      assignKpi: (employeeId, catalogId, weight) =>
        set((state) => {
          if (!state.kpiCatalog.some((item) => item.id === catalogId)) return state
          if (!Number.isFinite(weight) || weight <= 0) return state
          return {
            employees: state.employees.map((employee) => {
              if (employee.id !== employeeId) return employee
              if (employee.indicators.some((indicator) => indicator.type === 'kpi' && indicator.catalogId === catalogId)) {
                return employee
              }
              if (!fitsMatrixWeight(employee.indicators, undefined, weight)) return employee
              return {
                ...employee,
                indicators: [...employee.indicators, { id: uid(), type: 'kpi', catalogId, weight }],
              }
            }),
          }
        }),
      setSmartWeight: (employeeId, weight) =>
        set((state) => {
          if (!Number.isFinite(weight) || weight <= 0) return state
          return {
            employees: state.employees.map((employee) => {
              if (employee.id !== employeeId) return employee
              const group = employee.indicators.find((indicator) => indicator.type === 'smart')
              if (!group || !fitsMatrixWeight(employee.indicators, group.id, weight)) return employee
              return {
                ...employee,
                indicators: employee.indicators.map((indicator) =>
                  indicator.type === 'smart' ? { ...indicator, weight } : indicator,
                ),
              }
            }),
          }
        }),
      addSmartTask: (employeeId, task, matrixWeight) =>
        set((state) => ({
          employees: state.employees.map((employee) => {
            if (employee.id !== employeeId) return employee
            const group = employee.indicators.find((indicator) => indicator.type === 'smart')
            if (group?.type === 'smart') {
              if (group.tasks.some((item) => item.id === task.id)) return employee
              return {
                ...employee,
                indicators: employee.indicators.map((indicator) =>
                  indicator.type === 'smart' ? { ...indicator, tasks: [...indicator.tasks, task] } : indicator,
                ),
              }
            }
            if (
              matrixWeight === undefined ||
              !Number.isFinite(matrixWeight) ||
              !fitsMatrixWeight(employee.indicators, undefined, matrixWeight)
            ) {
              return employee
            }
            return {
              ...employee,
              indicators: [
                ...employee.indicators,
                { id: uid(), type: 'smart', weight: matrixWeight, tasks: [task], points: defaultSmartPoints() },
              ],
            }
          }),
        })),
      updateSmartTask: (employeeId, task) =>
        set((state) => ({
          employees: mapSmartTask(state.employees, employeeId, task.id, () => task),
        })),
      removeSmartTask: (employeeId, taskId) =>
        set((state) => ({
          employees: state.employees.map((employee) => {
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
      setStatus: (employeeId, taskId, status) =>
        set((state) => ({
          employees: mapSmartTask(state.employees, employeeId, taskId, (task) => ({ ...task, status })),
        })),
      addComment: (employeeId, taskId, comment) =>
        set((state) => ({
          employees: mapSmartTask(state.employees, employeeId, taskId, (task) => ({
            ...task,
            comments: [...task.comments, comment],
          })),
        })),
      setScore: (employeeId, indicatorId, score) =>
        set((state) => ({
          employees: mapIndicator(state.employees, employeeId, indicatorId, (indicator) =>
            indicator.type === 'standard' ? { ...indicator, score } : indicator,
          ),
        })),
      setEvaluator: (employeeId, indicatorId, evaluatorId) =>
        set((state) => {
          if (evaluatorId !== null && !state.employees.some((employee) => employee.id === evaluatorId)) return state
          return {
            employees: mapIndicator(state.employees, employeeId, indicatorId, (indicator) =>
              indicator.type === 'standard' ? { ...indicator, evaluatorId } : indicator,
            ),
          }
        }),
      resetDemo: () => {
        const next = createSeed()
        set({ periodLabel: next.periodLabel, employees: next.employees, kpiCatalog: next.kpiCatalog })
      },
    }),
    {
      name: 'kpi-drive-mbo',
      version: 2,
      partialize: (state) => ({
        periodLabel: state.periodLabel,
        employees: state.employees,
        kpiCatalog: state.kpiCatalog,
      }),
      migrate: (persisted) => normalizeTeam(persisted),
      merge: (persisted, current) => {
        const raw = persisted as Partial<TeamData> | undefined
        const data = normalizeTeam(persisted)
        return {
          ...current,
          periodLabel: typeof raw?.periodLabel === 'string' ? raw.periodLabel : current.periodLabel,
          employees: Array.isArray(raw?.employees) ? data.employees : current.employees,
          kpiCatalog:
            Array.isArray(raw?.kpiCatalog) || Array.isArray(raw?.employees) ? data.kpiCatalog : current.kpiCatalog,
        }
      },
    },
  ),
)
