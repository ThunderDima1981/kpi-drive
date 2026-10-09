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

  return {
    query,
    setQuery,
    nodes: view.nodes,
    open: searching ? view.expanded : expanded,
    toggle,
    searching,
  }
}
