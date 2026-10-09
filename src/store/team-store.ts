import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createSeed } from '../data/seed.ts'
import { normalizeEvaluatorId, normalizeStandard } from '../lib/calc.ts'
import { directManagerId, sanitizeEmployees } from '../lib/org.ts'
import { normalizeIndicator } from '../lib/smart.ts'
import type { Employee, Indicator, SmartComment, SmartStatus, TeamData } from '../types.ts'

interface TeamState extends TeamData {
  setPeriodLabel: (periodLabel: string) => void
  addEmployee: (name: string, position: string) => string | null
  updateEmployee: (id: string, patch: Pick<Employee, 'name' | 'position'>) => void
  setManager: (id: string, managerId: string | null) => void
  removeEmployee: (id: string) => void
  addIndicator: (employeeId: string, indicator: Indicator) => void
  updateIndicator: (employeeId: string, indicator: Indicator) => void
  removeIndicator: (employeeId: string, indicatorId: string) => void
  setFact: (employeeId: string, indicatorId: string, fact: number) => void
  setStatus: (employeeId: string, indicatorId: string, status: SmartStatus) => void
  addComment: (employeeId: string, indicatorId: string, comment: SmartComment) => void
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
  return {
    periodLabel: typeof data?.periodLabel === 'string' ? data.periodLabel : '',
    employees,
  }
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
          employees: state.employees.map((employee) =>
            employee.id === employeeId
              ? { ...employee, indicators: [...employee.indicators, indicator] }
              : employee,
          ),
        })),
      updateIndicator: (employeeId, indicator) =>
        set((state) => ({
          employees: mapIndicator(state.employees, employeeId, indicator.id, () => indicator),
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
      setFact: (employeeId, indicatorId, fact) =>
        set((state) => ({
          employees: mapIndicator(state.employees, employeeId, indicatorId, (indicator) =>
            indicator.type === 'kpi' ? { ...indicator, fact } : indicator,
          ),
        })),
      setStatus: (employeeId, indicatorId, status) =>
        set((state) => ({
          employees: mapIndicator(state.employees, employeeId, indicatorId, (indicator) =>
            indicator.type === 'smart' ? { ...indicator, status } : indicator,
          ),
        })),
      addComment: (employeeId, indicatorId, comment) =>
        set((state) => ({
          employees: mapIndicator(state.employees, employeeId, indicatorId, (indicator) =>
            indicator.type === 'smart' ? { ...indicator, comments: [...indicator.comments, comment] } : indicator,
          ),
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
        set({ periodLabel: next.periodLabel, employees: next.employees })
      },
    }),
    {
      name: 'kpi-drive-mbo',
      version: 2,
      partialize: (state) => ({
        periodLabel: state.periodLabel,
        employees: state.employees,
      }),
      migrate: (persisted) => normalizeTeam(persisted),
      merge: (persisted, current) => {
        const raw = persisted as Partial<TeamData> | undefined
        const data = normalizeTeam(persisted)
        return {
          ...current,
          periodLabel: typeof raw?.periodLabel === 'string' ? raw.periodLabel : current.periodLabel,
          employees: Array.isArray(raw?.employees) ? data.employees : current.employees,
        }
      },
    },
  ),
)
