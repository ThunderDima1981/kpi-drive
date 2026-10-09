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
import { explainStandard, standardSeries, weightedOf } from '../lib/calc.ts'
import { formatPercent, parseNumber } from '../lib/format.ts'
import { useTeamStore } from '../store/team-store.ts'
import type { ScalePoint, StandardIndicator } from '../types.ts'

export function StandardScaleDialog({
  employeeId,
  indicator,
  onOpenChange,
}: {
  employeeId: string
  indicator: StandardIndicator | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={indicator !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,860px)] overflow-y-auto sm:max-w-2xl">
        {indicator ? <StandardScaleEditor key={indicator.id} employeeId={employeeId} indicator={indicator} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function StandardScaleEditor({
  employeeId,
  indicator,
}: {
  employeeId: string
  indicator: StandardIndicator
}) {
  const updateIndicator = useTeamStore((state) => state.updateIndicator)
  const setScore = useTeamStore((state) => state.setScore)
  const evaluatorName = useTeamStore(
    (state) => state.employees.find((item) => item.id === indicator.evaluatorId)?.name ?? null,
  )
  const [drafts, setDrafts] = useState<Record<string, { score?: string; completion?: string }>>({})
  const [error, setError] = useState('')
  const data = standardSeries(indicator)
  const scores = data.map((point) => point.score)
  const completions = data.map((point) => point.completion)
  const low = Math.min(...scores)
  const high = Math.max(...scores)
  const pad = Math.max(0.4, (high - low) * 0.12)
  const points = indicator.points.slice().sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))

  function text(point: ScalePoint, field: 'score' | 'completion') {
    return drafts[point.id]?.[field] ?? String(point[field])
  }

  function currentIndicator() {
    const employee = useTeamStore.getState().employees.find((item) => item.id === employeeId)
    const found = employee?.indicators.find((item) => item.id === indicator.id)
    return found?.type === 'standard' ? found : indicator
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
    if (field === 'completion' && (value < 0 || value > 200)) {
      setError('Процент выполнения — от 0 до 200.')
      return
    }
    if (field === 'score' && source.points.some((item) => item.id !== point.id && sameScore(item.score, value))) {
      setError('Такая оценка уже есть на шкале.')
      return
    }
    const stored = source.points.find((item) => item.id === point.id) ?? point
    const unchanged = field === 'score' ? sameScore(value, stored.score) : value === stored.completion
    if (!unchanged) {
      const nextPoints = source.points.map((item) => (item.id === point.id ? { ...item, [field]: value } : item))
      const score = field === 'score' && sameScore(stored.score, source.score) ? value : source.score
      updateIndicator(employeeId, { ...source, points: nextPoints, score })
    }
    if (finalize) clearDraft(point.id, field)
    setError('')
  }

  function addPoint() {
    const source = currentIndicator()
    const sorted = source.points.slice().sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
    const last = sorted[sorted.length - 1]
    const score = (last?.score ?? 0) + 1
    const completion = last?.completion ?? 100
    updateIndicator(employeeId, {
      ...source,
      points: [...source.points, { id: crypto.randomUUID(), score, completion }],
    })
    setError('')
  }

  function removePoint(point: ScalePoint) {
    const source = currentIndicator()
    if (source.points.length <= 2) return
    const nextPoints = source.points.filter((item) => item.id !== point.id)
    const score = nextPoints.some((item) => sameScore(item.score, source.score))
      ? source.score
      : nearestScore(nextPoints, source.score)
    updateIndicator(employeeId, { ...source, points: nextPoints, score })
    setError('')
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{indicator.name}</DialogTitle>
        <DialogDescription>
          Каждая точка — оценка и её процент выполнения. Линия между точками прямая, текущая оценка отмечена на графике.
          Оценщик: {evaluatorName ?? 'не назначен'}.
        </DialogDescription>
      </DialogHeader>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e3d9c8" vertical={false} />
            <XAxis
              dataKey="score"
              type="number"
              domain={[low - pad, high + pad]}
              ticks={points.length <= 8 ? points.map((point) => point.score) : undefined}
              tickFormatter={(value) => formatScore(Number(value))}
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
            <ReferenceLine x={indicator.score} stroke="#172033" />
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
              labelFormatter={(_, payload) => `Оценка ${formatScore(Number(payload?.[0]?.payload?.score))}`}
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
        {explainStandard(indicator)} Взвешенный вклад в КР:{' '}
        <span className="font-semibold tabular-nums">{formatPercent(weightedOf(indicator))}</span>.
      </p>
      <div>
        <p className="mb-2 text-sm font-medium">Текущая оценка</p>
        <div className="flex flex-wrap gap-2">
          {points.map((point) => {
            const selected = sameScore(point.score, indicator.score)
            return (
              <button
                key={point.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setScore(employeeId, indicator.id, point.score)}
                className={
                  selected
                    ? 'h-8 rounded-lg bg-ink px-2 text-sm font-semibold text-white'
                    : 'h-8 rounded-lg border border-line bg-white px-2 text-sm font-medium'
                }
              >
                {formatScore(point.score)} · {formatPercent(point.completion)}
              </button>
            )
          })}
        </div>
      </div>
      <div className="grid gap-2">
        <p className="text-sm font-medium">Точки шкалы</p>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-ink-soft">
          <span>Оценка</span>
          <span>% выполнения</span>
          <span className="sr-only">Удалить</span>
        </div>
        {points.map((point) => (
          <div key={point.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input
              aria-label={`Оценка точки ${formatScore(point.score)}`}
              inputMode="decimal"
              value={text(point, 'score')}
              onChange={(event) => {
                const raw = event.target.value
                setDrafts((current) => ({
                  ...current,
                  [point.id]: { ...current[point.id], score: raw },
                }))
                apply(point, 'score', raw, false)
              }}
              onBlur={(event) => apply(point, 'score', event.target.value, true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
              className="h-9 rounded-lg border border-input bg-white px-2 text-sm"
            />
            <input
              aria-label={`Процент выполнения для оценки ${formatScore(point.score)}`}
              inputMode="decimal"
              value={text(point, 'completion')}
              onChange={(event) => {
                const raw = event.target.value
                setDrafts((current) => ({
                  ...current,
                  [point.id]: { ...current[point.id], completion: raw },
                }))
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
              aria-label={`Удалить точку ${formatScore(point.score)}`}
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

function nearestScore(points: ScalePoint[], score: number) {
  return points.reduce((best, point) =>
    Math.abs(point.score - score) < Math.abs(best.score - score) ? point : best,
  ).score
}

function formatScore(score: number) {
  if (score > 0) return `+${score}`
  if (score < 0) return `−${Math.abs(score)}`
  return '0'
}

function renderFactDot(props: { cx?: number; cy?: number; payload?: { marker?: boolean } }) {
  if (!props.payload?.marker || props.cx == null || props.cy == null) return <g />
  return <circle cx={props.cx} cy={props.cy} r={6} fill="#172033" stroke="#fffcf7" strokeWidth={2} />
}
