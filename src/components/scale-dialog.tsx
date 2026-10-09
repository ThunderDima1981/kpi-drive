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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { completionOf, explainKpi, explainStandard, scaleSeries, standardSeries, weightedOf } from '../lib/calc.ts'
import { formatNumber, formatPercent } from '../lib/format.ts'
import type { KpiIndicator, StandardIndicator } from '../types.ts'

export function ScaleDialog({
  indicator,
  onOpenChange,
}: {
  indicator: KpiIndicator | null
  onOpenChange: (open: boolean) => void
}) {
  const data = indicator ? scaleSeries(indicator) : []
  const completion = indicator ? completionOf(indicator) : 0
  const cap = indicator?.maxCap ?? 130

  return (
    <Dialog open={indicator !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {indicator ? (
          <>
            <DialogHeader>
              <DialogTitle>{indicator.name}</DialogTitle>
              <DialogDescription>
                {indicator.inverse
                  ? 'Обратная шкала: чем меньше факт, тем выше выполнение.'
                  : 'Прямая шкала: выполнение растёт вместе с фактом.'}
              </DialogDescription>
            </DialogHeader>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#e3d9c8" vertical={false} />
                  <XAxis
                    dataKey="fact"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(value) => formatNumber(Number(value))}
                    tick={{ fill: '#5c6b82', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, Math.max(140, cap + 10)]}
                    tickFormatter={(value) => `${value}%`}
                    tick={{ fill: '#5c6b82', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                  />
                  <ReferenceLine x={indicator.threshold} stroke="#b42318" strokeDasharray="4 4" />
                  <ReferenceLine x={indicator.plan} stroke="#b45309" />
                  <ReferenceLine x={indicator.maximum} stroke="#157a4b" strokeDasharray="4 4" />
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
                    labelFormatter={(_, payload) => {
                      const fact = payload?.[0]?.payload?.fact
                      return `Факт ${formatNumber(Number(fact))}${indicator.unit ? ` ${indicator.unit}` : ''}`
                    }}
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
            <ul className="grid gap-2 text-sm sm:grid-cols-4">
              <ScaleStat label="Порог" value={indicator.threshold} unit={indicator.unit} tone="#b42318" />
              <ScaleStat label="План" value={indicator.plan} unit={indicator.unit} tone="#b45309" />
              <ScaleStat label="Максимум" value={indicator.maximum} unit={indicator.unit} tone="#157a4b" />
              <ScaleStat label="Факт" value={indicator.fact} unit={indicator.unit} tone="#172033" />
            </ul>
            <p className="rounded-xl bg-muted px-3 py-2 text-sm leading-relaxed text-ink">
              {explainKpi(indicator)} Взвешенный вклад в КР:{' '}
              <span className="font-semibold tabular-nums">{formatPercent(completion * (indicator.weight / 100))}</span>.
            </p>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export function StandardScaleDialog({
  indicator,
  onOpenChange,
}: {
  indicator: StandardIndicator | null
  onOpenChange: (open: boolean) => void
}) {
  const data = indicator ? standardSeries(indicator.score) : []
  const completion = indicator ? completionOf(indicator) : 0

  return (
    <Dialog open={indicator !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {indicator ? (
          <>
            <DialogHeader>
              <DialogTitle>{indicator.name}</DialogTitle>
              <DialogDescription>
                Шкала стандарта: оценка −2 даёт 0%, план 0 даёт 100%, максимум +2 даёт 130%.
              </DialogDescription>
            </DialogHeader>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#e3d9c8" vertical={false} />
                  <XAxis
                    dataKey="score"
                    type="number"
                    domain={[-2.4, 2.4]}
                    ticks={[-2, -1, 0, 1, 2]}
                    tickFormatter={(value) => formatScore(Number(value))}
                    tick={{ fill: '#5c6b82', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 140]}
                    tickFormatter={(value) => `${value}%`}
                    tick={{ fill: '#5c6b82', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                  />
                  <ReferenceLine x={-2} stroke="#b42318" strokeDasharray="4 4" />
                  <ReferenceLine x={0} stroke="#b45309" />
                  <ReferenceLine x={2} stroke="#157a4b" strokeDasharray="4 4" />
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
            <ul className="grid gap-2 text-sm sm:grid-cols-4">
              <ScoreStat label="Порог" value="−2" detail="0%" tone="#b42318" />
              <ScoreStat label="План" value="0" detail="100%" tone="#b45309" />
              <ScoreStat label="Максимум" value="+2" detail="130%" tone="#157a4b" />
              <ScoreStat label="Оценка" value={formatScore(indicator.score)} detail={formatPercent(completion)} tone="#172033" />
            </ul>
            <p className="rounded-xl bg-muted px-3 py-2 text-sm leading-relaxed text-ink">
              {explainStandard(indicator.score)} Взвешенный вклад в КР:{' '}
              <span className="font-semibold tabular-nums">{formatPercent(weightedOf(indicator))}</span>.
            </p>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function formatScore(score: number) {
  if (score > 0) return `+${score}`
  if (score < 0) return `−${Math.abs(score)}`
  return '0'
}

function ScoreStat({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone: string
}) {
  return (
    <li className="rounded-xl border border-line px-3 py-2">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-1 font-semibold tabular-nums" style={{ color: tone }}>
        {value}
        <span className="ml-1 text-xs font-medium text-ink-soft">{detail}</span>
      </p>
    </li>
  )
}

function ScaleStat({
  label,
  value,
  unit,
  tone,
}: {
  label: string
  value: number
  unit: string
  tone: string
}) {
  return (
    <li className="rounded-xl border border-line px-3 py-2">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-1 font-semibold tabular-nums" style={{ color: tone }}>
        {formatNumber(value)}
        {unit ? <span className="ml-1 text-xs font-medium text-ink-soft">{unit}</span> : null}
      </p>
    </li>
  )
}

function renderFactDot(props: { cx?: number; cy?: number; payload?: { marker?: boolean } }) {
  if (!props.payload?.marker || props.cx == null || props.cy == null) return <g />
  return <circle cx={props.cx} cy={props.cy} r={6} fill="#172033" stroke="#fffcf7" strokeWidth={2} />
}
