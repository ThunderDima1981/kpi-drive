import { describe, expect, it } from 'vitest'
import { createSeed } from '../data/seed.ts'
import { directManagerId, filterOrg, orgForest, sanitizeEmployees } from './org.ts'
import type { Employee } from '../types.ts'

function person(id: string, managerId: string | null): Employee {
  return { id, name: id, position: 'роль', managerId, indicators: [] }
}

describe('employee hierarchy', () => {
  it('places the analyst under the marketing director', () => {
    const forest = orgForest(createSeed().employees)
    const ivanov = forest.find((node) => node.employee.id === 'emp-ivanov')
    expect(ivanov?.children.map((node) => node.employee.id)).toEqual(['emp-sidorov'])
    expect(forest.some((node) => node.employee.id === 'emp-sidorov')).toBe(false)
  })

  it('drops a cycle and a missing manager', () => {
    const employees = sanitizeEmployees([
      person('a', 'b'),
      person('b', 'a'),
      person('c', 'missing'),
    ])
    expect(employees.map((employee) => employee.managerId)).toEqual([null, null, null])
    const byId = new Map(employees.map((employee) => [employee.id, employee]))
    expect(directManagerId(employees[0], byId)).toBeNull()
  })

  it('keeps a manager when the search matches a subordinate', () => {
    const view = filterOrg(orgForest(createSeed().employees), 'аналитик')
    expect(view.nodes.map((node) => node.employee.id)).toEqual(['emp-ivanov'])
    expect(view.expanded.has('emp-ivanov')).toBe(true)
    expect(view.nodes[0]?.children.map((node) => node.employee.id)).toEqual(['emp-sidorov'])
  })
})
