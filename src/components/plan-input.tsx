import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { planPoint } from '../lib/calc.ts'
import { parseNumber } from '../lib/format.ts'
import { useTeamStore } from '../store/team-store.ts'
import { cn } from '@/lib/utils'

export function PlanInput({ kpiId, className }: { kpiId: string; className?: string }) {
  const period = useTeamStore((state) => state.currentPeriod)
  const kpi = useTeamStore((state) => state.kpiCatalog.find((item) => item.id === kpiId))
  const setCatalogPlan = useTeamStore((state) => state.setCatalogPlan)
  const plan = kpi ? planPoint(kpi.points) : null
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [seenPeriod, setSeenPeriod] = useState(period)
  if (seenPeriod !== period) {
    setSeenPeriod(period)
    setDraft(null)
    setError('')
  }
  if (!kpi || !plan) return <span className="text-ink-soft">—</span>

  function commit(raw: string) {
    const parsed = parseNumber(raw)
    if (parsed === null) {
      setError('Введите число.')
      return
    }
    const message = setCatalogPlan(kpiId, parsed)
    setError(message ?? '')
  }

  return (
    <span className="grid gap-1">
      <Input
        aria-label={`План: ${kpi.name}`}
        inputMode="decimal"
        aria-invalid={Boolean(error)}
        className={cn('h-8 w-24 bg-white tabular-nums', className)}
        value={draft ?? String(plan.value)}
        onFocus={() => {
          setDraft(String(plan.value))
          setError('')
        }}
        onValueChange={(next) => {
          setDraft(next)
          const parsed = parseNumber(next)
          if (parsed === null) return
          const message = setCatalogPlan(kpiId, parsed)
          setError(message ?? '')
        }}
        onBlur={() => {
          if (draft !== null) commit(draft)
          setDraft(null)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          commit((event.currentTarget as HTMLInputElement).value)
          setDraft(null)
        }}
      />
      {error ? <span className="text-xs font-normal text-destructive">{error}</span> : null}
    </span>
  )
}
