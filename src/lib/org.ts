import type { Employee } from '../types.ts'

export interface OrgNode {
  employee: Employee
  children: OrgNode[]
}

export function directManagerId(employee: Employee, byId: Map<string, Employee>): string | null {
  const managerId = employee.managerId
  if (!managerId || managerId === employee.id || !byId.has(managerId)) return null
  const seen = new Set<string>([employee.id])
  let current: string | null = managerId
  while (current) {
    if (seen.has(current)) return null
    seen.add(current)
    const manager = byId.get(current)
    if (!manager) break
    const next = manager.managerId
    if (!next || next === current || !byId.has(next)) break
    current = next
  }
  return managerId
}

export function orgForest(employees: Employee[]): OrgNode[] {
  const byId = new Map(employees.map((employee) => [employee.id, employee]))
  const children = new Map<string, Employee[]>()
  const roots: Employee[] = []
  for (const employee of employees) {
    const managerId = directManagerId(employee, byId)
    if (!managerId) {
      roots.push(employee)
      continue
    }
    const list = children.get(managerId) ?? []
    list.push(employee)
    children.set(managerId, list)
  }
  const toNode = (employee: Employee): OrgNode => ({
    employee,
    children: (children.get(employee.id) ?? []).map(toNode),
  })
  return roots.map(toNode)
}

export function matchesEmployee(employee: Employee, query: string) {
  const needle = query.trim().toLocaleLowerCase('ru-RU')
  if (!needle) return true
  return (
    employee.name.toLocaleLowerCase('ru-RU').includes(needle) ||
    employee.position.toLocaleLowerCase('ru-RU').includes(needle)
  )
}

export function filterOrg(nodes: OrgNode[], query: string): { nodes: OrgNode[]; expanded: Set<string> } {
  const expanded = new Set<string>()
  if (!query.trim()) return { nodes, expanded }
  const visit = (node: OrgNode): OrgNode | null => {
    const children = node.children.flatMap((child) => {
      const next = visit(child)
      return next ? [next] : []
    })
    if (!matchesEmployee(node.employee, query) && children.length === 0) return null
    if (children.length > 0) expanded.add(node.employee.id)
    return { employee: node.employee, children }
  }
  return {
    nodes: nodes.flatMap((node) => {
      const next = visit(node)
      return next ? [next] : []
    }),
    expanded,
  }
}

export function managerChoices(employees: Employee[], employeeId: string) {
  return employees.filter((candidate) => {
    if (candidate.id === employeeId) return false
    const trial = employees.map((employee) =>
      employee.id === employeeId ? { ...employee, managerId: candidate.id } : employee,
    )
    const byId = new Map(trial.map((employee) => [employee.id, employee]))
    const employee = byId.get(employeeId)
    return employee ? directManagerId(employee, byId) === candidate.id : false
  })
}

export function sanitizeEmployees(employees: Employee[]): Employee[] {
  const byId = new Map(employees.map((employee) => [employee.id, employee]))
  return employees.map((employee) => ({
    ...employee,
    managerId: directManagerId(employee, byId),
  }))
}
