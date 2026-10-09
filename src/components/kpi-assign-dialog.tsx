import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { defaultKpiPoints, findCatalogKpi, kpiCompletionOf, planPoint } from '../lib/calc.ts'
import { formatNumber, formatPercent, parseNumber } from '../lib/format.ts'
import { useTeamStore } from '../store/team-store.ts'
import type { KpiIndicator } from '../types.ts'

export function KpiAssignDialog({
  employeeId,
  open,
  onOpenChange,
}: {
  employeeId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const employees = useTeamStore((state) => state.employees)
  const kpiCatalog = useTeamStore((state) => state.kpiCatalog)
  const assignKpi = useTeamStore((state) => state.assignKpi)
  const addCatalogKpi = useTeamStore((state) => state.addCatalogKpi)
  const employee = employees.find((item) => item.id === employeeId)
  const taken = new Set(
    employee?.indicators.flatMap((indicator) => (indicator.type === 'kpi' ? [indicator.catalogId] : [])) ?? [],
  )
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [weight, setWeight] = useState('10')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [error, setError] = useState('')

  const needle = query.trim().toLocaleLowerCase('ru')
  const items = kpiCatalog
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    .filter((item) => !needle || item.name.toLocaleLowerCase('ru').includes(needle))

  function close() {
    setQuery('')
    setSelectedId('')
    setWeight('10')
    setCreating(false)
    setName('')
    setUnit('')
    setError('')
    onOpenChange(false)
  }

  function save(event: React.FormEvent) {
    event.preventDefault()
    const parsed = parseNumber(weight)
    if (parsed === null || parsed <= 0 || parsed > 100) {
      setError('Вес — число больше 0 и не больше 100.')
      return
    }
    if (creating) {
      const nextName = name.trim()
      if (!nextName) {
        setError('Введите название показателя.')
        return
      }
      const id = crypto.randomUUID()
      addCatalogKpi({ id, name: nextName, unit: unit.trim(), fact: 0, points: defaultKpiPoints(id) })
      assignKpi(employeeId, id, parsed)
      close()
      return
    }
    if (!selectedId || taken.has(selectedId)) {
      setError('Выберите показатель из справочника.')
      return
    }
    assignKpi(employeeId, selectedId, parsed)
    close()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        <form className="flex max-h-[min(92vh,760px)] min-h-0 flex-col" onSubmit={save}>
          <DialogHeader className="px-4 pt-4 pr-12">
            <DialogTitle>Добавить количественный KPI</DialogTitle>
            <DialogDescription>
              Показатель берётся из общего справочника. План, факт и шкала одни на всех, в матрице задаётся вес.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid min-h-0 flex-1 gap-3 overflow-y-auto px-4 pb-4">
            {creating ? (
              <>
                <Label className="grid gap-1.5">
                  <span>Название</span>
                  <Input value={name} aria-label="Название нового KPI" onValueChange={setName} />
                </Label>
                <Label className="grid gap-1.5">
                  <span>Единица</span>
                  <Input value={unit} aria-label="Единица нового KPI" placeholder="шт, ₽, %" onValueChange={setUnit} />
                </Label>
                <p className="text-xs text-ink-soft">
                  Шкала по умолчанию: 0 → 0%, 100 → 100%, 200 → 130%. Точки и факт меняются на графике.
                </p>
              </>
            ) : (
              <>
                <Input
                  value={query}
                  aria-label="Поиск по справочнику KPI"
                  placeholder="Поиск по названию"
                  onValueChange={setQuery}
                />
                {items.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line px-3 py-6 text-sm text-ink-soft">
                    В справочнике ничего не нашлось. Создайте новый показатель.
                  </p>
                ) : (
                  <ul className="grid gap-2">
                    {items.map((item) => {
                      const used = taken.has(item.id)
                      const selected = selectedId === item.id
                      const plan = planPoint(item.points)
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            disabled={used}
                            aria-pressed={selected}
                            onClick={() => {
                              setSelectedId(item.id)
                              setError('')
                            }}
                            className={
                              selected
                                ? 'w-full rounded-xl border border-pine bg-pine/5 px-3 py-2 text-left'
                                : 'w-full rounded-xl border border-line px-3 py-2 text-left enabled:hover:bg-muted disabled:opacity-60'
                            }
                          >
                            <span className="block text-sm font-medium">{item.name}</span>
                            <span className="mt-1 block text-xs text-ink-soft">
                              План {plan ? formatNumber(plan.value) : '—'}
                              {item.unit ? ` ${item.unit}` : ''} · Факт {formatNumber(item.fact)}
                              {item.unit ? ` ${item.unit}` : ''} · {formatPercent(kpiCompletionOf(item))}
                              {used ? ' · Уже в матрице' : ''}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCreating(true)
                    setError('')
                  }}
                >
                  Создать в справочнике
                </Button>
              </>
            )}
            <Label className="grid gap-1.5">
              <span>Вес в матрице, %</span>
              <Input inputMode="decimal" value={weight} aria-label="Вес KPI в матрице" onValueChange={setWeight} />
            </Label>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
          <DialogFooter className="mx-0 mt-0 mb-0 shrink-0 sm:justify-between">
            {creating ? (
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                К справочнику
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <DialogClose render={<Button variant="outline" type="button" />}>Отмена</DialogClose>
              <Button type="submit">Добавить</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function KpiWeightDialog({
  employeeId,
  indicator,
  onOpenChange,
}: {
  employeeId: string
  indicator: KpiIndicator | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={indicator !== null} onOpenChange={onOpenChange}>
      {indicator ? (
        <WeightForm key={indicator.id} employeeId={employeeId} indicator={indicator} onOpenChange={onOpenChange} />
      ) : null}
    </Dialog>
  )
}

function WeightForm({
  employeeId,
  indicator,
  onOpenChange,
}: {
  employeeId: string
  indicator: KpiIndicator
  onOpenChange: (open: boolean) => void
}) {
  const kpiCatalog = useTeamStore((state) => state.kpiCatalog)
  const updateIndicator = useTeamStore((state) => state.updateIndicator)
  const shared = findCatalogKpi(kpiCatalog, indicator.catalogId)
  const [weight, setWeight] = useState(String(indicator.weight))
  const [error, setError] = useState('')

  function save(event: React.FormEvent) {
    event.preventDefault()
    if (!indicator) return
    const parsed = parseNumber(weight)
    if (parsed === null || parsed <= 0 || parsed > 100) {
      setError('Вес — число больше 0 и не больше 100.')
      return
    }
    updateIndicator(employeeId, { ...indicator, weight: parsed })
    onOpenChange(false)
  }

  return (
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-4" onSubmit={save}>
          <DialogHeader>
            <DialogTitle>{shared?.name ?? 'Вес в матрице'}</DialogTitle>
            <DialogDescription>
              В матрице меняется только вес. План, факт и точки шкалы общие и правятся на графике или в справочнике.
            </DialogDescription>
          </DialogHeader>
          <Label className="grid gap-1.5">
            <span>Вес, %</span>
            <Input inputMode="decimal" value={weight} aria-label="Вес KPI в матрице" onValueChange={setWeight} />
          </Label>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <DialogFooter className="mx-0 mb-0 sm:justify-end">
            <DialogClose render={<Button variant="outline" type="button" />}>Отмена</DialogClose>
          <Button type="submit">Сохранить</Button>
        </DialogFooter>
      </form>
      </DialogContent>
  )
}
