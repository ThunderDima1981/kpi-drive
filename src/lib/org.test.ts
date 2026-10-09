import { describe, expect, it } from 'vitest'
import { directManagerId, filterOrg, orgForest, sanitizeEmployees } from './org.ts'
import type { Employee } from '../types.ts'

function person(id: string, name: string, managerId: string | null): Employee {
  return { id, name, position: 'роль', managerId, indicators: [] }
}

describe('employee hierarchy', () => {
  it('places a subordinate under the manager', () => {
    const forest = orgForest([
      person('director', 'Директор', null),
      person('analyst', 'Аналитик', 'director'),
    ])
    const director = forest.find((node) => node.employee.id === 'director')
    expect(director?.children.map((node) => node.employee.id)).toEqual(['analyst'])
    expect(forest.some((node) => node.employee.id === 'analyst')).toBe(false)
  })

  it('drops a cycle and a missing manager', () => {
    const employees = sanitizeEmployees([
      person('a', 'А', 'b'),
      person('b', 'Б', 'a'),
      person('c', 'В', 'missing'),
    ])
    expect(employees.map((employee) => employee.managerId)).toEqual([null, null, null])
    const byId = new Map(employees.map((employee) => [employee.id, employee]))
    expect(directManagerId(employees[0]!, byId)).toBeNull()
  })

  it('keeps a manager when the search matches a subordinate', () => {
    const view = filterOrg(
      orgForest([
        person('director', 'Директор', null),
        person('analyst', 'Аналитик', 'director'),
      ]),
      'аналитик',
    )
    expect(view.nodes.map((node) => node.employee.id)).toEqual(['director'])
    expect(view.expanded.has('director')).toBe(true)
    expect(view.nodes[0]?.children.map((node) => node.employee.id)).toEqual(['analyst'])
  })
})
