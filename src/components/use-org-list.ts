import { useMemo, useState } from 'react'
import { filterOrg, orgForest } from '../lib/org.ts'
import type { Employee } from '../types.ts'

export function useOrgList(employees: Employee[]) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const forest = useMemo(() => orgForest(employees), [employees])
  const searching = query.trim() !== ''
  const view = useMemo(
    () => (searching ? filterOrg(forest, query) : { nodes: forest, expanded }),
    [expanded, forest, query, searching],
  )

  function toggle(id: string) {
    if (searching) return
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function reveal(id: string | null) {
    if (!id) return
    const byId = new Map(employees.map((employee) => [employee.id, employee]))
    setExpanded((current) => {
      const next = new Set(current)
      const seen = new Set<string>()
      let cursor: string | null = id
      while (cursor && !seen.has(cursor)) {
        seen.add(cursor)
        next.add(cursor)
        cursor = byId.get(cursor)?.managerId ?? null
      }
      return next
    })
  }

  return {
    query,
    setQuery,
    nodes: view.nodes,
    open: searching ? view.expanded : expanded,
    toggle,
    reveal,
    searching,
  }
}
