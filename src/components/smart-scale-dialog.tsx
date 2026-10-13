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
import { explainSmart, smartSeries, weightedOf } from '../lib/calc.ts'
import { randomId } from '../lib/id.ts'
import { smartGroupCompletion } from '../lib/smart.ts'
import { formatPercent, parseNumber } from '../lib/format.ts'
import { useTeamStore } from '../store/team-store.ts'
import type { ScalePoint, SmartIndicator } from '../types.ts'

export function SmartScaleDialog({
  employeeId,
  indicator,
  onOpenChange,
}: {
  employeeId: string
  indicator: SmartIndicator | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={indicator !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,860px)] overflow-y-auto sm:max-w-2xl">
        {indicator ? <SmartScaleEditor key={indicator.id} employeeId={employeeId} indicator={indicator} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function SmartScaleEditor({
  employeeId,
  indicator,
}: {
  employeeId: string
  indicator: SmartIndicator
}) {
  const updateIndicator = useTeamStore((state) => state.updateIndicator)
  const [drafts, setDrafts] = useState<Record<string, { score?: string; completion?: string }>>({})
  const [error, setError] = useState('')
  const done = smartGroupCompletion(indicator)
  const data = smartSeries(indicator)
  const scores = data.map((point) => point.score)
  const completions = data.map((point) => point.completion)
  const low = Math.min(...scores)
  const high = Math.max(...scores)
  const pad = Math.max(4, (high - low) * 0.08)
  const points = indicator.points.slice().sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))

  function text(point: ScalePoint, field: 'score' | 'completion') {
    return drafts[point.id]?.[field] ?? String(point[field])
  }

  function currentIndicator() {
    const employee = useTeamStore.getState().employees.find((item) => item.id === employeeId)
    const found = employee?.indicators.find((item) => item.id === indicator.id)
    return found?.type === 'smart' ? found : indicator
  }

  function clearDraft(pointId: string, field: 'score' | 'completion') {
    setDrafts((current) => {
      const entry = { ...current[pointId] }
      delete entry[field]
      const next = { ...current }
      if (entry.score === undefined && entry.completion === undefined) delete next[pointId]
      else next[pointId] = entry
      return next
    })
  }

  function apply(point: ScalePoint, field: 'score' | 'completion', raw: string, finalize: boolean) {
    const source = currentIndicator()
    const value = parseNumber(raw)
    if (value === null) {
      if (finalize) setError('Введите число.')
      return
    }
    if (field === 'score' && value < 0) {
      setError('Процент выполненных задач не может быть меньше 0.')
      return
    }
    if (field === 'completion' && (value < 0 || value > 200)) {
      setError('Влияние на вес — от 0 до 200%.')
      return
    }
    if (field === 'score' && source.points.some((item) => item.id !== point.id && sameScore(item.score, value))) {
      setError('Такой процент выполненных задач уже есть на шкале.')
      return
    }
    const stored = source.points.find((item) => item.id === point.id) ?? point
    const unchanged = field === 'score' ? sameScore(value, stored.score) : value === stored.completion
    if (!unchanged) {
      const nextPoints = source.points.map((item) => (item.id === point.id ? { ...item, [field]: value } : item))
      updateIndicator(employeeId, { ...source, points: nextPoints })
    }
    if (finalize) clearDraft(point.id, field)
    setError('')
  }

  function addPoint() {
    const source = currentIndicator()
    const sorted = source.points.slice().sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
    const last = sorted[sorted.length - 1]
    const prev = sorted[sorted.length - 2]
    const step = last && prev ? Math.abs(last.score - prev.score) || 10 : 10
    let score = (last?.score ?? 0) + step
    while (source.points.some((item) => sameScore(item.score, score))) score += step
    updateIndicator(employeeId, {
      ...source,
      points: [...source.points, { id: randomId(), score, completion: last?.completion ?? 100 }],
    })
    setError('')
  }

  function removePoint(point: ScalePoint) {
    const source = currentIndicator()
    if (source.points.length <= 2) return
    updateIndicator(employeeId, { ...source, points: source.points.filter((item) => item.id !== point.id) })
    setError('')
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Шкала Smart-задач</DialogTitle>
        <DialogDescription>
          По горизонтали — процент выполненных задач, сумма весов закрытых задач. По вертикали — как этот процент влияет
          на вес блока в матрице. Линия между точками прямая.
        </DialogDescription>
      </DialogHeader>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e3d9c8" vertical={false} />
            <XAxis
              dataKey="score"
              type="number"
              domain={[Math.max(0, low - pad), high + pad]}
              ticks={points.length <= 8 ? points.map((point) => point.score) : undefined}
              tickFormatter={(value) => formatPercent(Number(value))}
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
            <ReferenceLine x={done} stroke="#172033" />
            <Tooltip
              contentStyle={{
                background: '#fffcf7',
                border: '1px solid #e3d9c8',
                borderRadius: 12,
                fontSize: 13,
              }}
              formatter={(value, name) =>
                name === 'completion' ? [formatPercent(Number(value)), 'Влияние на вес'] : [value, name]
              }
              labelFormatter={(_, payload) => `Выполнено задач ${formatPercent(Number(payload?.[0]?.payload?.score))}`}
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
        {explainSmart(indicator)} Вклад в КР:{' '}
        <span className="font-semibold tabular-nums">{formatPercent(weightedOf(indicator))}</span>.
      </p>
      <div className="grid gap-2">
        <p className="text-sm font-medium">Точки шкалы</p>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-ink-soft">
          <span>Выполнено задач, %</span>
          <span>Влияние на вес, %</span>
          <span className="sr-only">Удалить</span>
        </div>
        {points.map((point) => (
          <div key={point.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input
              aria-label={`Выполнено задач ${formatPercent(point.score)}`}
              inputMode="decimal"
              value={text(point, 'score')}
              onChange={(event) => {
                const raw = event.target.value
                setDrafts((current) => ({ ...current, [point.id]: { ...current[point.id], score: raw } }))
                apply(point, 'score', raw, false)
              }}
              onBlur={(event) => apply(point, 'score', event.target.value, true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
              className="h-9 rounded-lg border border-input bg-white px-2 text-sm"
            />
            <input
              aria-label={`Влияние на вес для ${formatPercent(point.score)}`}
              inputMode="decimal"
              value={text(point, 'completion')}
              onChange={(event) => {
                const raw = event.target.value
                setDrafts((current) => ({ ...current, [point.id]: { ...current[point.id], completion: raw } }))
                apply(point, 'completion', raw, false)
              }}
              onBlur={(event) => apply(point, 'completion', event.target.value, true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
              className="h-9 rounded-lg border border-input bg-white px-2 text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={indicator.points.length <= 2}
              aria-label={`Удалить точку ${formatPercent(point.score)}`}
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

function sameScore(a: number, b: number) {
  return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b))
}

function renderFactDot(props: { cx?: number; cy?: number; payload?: { marker?: boolean } }) {
  if (!props.payload?.marker || props.cx == null || props.cy == null) return <g />
  return <circle cx={props.cx} cy={props.cy} r={6} fill="#172033" stroke="#fffcf7" strokeWidth={2} />
}
