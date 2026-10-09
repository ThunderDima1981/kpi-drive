import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createSeed } from '../data/seed.ts'
import { normalizeIndicator } from '../lib/smart.ts'
import type { Employee, Indicator, SmartComment, SmartStatus, StandardScore, TeamData } from '../types.ts'

interface TeamState extends TeamData {
  setPeriodLabel: (periodLabel: string) => void
  addEmployee: (name: string, position: string) => string | null
  updateEmployee: (id: string, patch: Pick<Employee, 'name' | 'position'>) => void
  removeEmployee: (id: string) => void
  addIndicator: (employeeId: string, indicator: Indicator) => void
  updateIndicator: (employeeId: string, indicator: Indicator) => void
  removeIndicator: (employeeId: string, indicatorId: string) => void
  setFact: (employeeId: string, indicatorId: string, fact: number) => void
  setStatus: (employeeId: string, indicatorId: string, status: SmartStatus) => void
  addComment: (employeeId: string, indicatorId: string, comment: SmartComment) => void
  setScore: (employeeId: string, indicatorId: string, score: StandardScore) => void
  resetDemo: () => void
}

function uid() {
  return crypto.randomUUID()
}

function normalizeTeam(persisted: unknown): TeamData {
  const data = persisted as Partial<TeamData> | undefined
  const employees = Array.isArray(data?.employees) ? data.employees : []
  return {
    periodLabel: typeof data?.periodLabel === 'string' ? data.periodLabel : '',
    employees: employees.map((employee) => ({
      ...employee,
      indicators: Array.isArray(employee.indicators) ? employee.indicators.map(normalizeIndicator) : [],
    })),
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
            { id, name: trimmedName, position: trimmedPosition, indicators: [] },
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
      removeEmployee: (id) =>
        set((state) => ({
          employees: state.employees.filter((employee) => employee.id !== id),
        })),
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
