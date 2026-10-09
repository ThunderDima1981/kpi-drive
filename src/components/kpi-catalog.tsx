import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KpiScaleDialog } from './kpi-scale-dialog.tsx'
import { defaultKpiPoints, kpiCompletionOf, planPoint } from '../lib/calc.ts'
import { formatNumber, formatPercent } from '../lib/format.ts'
import { useTeamStore } from '../store/team-store.ts'
import type { CatalogKpi } from '../types.ts'

export function KpiCatalogSection() {
  const employees = useTeamStore((state) => state.employees)
  const kpiCatalog = useTeamStore((state) => state.kpiCatalog)
  const addCatalogKpi = useTeamStore((state) => state.addCatalogKpi)
  const updateCatalogKpi = useTeamStore((state) => state.updateCatalogKpi)
  const removeCatalogKpi = useTeamStore((state) => state.removeCatalogKpi)
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [error, setError] = useState('')
  const [chartId, setChartId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const chart = kpiCatalog.find((item) => item.id === chartId) ?? null
  const items = kpiCatalog.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  function add(event: React.FormEvent) {
    event.preventDefault()
    const nextName = name.trim()
    if (!nextName) {
      setError('Введите название показателя.')
      return
    }
    const id = crypto.randomUUID()
    addCatalogKpi({ id, name: nextName, unit: unit.trim(), fact: 0, points: defaultKpiPoints(id) })
    setName('')
    setUnit('')
    setError('')
    setChartId(id)
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <h2 className="font-semibold">Справочник количественных KPI</h2>
      <p className="mt-1 text-sm text-ink-soft">
        План, факт и точки шкалы хранятся здесь. В матрицу сотрудника показатель добавляется отдельно, со своим весом.
      </p>
      <form onSubmit={add} className="mt-4 grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
        <Label className="grid gap-1.5">
          <span>Название</span>
          <Input value={name} aria-label="Название показателя справочника" onValueChange={setName} />
        </Label>
        <Label className="grid gap-1.5">
          <span>Единица</span>
          <Input value={unit} aria-label="Единица показателя справочника" placeholder="шт" onValueChange={setUnit} />
        </Label>
        <Button type="submit">Добавить</Button>
      </form>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">Справочник пуст. Добавьте первый количественный KPI.</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {items.map((item) => (
            <CatalogRow
              key={item.id}
              item={item}
              holders={employees
                .filter((employee) =>
                  employee.indicators.some((indicator) => indicator.type === 'kpi' && indicator.catalogId === item.id),
                )
                .map((employee) => employee.name)}
              pendingDelete={pendingDelete === item.id}
              onChart={() => setChartId(item.id)}
              onRename={(nextName, nextUnit) => updateCatalogKpi({ ...item, name: nextName, unit: nextUnit })}
              onAskDelete={() => setPendingDelete(item.id)}
              onCancel={() => setPendingDelete(null)}
              onDelete={() => {
                removeCatalogKpi(item.id)
                setPendingDelete(null)
              }}
            />
          ))}
        </ul>
      )}
      <KpiScaleDialog kpi={chart} onOpenChange={(open) => { if (!open) setChartId(null) }} />
    </section>
  )
}

function CatalogRow({
  item,
  holders,
  pendingDelete,
  onChart,
  onRename,
  onAskDelete,
  onCancel,
  onDelete,
}: {
  item: CatalogKpi
  holders: string[]
  pendingDelete: boolean
  onChart: () => void
  onRename: (name: string, unit: string) => void
  onAskDelete: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  const [name, setName] = useState(item.name)
  const [unit, setUnit] = useState(item.unit)
  const [source, setSource] = useState({ name: item.name, unit: item.unit })
  if (source.name !== item.name || source.unit !== item.unit) {
    setSource({ name: item.name, unit: item.unit })
    setName(item.name)
    setUnit(item.unit)
  }
  const plan = planPoint(item.points)

  function commit() {
    const nextName = name.trim()
    if (!nextName) {
      setName(item.name)
      setUnit(item.unit)
      return
    }
    if (nextName === item.name && unit.trim() === item.unit) return
    onRename(nextName, unit.trim())
  }

  return (
    <li className="rounded-xl border border-line p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <Label className="grid gap-1.5">
          <span className="sr-only">Название</span>
          <Input value={name} aria-label={`Название KPI: ${item.name}`} onValueChange={setName} onBlur={commit} />
        </Label>
        <Label className="grid gap-1.5">
          <span className="sr-only">Единица</span>
          <Input value={unit} aria-label={`Единица KPI: ${item.name}`} onValueChange={setUnit} onBlur={commit} />
        </Label>
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        План {plan ? formatNumber(plan.value) : '—'}
        {item.unit ? ` ${item.unit}` : ''} · Факт {formatNumber(item.fact)}
        {item.unit ? ` ${item.unit}` : ''} · {formatPercent(kpiCompletionOf(item))}
      </p>
      <p className="mt-1 text-xs text-ink-soft">
        {holders.length > 0 ? `В матрицах: ${holders.join(', ')}` : 'Пока ни в одной матрице'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onChart}>
          График
        </Button>
        {pendingDelete ? (
          <>
            <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
              Удалить из справочника
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Отмена
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={onAskDelete}>
            Удалить
          </Button>
        )}
      </div>
    </li>
  )
}
