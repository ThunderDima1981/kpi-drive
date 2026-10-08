import { useState } from 'react'
import { ArrowLeft, ChartLine, Check, ListChecks, Pencil, Plus, ShieldCheck, Target, Trash, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DecimalInput } from './decimal-input.tsx'
import { IndicatorDialog, ScorePicker } from './indicator-dialog.tsx'
import { KrGauge } from './kr-gauge.tsx'
import { ScaleDialog } from './scale-dialog.tsx'
import {
  clampProgress,
  completionOf,
  matrixResult,
  scaleOrderIssue,
  STANDARD_COMPLETION,
  weightedOf,
} from '../lib/calc.ts'
import { formatNumber, formatPercent, initials, zoneOf, ZONES } from '../lib/format.ts'
import { useTeamStore } from '../store/team-store.ts'
import type { Indicator, IndicatorType, KpiIndicator, SmartIndicator, StandardIndicator, StandardScore } from '../types.ts'

export function MatrixView({ employeeId, onBack }: { employeeId: string; onBack: () => void }) {
  const employees = useTeamStore((state) => state.employees)
  const periodLabel = useTeamStore((state) => state.periodLabel)
  const setFact = useTeamStore((state) => state.setFact)
  const setProgress = useTeamStore((state) => state.setProgress)
  const setScore = useTeamStore((state) => state.setScore)
  const removeIndicator = useTeamStore((state) => state.removeIndicator)
  const employee = employees.find((item) => item.id === employeeId)
  const [editor, setEditor] = useState<{ indicator: Indicator | null; type: IndicatorType } | null>(null)
  const [chartId, setChartId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  if (!employee) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-line bg-card px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">Сотрудник не найден</h1>
        <p className="mt-2 text-sm text-ink-soft">Матрица могла быть удалена в настройках команды.</p>
        <Button type="button" className="mt-5" onClick={onBack}>
          К дашборду
        </Button>
      </div>
    )
  }

  const result = matrixResult(employee.indicators)
  const zone = ZONES[zoneOf(result.kr)]
  const balanced = Math.abs(result.weightSum - 100) < 0.05
  const chart = employee.indicators.find((indicator): indicator is KpiIndicator => indicator.id === chartId && indicator.type === 'kpi') ?? null
  const groups: { type: IndicatorType; title: string; hint: string; icon: typeof Target }[] = [
    {
      type: 'kpi',
      title: 'Количественные KPI',
      hint: 'Факт пересчитывает выполнение сразу. Ниже порога — 0%, план — 100%, потолок по умолчанию — 130%.',
      icon: Target,
    },
    {
      type: 'smart',
      title: 'Smart-задачи',
      hint: 'Процент выполнения равен оценке руководителя и не поднимается выше 100%.',
      icon: ListChecks,
    },
    {
      type: 'standard',
      title: 'Стандарты',
      hint: '0 = 100%, +1 = 115%, +2 = 130%, −1 = 70%, −2 = 0%.',
      icon: ShieldCheck,
    },
  ]

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <button type="button" onClick={onBack} className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" />
        К команде
      </button>

      <header className="grid items-center gap-4 rounded-2xl border border-line bg-card p-5 shadow-sm lg:grid-cols-[1fr_16rem]">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-ink text-lg font-semibold text-white">
            {initials(employee.name)}
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-gold uppercase">{periodLabel}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{employee.name}</h1>
            <p className="mt-1 text-sm text-ink-soft">{employee.position}</p>
          </div>
        </div>
        <div aria-live="polite">
          <KrGauge kr={result.kr} />
          <p className="text-center text-sm font-semibold" style={{ color: zone.color }}>
            {zone.label}
          </p>
        </div>
      </header>

      <div
        className="flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm"
        style={
          balanced
            ? { borderColor: '#cfe4d8', background: '#f3faf6', color: '#157a4b' }
            : { borderColor: '#f0d7b0', background: '#fbf6ec', color: '#9a4b08' }
        }
      >
        {balanced ? <Check className="mt-0.5 size-4 shrink-0" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
        <p>
          Сумма весов: <span className="font-semibold tabular-nums">{formatPercent(result.weightSum)}</span>.
          {balanced
            ? ' Матрица собрана. КР = сумма по показателям (выполнение × вес / 100).'
            : ' Для корректной матрицы сумма весов должна быть равна 100%.'}
        </p>
      </div>

      {groups.map((group) => {
        const items = employee.indicators.filter((indicator) => indicator.type === group.type)
        const Icon = group.icon
        return (
          <section key={group.type} className="overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
            <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-4 md:px-5">
              <div className="flex gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-muted text-pine">
                  <Icon className="size-4" />
                </span>
                <div>
                  <h2 className="font-semibold">{group.title}</h2>
                  <p className="mt-1 max-w-2xl text-sm text-ink-soft">{group.hint}</p>
                </div>
              </div>
              <Button type="button" variant="outline" onClick={() => setEditor({ indicator: null, type: group.type })}>
                <Plus />
                Показатель
              </Button>
            </header>
            {items.length === 0 ? (
              <p className="border-t border-line px-5 py-8 text-sm text-ink-soft">В этой группе пока нет показателей.</p>
            ) : group.type === 'kpi' ? (
              <KpiTable
                items={items.filter((item): item is KpiIndicator => item.type === 'kpi')}
                employeeId={employee.id}
                pendingDelete={pendingDelete}
                onFact={(id, fact) => setFact(employee.id, id, fact)}
                onChart={setChartId}
                onEdit={(indicator) => setEditor({ indicator, type: 'kpi' })}
                onAskDelete={setPendingDelete}
                onDelete={(id) => {
                  removeIndicator(employee.id, id)
                  setPendingDelete(null)
                }}
              />
            ) : group.type === 'smart' ? (
              <SmartTable
                items={items.filter((item): item is SmartIndicator => item.type === 'smart')}
                pendingDelete={pendingDelete}
                onProgress={(id, progress) => setProgress(employee.id, id, progress)}
                onEdit={(indicator) => setEditor({ indicator, type: 'smart' })}
                onAskDelete={setPendingDelete}
                onDelete={(id) => {
                  removeIndicator(employee.id, id)
                  setPendingDelete(null)
                }}
              />
            ) : (
              <StandardTable
                items={items.filter((item): item is StandardIndicator => item.type === 'standard')}
                pendingDelete={pendingDelete}
                onScore={(id, score) => setScore(employee.id, id, score)}
                onEdit={(indicator) => setEditor({ indicator, type: 'standard' })}
                onAskDelete={setPendingDelete}
                onDelete={(id) => {
                  removeIndicator(employee.id, id)
                  setPendingDelete(null)
                }}
              />
            )}
          </section>
        )
      })}

      {editor ? (
        <IndicatorDialog
          employeeId={employee.id}
          initial={editor.indicator}
          defaultType={editor.type}
          onOpenChange={(open) => {
            if (!open) setEditor(null)
          }}
        />
      ) : null}
      <ScaleDialog indicator={chart} onOpenChange={(open) => { if (!open) setChartId(null) }} />
    </div>
  )
}

function KpiTable({
  items,
  employeeId,
  pendingDelete,
  onFact,
  onChart,
  onEdit,
  onAskDelete,
  onDelete,
}: {
  items: KpiIndicator[]
  employeeId: string
  pendingDelete: string | null
  onFact: (id: string, fact: number) => void
  onChart: (id: string) => void
  onEdit: (indicator: KpiIndicator) => void
  onAskDelete: (id: string | null) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="overflow-x-auto border-t border-line">
      <table className="w-full min-w-[980px] border-collapse text-sm">
        <thead className="bg-[#f7f3ea] text-left text-xs tracking-wide text-ink-soft uppercase">
          <tr>
            <th className="sticky left-0 z-10 bg-[#f7f3ea] px-4 py-3 font-medium">Название</th>
            <th className="px-3 py-3 font-medium">Вес</th>
            <th className="px-3 py-3 font-medium">Порог</th>
            <th className="px-3 py-3 font-medium">План</th>
            <th className="px-3 py-3 font-medium">Максимум</th>
            <th className="bg-pine/5 px-3 py-3 font-medium">Факт</th>
            <th className="px-3 py-3 font-medium">% выполнения</th>
            <th className="px-3 py-3 font-medium">Взвешенный</th>
            <th className="px-3 py-3 font-medium"><span className="sr-only">Действия</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((indicator) => {
            const issue = scaleOrderIssue(indicator)
            return (
              <tr key={indicator.id} className="border-t border-line align-top">
                <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-medium shadow-[4px_0_8px_-6px_rgba(23,32,51,0.35)]">
                  <span className="block">{indicator.name}</span>
                  {indicator.inverse ? <span className="mt-1 block text-xs font-normal text-ink-soft">Обратный</span> : null}
                  {issue ? <span className="mt-1 block text-xs font-normal text-destructive">{issue}</span> : null}
                </th>
                <td className="px-3 py-3 tabular-nums">{formatPercent(indicator.weight)}</td>
                <td className="px-3 py-3"><Quantity value={indicator.threshold} unit={indicator.unit} /></td>
                <td className="px-3 py-3"><Quantity value={indicator.plan} unit={indicator.unit} /></td>
                <td className="px-3 py-3"><Quantity value={indicator.maximum} unit={indicator.unit} /></td>
                <td className="bg-pine/5 px-3 py-3">
                  <div className="flex items-center gap-2">
                    <DecimalInput
                      key={`${employeeId}-${indicator.id}`}
                      value={indicator.fact}
                      ariaLabel={`Факт: ${indicator.name}`}
                      onValueChange={(fact) => onFact(indicator.id, fact)}
                      className="h-8 w-24 bg-white tabular-nums"
                    />
                    {indicator.unit ? <span className="text-xs text-ink-soft">{indicator.unit}</span> : null}
                  </div>
                </td>
                <td className="px-3 py-3 font-semibold tabular-nums">{formatPercent(completionOf(indicator))}</td>
                <td className="px-3 py-3 tabular-nums">{formatPercent(weightedOf(indicator))}</td>
                <td className="px-3 py-3">
                  <RowActions
                    name={indicator.name}
                    pending={pendingDelete === indicator.id}
                    onChart={() => onChart(indicator.id)}
                    onEdit={() => onEdit(indicator)}
                    onAskDelete={() => onAskDelete(indicator.id)}
                    onCancel={() => onAskDelete(null)}
                    onDelete={() => onDelete(indicator.id)}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SmartTable({
  items,
  pendingDelete,
  onProgress,
  onEdit,
  onAskDelete,
  onDelete,
}: {
  items: SmartIndicator[]
  pendingDelete: string | null
  onProgress: (id: string, progress: number) => void
  onEdit: (indicator: SmartIndicator) => void
  onAskDelete: (id: string | null) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="overflow-x-auto border-t border-line">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead className="bg-[#f7f3ea] text-left text-xs tracking-wide text-ink-soft uppercase">
          <tr>
            <th className="px-4 py-3 font-medium">Название</th>
            <th className="px-3 py-3 font-medium">Вес</th>
            <th className="px-3 py-3 font-medium">Прогресс</th>
            <th className="px-3 py-3 font-medium">% выполнения</th>
            <th className="px-3 py-3 font-medium">Взвешенный</th>
            <th className="px-3 py-3"><span className="sr-only">Действия</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((indicator) => (
            <tr key={indicator.id} className="border-t border-line">
              <th className="px-4 py-3 text-left font-medium">{indicator.name}</th>
              <td className="px-3 py-3 tabular-nums">{formatPercent(indicator.weight)}</td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={clampProgress(indicator.progress)}
                    aria-label={`Прогресс: ${indicator.name}`}
                    onChange={(event) => onProgress(indicator.id, Number(event.target.value))}
                    className="h-1.5 w-28 accent-pine"
                  />
                  <DecimalInput
                    value={indicator.progress}
                    ariaLabel={`Процент прогресса: ${indicator.name}`}
                    onValueChange={(progress) => onProgress(indicator.id, clampProgress(progress))}
                    className="h-8 w-16 bg-white tabular-nums"
                  />
                </div>
              </td>
              <td className="px-3 py-3 font-semibold tabular-nums">{formatPercent(completionOf(indicator))}</td>
              <td className="px-3 py-3 tabular-nums">{formatPercent(weightedOf(indicator))}</td>
              <td className="px-3 py-3">
                <RowActions
                  name={indicator.name}
                  pending={pendingDelete === indicator.id}
                  onEdit={() => onEdit(indicator)}
                  onAskDelete={() => onAskDelete(indicator.id)}
                  onCancel={() => onAskDelete(null)}
                  onDelete={() => onDelete(indicator.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StandardTable({
  items,
  pendingDelete,
  onScore,
  onEdit,
  onAskDelete,
  onDelete,
}: {
  items: StandardIndicator[]
  pendingDelete: string | null
  onScore: (id: string, score: StandardScore) => void
  onEdit: (indicator: StandardIndicator) => void
  onAskDelete: (id: string | null) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="overflow-x-auto border-t border-line">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead className="bg-[#f7f3ea] text-left text-xs tracking-wide text-ink-soft uppercase">
          <tr>
            <th className="px-4 py-3 font-medium">Название</th>
            <th className="px-3 py-3 font-medium">Вес</th>
            <th className="px-3 py-3 font-medium">Оценка</th>
            <th className="px-3 py-3 font-medium">% выполнения</th>
            <th className="px-3 py-3 font-medium">Взвешенный</th>
            <th className="px-3 py-3"><span className="sr-only">Действия</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((indicator) => (
            <tr key={indicator.id} className="border-t border-line">
              <th className="px-4 py-3 text-left font-medium">{indicator.name}</th>
              <td className="px-3 py-3 tabular-nums">{formatPercent(indicator.weight)}</td>
              <td className="px-3 py-3">
                <ScorePicker value={indicator.score} onChange={(score) => onScore(indicator.id, score)} />
                <span className="ml-2 text-xs text-ink-soft tabular-nums">{STANDARD_COMPLETION[indicator.score]}%</span>
              </td>
              <td className="px-3 py-3 font-semibold tabular-nums">{formatPercent(completionOf(indicator))}</td>
              <td className="px-3 py-3 tabular-nums">{formatPercent(weightedOf(indicator))}</td>
              <td className="px-3 py-3">
                <RowActions
                  name={indicator.name}
                  pending={pendingDelete === indicator.id}
                  onEdit={() => onEdit(indicator)}
                  onAskDelete={() => onAskDelete(indicator.id)}
                  onCancel={() => onAskDelete(null)}
                  onDelete={() => onDelete(indicator.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Quantity({ value, unit }: { value: number; unit: string }) {
  return (
    <span className="tabular-nums">
      {formatNumber(value)}
      {unit ? <span className="ml-1 text-xs text-ink-soft">{unit}</span> : null}
    </span>
  )
}

function RowActions({
  name,
  pending,
  onChart,
  onEdit,
  onAskDelete,
  onCancel,
  onDelete,
}: {
  name: string
  pending: boolean
  onChart?: () => void
  onEdit: () => void
  onAskDelete: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  if (pending) {
    return (
      <div className="flex justify-end gap-1">
        <Button type="button" size="sm" variant="destructive" onClick={onDelete}>
          Удалить
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Нет
        </Button>
      </div>
    )
  }
  return (
    <div className="flex justify-end">
      {onChart ? (
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`График шкалы: ${name}`} onClick={onChart}>
          <ChartLine />
        </Button>
      ) : null}
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Изменить ${name}`} onClick={onEdit}>
        <Pencil />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Удалить ${name}`} onClick={onAskDelete}>
        <Trash />
      </Button>
    </div>
  )
}
