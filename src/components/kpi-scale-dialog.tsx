import { useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { explainKpi, kpiCompletionOf, kpiSeries, planPoint } from '../lib/calc.ts'
import { formatNumber, formatPercent, parseNumber } from '../lib/format.ts'
import { useTeamStore } from '../store/team-store.ts'
import type { CatalogKpi, KpiPoint } from '../types.ts'

export function KpiScaleDialog({
  kpi,
  weight,
  onOpenChange,
}: {
  kpi: CatalogKpi | null
  weight?: number
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={kpi !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,860px)] overflow-y-auto sm:max-w-2xl">
        {kpi ? <KpiScaleEditor key={kpi.id} kpi={kpi} weight={weight} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function KpiScaleEditor({ kpi, weight }: { kpi: CatalogKpi; weight?: number }) {
  const updateCatalogKpi = useTeamStore((state) => state.updateCatalogKpi)
  const setCatalogFact = useTeamStore((state) => state.setCatalogFact)
  const [drafts, setDrafts] = useState<Record<string, { value?: string; completion?: string }>>({})
  const [factDraft, setFactDraft] = useState<string | null>(null)
  const [error, setError] = useState('')
  const data = kpiSeries(kpi)
  const values = data.map((point) => point.value)
  const completions = data.map((point) => point.completion)
  const low = Math.min(...values)
  const high = Math.max(...values)
  const span = high - low || Math.max(Math.abs(kpi.fact), 1)
  const pad = Math.max(span * 0.08, 0.4)
  const points = kpi.points.slice().sort((a, b) => a.value - b.value || a.id.localeCompare(b.id))
  const plan = planPoint(kpi.points)
  const completion = kpiCompletionOf(kpi)

  function text(point: KpiPoint, field: 'value' | 'completion') {
    return drafts[point.id]?.[field] ?? String(point[field])
  }

  function currentKpi() {
    return useTeamStore.getState().kpiCatalog.find((item) => item.id === kpi.id) ?? kpi
  }

  function clearDraft(pointId: string, field: 'value' | 'completion') {
    setDrafts((current) => {
      const entry = { ...current[pointId] }
      delete entry[field]
      const next = { ...current }
      if (entry.value === undefined && entry.completion === undefined) delete next[pointId]
      else next[pointId] = entry
      return next
    })
  }

  function apply(point: KpiPoint, field: 'value' | 'completion', raw: string, finalize: boolean) {
    const source = currentKpi()
    const value = parseNumber(raw)
    if (value === null) {
      if (finalize) setError('Введите число.')
      return
    }
    if (field === 'completion' && (value < 0 || value > 200)) {
      setError('Процент выполнения — от 0 до 200.')
      return
    }
    if (field === 'value' && source.points.some((item) => item.id !== point.id && sameValue(item.value, value))) {
      setError('Такое значение уже есть на шкале.')
      return
    }
    const stored = source.points.find((item) => item.id === point.id) ?? point
    const unchanged = field === 'value' ? sameValue(value, stored.value) : value === stored.completion
    if (!unchanged) {
      updateCatalogKpi({
        ...source,
        points: source.points.map((item) => (item.id === point.id ? { ...item, [field]: value } : item)),
      })
    }
    if (finalize) clearDraft(point.id, field)
    setError('')
  }

  function applyFact(raw: string, finalize: boolean) {
    const value = parseNumber(raw)
    if (value === null) {
      if (finalize) setError('Введите число.')
      return
    }
    if (value !== currentKpi().fact) setCatalogFact(kpi.id, value)
    if (finalize) setFactDraft(null)
    setError('')
  }

  function addPoint() {
    const source = currentKpi()
    const sorted = source.points.slice().sort((a, b) => a.value - b.value || a.id.localeCompare(b.id))
    const last = sorted[sorted.length - 1]
    const prev = sorted[sorted.length - 2]
    const step = last && prev ? Math.abs(last.value - prev.value) || 1 : 1
    let value = (last?.value ?? 0) + step
    while (source.points.some((item) => sameValue(item.value, value))) value += step
    updateCatalogKpi({
      ...source,
      points: [...source.points, { id: crypto.randomUUID(), value, completion: last?.completion ?? 100 }],
    })
    setError('')
  }

  function removePoint(point: KpiPoint) {
    const source = currentKpi()
    if (source.points.length <= 2) return
    updateCatalogKpi({ ...source, points: source.points.filter((item) => item.id !== point.id) })
    setError('')
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{kpi.name}</DialogTitle>
        <DialogDescription>
          Точки шкалы, план и факт общие для всех сотрудников с этим показателем. Линия между точками прямая, текущий факт отмечен на графике.
        </DialogDescription>
      </DialogHeader>
      <label className="grid gap-1.5 text-sm font-medium">
        Текущий факт
        <span className="flex items-center gap-2 font-normal">
          <input
            aria-label={`Факт: ${kpi.name}`}
            inputMode="decimal"
            value={factDraft ?? String(kpi.fact)}
            onChange={(event) => {
              const raw = event.target.value
              setFactDraft(raw)
              applyFact(raw, false)
            }}
            onBlur={(event) => applyFact(event.target.value, true)}
            className="h-9 w-36 rounded-lg border border-input bg-white px-2 text-sm"
          />
          {kpi.unit ? <span className="text-ink-soft">{kpi.unit}</span> : null}
        </span>
      </label>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e3d9c8" vertical={false} />
            <XAxis
              dataKey="value"
              type="number"
              domain={[low - pad, high + pad]}
              ticks={points.length <= 8 ? points.map((point) => point.value) : undefined}
              tickFormatter={(value) => formatNumber(Number(value))}
              tick={{ fill: '#5c6b82', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, Math.max(140, Math.max(...completions) + 10)]}
              tickFormatter={(value) => `${value}%`}
              tick={{ fill: '#5c6b82', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={42}
            />
            <ReferenceLine x={kpi.fact} stroke="#172033" />
            <Tooltip
              contentStyle={{
                background: '#fffcf7',
                border: '1px solid #e3d9c8',
                borderRadius: 12,
                fontSize: 13,
              }}
              formatter={(value, name) =>
                name === 'completion' ? [formatPercent(Number(value)), 'Выполнение'] : [value, name]
              }
              labelFormatter={(_, payload) =>
                `Значение ${formatNumber(Number(payload?.[0]?.payload?.value))}${kpi.unit ? ` ${kpi.unit}` : ''}`
              }
            />
            <Line
              type="linear"
              dataKey="completion"
              stroke="#1f6f5b"
              strokeWidth={2.5}
              dot={renderFactDot}
              activeDot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="rounded-xl bg-muted px-3 py-2 text-sm leading-relaxed text-ink">
        {explainKpi(kpi)}
        {weight !== undefined ? (
          <>
            {' '}
            Взвешенный вклад в КР:{' '}
            <span className="font-semibold tabular-nums">{formatPercent(completion * (weight / 100))}</span>.
          </>
        ) : null}
      </p>
      <div className="grid gap-2">
        <p className="text-sm font-medium">Точки шкалы</p>
        <p className="text-xs text-ink-soft">
          План — точка со 100% выполнения
          {plan ? `: ${formatNumber(plan.value)}${kpi.unit ? ` ${kpi.unit}` : ''}` : ''}. Сейчас выполнение {formatPercent(completion)}.
        </p>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-ink-soft">
          <span>Значение</span>
          <span>% выполнения</span>
          <span className="sr-only">Удалить</span>
        </div>
        {points.map((point) => (
          <div key={point.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input
              aria-label={`Значение точки ${formatNumber(point.value)}`}
              inputMode="decimal"
              value={text(point, 'value')}
              onChange={(event) => {
                const raw = event.target.value
                setDrafts((current) => ({ ...current, [point.id]: { ...current[point.id], value: raw } }))
                apply(point, 'value', raw, false)
              }}
              onBlur={(event) => apply(point, 'value', event.target.value, true)}
              className="h-9 rounded-lg border border-input bg-white px-2 text-sm"
            />
            <input
              aria-label={`Процент выполнения для значения ${formatNumber(point.value)}`}
              inputMode="decimal"
              value={text(point, 'completion')}
              onChange={(event) => {
                const raw = event.target.value
                setDrafts((current) => ({ ...current, [point.id]: { ...current[point.id], completion: raw } }))
                apply(point, 'completion', raw, false)
              }}
              onBlur={(event) => apply(point, 'completion', event.target.value, true)}
              className="h-9 rounded-lg border border-input bg-white px-2 text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={kpi.points.length <= 2}
              aria-label={`Удалить точку ${formatNumber(point.value)}`}
              onClick={() => removePoint(point)}
            >
              Удалить
            </Button>
          </div>
        ))}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <Button type="button" variant="outline" onClick={addPoint}>
          Добавить точку
        </Button>
      </div>
    </>
  )
}

function sameValue(a: number, b: number) {
  return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b))
}

function renderFactDot(props: { cx?: number; cy?: number; payload?: { marker?: boolean } }) {
  if (!props.payload?.marker || props.cx == null || props.cy == null) return <g />
  return <circle cx={props.cx} cy={props.cy} r={6} fill="#172033" stroke="#fffcf7" strokeWidth={2} />
}
