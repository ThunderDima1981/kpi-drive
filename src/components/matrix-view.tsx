import { useState } from 'react'
import { ArrowLeft, ChartLine, Check, ListChecks, Pencil, Plus, ShieldCheck, Target, Trash, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DecimalInput } from './decimal-input.tsx'
import { PlanInput } from './plan-input.tsx'
import { IndicatorDialog } from './indicator-dialog.tsx'
import { KpiAssignDialog, KpiWeightDialog } from './kpi-assign-dialog.tsx'
import { KpiScaleDialog } from './kpi-scale-dialog.tsx'
import { KrGauge } from './kr-gauge.tsx'
import { StandardScaleDialog } from './scale-dialog.tsx'
import { SmartScaleDialog } from './smart-scale-dialog.tsx'
import {
  completionOf,
  findCatalogKpi,
  matrixResult,
  planPoint,
  weightedOf,
} from '../lib/calc.ts'
import { formatNumber, formatPercent, parseNumber, zoneOf, ZONES } from '../lib/format.ts'
import { Avatar } from './avatar.tsx'
import { ApiError } from '../lib/api.ts'
import { useActor, useIsAdmin } from '../lib/role.tsx'
import { canChangeStatus, canMoveSmart } from '../lib/smart-access.ts'
import { moveSmartToNextMonth } from '../lib/sync.ts'
import { useTeamStore } from '../store/team-store.ts'
import { SMART_STATUS_LABEL, smartCompletion, smartGroupCompletion } from '../lib/smart.ts'
import type { CatalogKpi, IndicatorType, KpiIndicator, SmartIndicator, SmartStatus, SmartTask, StandardIndicator } from '../types.ts'

export function MatrixView({ employeeId, onBack }: { employeeId: string; onBack: () => void }) {
  const employees = useTeamStore((state) => state.employees)
  const kpiCatalog = useTeamStore((state) => state.kpiCatalog)
  const periodLabel = useTeamStore((state) => state.periodLabel)
  const setCatalogFact = useTeamStore((state) => state.setCatalogFact)
  const setStatus = useTeamStore((state) => state.setStatus)
  const setScore = useTeamStore((state) => state.setScore)
  const setEvaluator = useTeamStore((state) => state.setEvaluator)
  const removeIndicator = useTeamStore((state) => state.removeIndicator)
  const setSmartWeight = useTeamStore((state) => state.setSmartWeight)
  const removeSmartTask = useTeamStore((state) => state.removeSmartTask)
  const employee = employees.find((item) => item.id === employeeId)
  const [editor, setEditor] = useState<
    { type: 'standard'; indicator: StandardIndicator | null } | { type: 'smart'; task: SmartTask | null } | null
  >(null)
  const [chartId, setChartId] = useState<string | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [weightEdit, setWeightEdit] = useState<KpiIndicator | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [smartChart, setSmartChart] = useState(false)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [moveError, setMoveError] = useState('')
  const admin = useIsAdmin()

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

  const result = matrixResult(employee.indicators, kpiCatalog)
  const zone = ZONES[zoneOf(result.kr)]
  const balanced = Math.abs(result.weightSum - 100) < 0.05
  const chart = employee.indicators.find((indicator) => indicator.id === chartId) ?? null
  const groups: { type: IndicatorType; title: string; hint: string; icon: typeof Target }[] = [
    {
      type: 'kpi',
      title: 'Количественные KPI',
      hint: `План и факт за ${periodLabel} общие для команды. В другом месяце они свои. Состав матрицы сохраняется, пока его не изменить в выбранном месяце.`,
      icon: Target,
    },
    {
      type: 'smart',
      title: 'Smart-задачи',
      hint: 'Блок со своим весом остаётся в матрице месяца. Задачи у каждого месяца свои. Сотрудник создаёт их со статусом «Создан», руководитель переводит в работу и закрывает выполненные. Сумма весов задач может быть больше 100%.',
      icon: ListChecks,
    },
    {
      type: 'standard',
      title: 'Стандарты',
      hint: 'Оценка ставится за выбранный месяц. Оценщик выбирается из сотрудников, шкала задаётся на графике.',
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
          <Avatar name={employee.name} employeeId={employee.id} className="size-14 rounded-2xl bg-ink text-lg text-white" />
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
        const smartExists = employee.indicators.some((indicator) => indicator.type === 'smart')
        const showAdd = group.type === 'smart' ? admin || smartExists : admin
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
              {showAdd ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (group.type === 'kpi') setAssignOpen(true)
                    else if (group.type === 'smart') setEditor({ type: 'smart', task: null })
                    else setEditor({ type: 'standard', indicator: null })
                  }}
                >
                  <Plus />
                  {group.type === 'smart' ? 'Создать' : group.type === 'kpi' ? 'Из справочника' : 'Показатель'}
                </Button>
              ) : null}
            </header>
            {items.length === 0 && group.type !== 'smart' ? (
              <p className="border-t border-line px-5 py-8 text-sm text-ink-soft">В этой группе пока нет показателей.</p>
            ) : group.type === 'kpi' ? (
              <KpiTable
                admin={admin}
                items={items.filter((item): item is KpiIndicator => item.type === 'kpi')}
                catalog={kpiCatalog}
                pendingDelete={pendingDelete}
                onFact={setCatalogFact}
                onChart={setChartId}
                onEdit={setWeightEdit}
                onAskDelete={setPendingDelete}
                onDelete={(id) => {
                  removeIndicator(employee.id, id)
                  setPendingDelete(null)
                }}
              />
            ) : group.type === 'smart' ? (
              <SmartBlock
                admin={admin}
                employee={employee}
                group={items.find((item): item is SmartIndicator => item.type === 'smart') ?? null}
                matrixWeightSum={result.weightSum}
                pendingDelete={pendingDelete}
                movingId={movingId}
                moveError={moveError}
                onChart={() => setSmartChart(true)}
                onWeight={(weight) => setSmartWeight(employee.id, weight)}
                onStatus={(id, status) => setStatus(employee.id, id, status)}
                onMove={(id) => {
                  setMoveError('')
                  setMovingId(id)
                  void moveSmartToNextMonth(employee.id, id)
                    .catch((error: unknown) => {
                      setMoveError(error instanceof ApiError ? error.message : 'Не удалось перенести задачу.')
                    })
                    .finally(() => setMovingId(null))
                }}
                onEdit={(task) => setEditor({ type: 'smart', task })}
                onAskDelete={setPendingDelete}
                onDeleteTask={(id) => {
                  removeSmartTask(employee.id, id)
                  setPendingDelete(null)
                }}
                onDeleteBlock={() => {
                  const block = items.find((item) => item.type === 'smart')
                  if (block) removeIndicator(employee.id, block.id)
                  setPendingDelete(null)
                }}
              />
            ) : (
              <StandardTable
                admin={admin}
                items={items.filter((item): item is StandardIndicator => item.type === 'standard')}
                employees={employees}
                pendingDelete={pendingDelete}
                onScore={(id, score) => setScore(employee.id, id, score)}
                onEvaluator={(id, evaluatorId) => setEvaluator(employee.id, id, evaluatorId)}
                onChart={setChartId}
                onEdit={(indicator) => setEditor({ type: 'standard', indicator })}
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
          initial={editor.type === 'standard' ? editor.indicator : null}
          smartTask={editor.type === 'smart' ? editor.task : null}
          defaultType={editor.type}
          onOpenChange={(open) => {
            if (!open) setEditor(null)
          }}
        />
      ) : null}
      <KpiAssignDialog employeeId={employee.id} open={assignOpen} onOpenChange={setAssignOpen} />
      <KpiWeightDialog employeeId={employee.id} indicator={weightEdit} onOpenChange={(open) => { if (!open) setWeightEdit(null) }} />
      <KpiScaleDialog
        kpi={chart?.type === 'kpi' ? findCatalogKpi(kpiCatalog, chart.catalogId) : null}
        weight={chart?.type === 'kpi' ? chart.weight : undefined}
        onOpenChange={(open) => { if (!open) setChartId(null) }}
      />
      <StandardScaleDialog employeeId={employee.id} indicator={chart?.type === 'standard' ? chart : null} onOpenChange={(open) => { if (!open) setChartId(null) }} />
      <SmartScaleDialog
        employeeId={employee.id}
        indicator={smartChart ? employee.indicators.find((item): item is SmartIndicator => item.type === 'smart') ?? null : null}
        onOpenChange={(open) => { if (!open) setSmartChart(false) }}
      />
    </div>
  )
}

function KpiTable({
  admin,
  items,
  catalog,
  pendingDelete,
  onFact,
  onChart,
  onEdit,
  onAskDelete,
  onDelete,
}: {
  admin: boolean
  items: KpiIndicator[]
  catalog: CatalogKpi[]
  pendingDelete: string | null
  onFact: (id: string, fact: number) => void
  onChart: (id: string) => void
  onEdit: (indicator: KpiIndicator) => void
  onAskDelete: (id: string | null) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="overflow-x-auto border-t border-line">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead className="bg-[#f7f3ea] text-left text-xs tracking-wide text-ink-soft uppercase">
          <tr>
            <th className="sticky left-0 z-10 bg-[#f7f3ea] px-4 py-3 font-medium">Название</th>
            <th className="px-3 py-3 font-medium">Вес</th>
            <th className="px-3 py-3 font-medium">План</th>
            <th className="bg-pine/5 px-3 py-3 font-medium">Факт</th>
            <th className="px-3 py-3 font-medium">% выполнения</th>
            <th className="px-3 py-3 font-medium">Взвешенный</th>
            {admin ? <th className="px-3 py-3 font-medium"><span className="sr-only">Действия</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((indicator) => {
            const shared = findCatalogKpi(catalog, indicator.catalogId)
            const plan = shared ? planPoint(shared.points) : null
            const name = shared?.name ?? 'Показатель удалён из справочника'
            return (
              <tr key={indicator.id} className="border-t border-line align-top">
                <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-medium shadow-[4px_0_8px_-6px_rgba(23,32,51,0.35)]">
                  <span className="block">{name}</span>
                  <span className="mt-1 block text-xs font-normal text-ink-soft">Общий показатель</span>
                </th>
                <td className="px-3 py-3 tabular-nums">{formatPercent(indicator.weight)}</td>
                <td className="px-3 py-3">
                  {shared && admin ? (
                    <span className="flex items-center gap-2">
                      <PlanInput kpiId={shared.id} />
                      {shared.unit ? <span className="text-xs text-ink-soft">{shared.unit}</span> : null}
                    </span>
                  ) : plan && shared ? (
                    <Quantity value={plan.value} unit={shared.unit} />
                  ) : (
                    '—'
                  )}
                </td>
                <td className="bg-pine/5 px-3 py-3">
                  {shared ? (
                    admin ? (
                      <div className="flex items-center gap-2">
                        <DecimalInput
                          key={shared.id}
                          value={shared.fact}
                          ariaLabel={`Факт: ${shared.name}`}
                          onValueChange={(fact) => onFact(shared.id, fact)}
                          className="h-8 w-24 bg-white tabular-nums"
                        />
                        {shared.unit ? <span className="text-xs text-ink-soft">{shared.unit}</span> : null}
                      </div>
                    ) : (
                      <Quantity value={shared.fact} unit={shared.unit} />
                    )
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-3 font-semibold tabular-nums">{formatPercent(completionOf(indicator, catalog))}</td>
                <td className="px-3 py-3 tabular-nums">{formatPercent(weightedOf(indicator, catalog))}</td>
                {admin ? (
                  <td className="px-3 py-3">
                    <RowActions
                      name={name}
                      pending={pendingDelete === indicator.id}
                      onChart={shared ? () => onChart(indicator.id) : undefined}
                      onEdit={() => onEdit(indicator)}
                      onAskDelete={() => onAskDelete(indicator.id)}
                      onCancel={() => onAskDelete(null)}
                      onDelete={() => onDelete(indicator.id)}
                    />
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function MatrixWeightField({
  value,
  others,
  onCommit,
}: {
  value: number
  others: number
  onCommit: (weight: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState('')

  function commit(raw: string) {
    setDraft(null)
    const parsed = parseNumber(raw)
    if (parsed === null || parsed <= 0) {
      setError('Вес — число больше 0.')
      return
    }
    if (others + parsed > 100 + 1e-6) {
      setError('Сумма весов матрицы не может быть больше 100%.')
      return
    }
    setError('')
    if (parsed !== value) onCommit(parsed)
  }

  return (
    <label className="grid gap-1.5 text-sm font-medium">
      Вес в матрице, %
      <Input
        aria-label="Вес smart-задач в матрице"
        inputMode="decimal"
        aria-invalid={Boolean(error)}
        value={draft ?? String(value)}
        className="h-8 w-24 bg-white tabular-nums"
        onFocus={() => {
          setDraft(String(value))
          setError('')
        }}
        onValueChange={(next) => {
          setDraft(next)
          const parsed = parseNumber(next)
          if (parsed !== null && parsed > 0 && others + parsed > 100 + 1e-6) {
            setError('Сумма весов матрицы не может быть больше 100%.')
          } else setError('')
        }}
        onBlur={(event) => commit((event.target as HTMLInputElement).value)}
      />
      {error ? <span className="max-w-64 text-xs font-normal text-destructive">{error}</span> : null}
    </label>
  )
}

function SmartActions({
  task,
  employee,
  moving,
  onStatus,
  onMove,
}: {
  task: SmartTask
  employee: { id: string; managerId: string | null }
  moving: boolean
  onStatus: (status: SmartStatus) => void
  onMove: () => void
}) {
  const actor = useActor()
  const next = (['in_progress', 'done', 'closed'] as const).filter(
    (status) => status !== task.status && canChangeStatus(actor, employee, task.status, status),
  )
  const move = task.status !== 'closed' && canMoveSmart(actor, employee)
  if (next.length === 0 && !move) return null
  return (
    <>
      {next.map((status) => (
        <Button
          key={status}
          type="button"
          size="sm"
          variant="outline"
          aria-label={
            status === 'in_progress'
              ? `Перевести в работу: ${task.name}`
              : status === 'done'
                ? `Отметить выполненной: ${task.name}`
                : `Закрыть: ${task.name}`
          }
          onClick={() => onStatus(status)}
        >
          {status === 'in_progress' ? 'В работе' : status === 'done' ? 'Выполнено' : 'Закрыть'}
        </Button>
      ))}
      {move ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={moving}
          aria-label={`Перенести на следующий месяц: ${task.name}`}
          onClick={onMove}
        >
          На следующий месяц
        </Button>
      ) : null}
    </>
  )
}

function SmartBlock({
  admin,
  employee,
  group,
  matrixWeightSum,
  pendingDelete,
  movingId,
  moveError,
  onChart,
  onWeight,
  onStatus,
  onMove,
  onEdit,
  onAskDelete,
  onDeleteTask,
  onDeleteBlock,
}: {
  admin: boolean
  employee: { id: string; managerId: string | null }
  group: SmartIndicator | null
  matrixWeightSum: number
  pendingDelete: string | null
  movingId: string | null
  moveError: string
  onChart: () => void
  onWeight: (weight: number) => void
  onStatus: (id: string, status: SmartStatus) => void
  onMove: (id: string) => void
  onEdit: (task: SmartTask) => void
  onAskDelete: (id: string | null) => void
  onDeleteTask: (id: string) => void
  onDeleteBlock: () => void
}) {
  if (!group) {
    return (
      <p className="border-t border-line px-5 py-8 text-sm text-ink-soft">
        {admin
          ? 'В матрице пока нет блока Smart-задач. Нажмите «Создать», задайте вес блока и первую задачу.'
          : 'Блок Smart-задач добавляет администратор. Сотрудник создаёт задачу со статусом «Создан», руководитель переводит её в работу и закрывает после выполнения.'}
      </p>
    )
  }
  const blockPending = pendingDelete === group.id
  return (
    <div className="border-t border-line">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3 px-4 py-4 md:px-5">
        {admin ? (
          <MatrixWeightField
            value={group.weight}
            others={matrixWeightSum - group.weight}
            onCommit={onWeight}
          />
        ) : (
          <div>
            <p className="text-xs text-ink-soft">Вес в матрице</p>
            <p className="text-lg font-semibold tabular-nums">{formatPercent(group.weight)}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-ink-soft">Выполнено задач</p>
          <p className="text-lg font-semibold tabular-nums">{formatPercent(smartGroupCompletion(group))}</p>
        </div>
        <div>
          <p className="text-xs text-ink-soft">Влияние на вес</p>
          <p className="text-lg font-semibold tabular-nums">{formatPercent(completionOf(group))}</p>
        </div>
        <div>
          <p className="text-xs text-ink-soft">Вклад в КР</p>
          <p className="text-lg font-semibold tabular-nums">{formatPercent(weightedOf(group))}</p>
        </div>
        {admin ? (
          <Button type="button" variant="outline" size="sm" onClick={onChart}>
            <ChartLine />
            График
          </Button>
        ) : null}
        {admin ? (
          blockPending ? (
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="destructive" onClick={onDeleteBlock}>
                Удалить блок
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => onAskDelete(null)}>
                Нет
              </Button>
            </div>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={() => onAskDelete(group.id)}>
              Удалить блок
            </Button>
          )
        ) : null}
      </div>
      {group.tasks.length === 0 ? (
        <p className="border-t border-line px-5 py-8 text-sm text-ink-soft">
          В блоке пока нет задач. Вес в матрице сохранён, выполнение блока — 0%.
        </p>
      ) : (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="bg-[#f7f3ea] text-left text-xs tracking-wide text-ink-soft uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Название</th>
                <th className="px-3 py-3 font-medium">Вес задачи</th>
                <th className="px-3 py-3 font-medium">Статус</th>
                <th className="px-3 py-3 font-medium">% выполнения</th>
                <th className="px-3 py-3 font-medium">Вклад в smart</th>
                {admin ? <th className="px-3 py-3"><span className="sr-only">Действия</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {group.tasks.map((task) => {
                const completion = smartCompletion(task.status)
                return (
                  <tr key={task.id} className="border-t border-line">
                    <th className="px-4 py-3 text-left font-medium">
                      <span className="block">{task.name}</span>
                      {task.comments.length > 0 ? (
                        <span className="mt-1 block text-xs font-normal text-ink-soft">{commentLabel(task.comments.length)}</span>
                      ) : null}
                    </th>
                    <td className="px-3 py-3 tabular-nums">{formatPercent(task.weight)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{SMART_STATUS_LABEL[task.status]}</span>
                        <SmartActions
                          task={task}
                          employee={employee}
                          moving={movingId === task.id}
                          onStatus={(status) => onStatus(task.id, status)}
                          onMove={() => onMove(task.id)}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3 font-semibold tabular-nums">{formatPercent(completion)}</td>
                    <td className="px-3 py-3 tabular-nums">{formatPercent((completion * task.weight) / 100)}</td>
                    {admin ? (
                      <td className="px-3 py-3">
                        <RowActions
                          name={task.name}
                          pending={pendingDelete === task.id}
                          onEdit={() => onEdit(task)}
                          onAskDelete={() => onAskDelete(task.id)}
                          onCancel={() => onAskDelete(null)}
                          onDelete={() => onDeleteTask(task.id)}
                        />
                      </td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {moveError ? (
        <p role="alert" className="border-t border-line px-5 py-3 text-sm text-destructive">
          {moveError}
        </p>
      ) : null}
    </div>
  )
}

function StandardTable({
  admin,
  items,
  employees,
  pendingDelete,
  onScore,
  onEvaluator,
  onChart,
  onEdit,
  onAskDelete,
  onDelete,
}: {
  admin: boolean
  items: StandardIndicator[]
  employees: { id: string; name: string }[]
  pendingDelete: string | null
  onScore: (id: string, score: number) => void
  onEvaluator: (id: string, evaluatorId: string) => void
  onChart: (id: string) => void
  onEdit: (indicator: StandardIndicator) => void
  onAskDelete: (id: string | null) => void
  onDelete: (id: string) => void
}) {
  const people = employees.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  return (
    <div className="overflow-x-auto border-t border-line">
      <table className="w-full min-w-[920px] border-collapse text-sm">
        <thead className="bg-[#f7f3ea] text-left text-xs tracking-wide text-ink-soft uppercase">
          <tr>
            <th className="px-4 py-3 font-medium">Название</th>
            <th className="px-3 py-3 font-medium">Вес</th>
            <th className="px-3 py-3 font-medium">Оценщик</th>
            <th className="px-3 py-3 font-medium">Оценка</th>
            <th className="px-3 py-3 font-medium">% выполнения</th>
            <th className="px-3 py-3 font-medium">Взвешенный</th>
            {admin ? <th className="px-3 py-3"><span className="sr-only">Действия</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((indicator) => (
            <tr key={indicator.id} className="border-t border-line">
              <th className="px-4 py-3 text-left font-medium">{indicator.name}</th>
              <td className="px-3 py-3 tabular-nums">{formatPercent(indicator.weight)}</td>
              <td className="px-3 py-3">
                {admin ? (
                  <select
                    aria-label={`Оценщик: ${indicator.name}`}
                    value={indicator.evaluatorId ?? ''}
                    onChange={(event) => onEvaluator(indicator.id, event.target.value)}
                    className="h-8 max-w-52 rounded-lg border border-line bg-white px-2 text-sm"
                  >
                    {indicator.evaluatorId ? null : <option value="">Выберите сотрудника</option>}
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  people.find((person) => person.id === indicator.evaluatorId)?.name ?? 'Не назначен'
                )}
              </td>
              <td className="px-3 py-3">
                {admin ? (
                  <select
                    aria-label={`Оценка: ${indicator.name}`}
                    value={String(indicator.score)}
                    onChange={(event) => onScore(indicator.id, Number(event.target.value))}
                    className="h-8 rounded-lg border border-line bg-white px-2 text-sm"
                  >
                    {indicator.points
                      .slice()
                      .sort((a, b) => a.score - b.score)
                      .map((point) => (
                        <option key={point.id} value={point.score}>
                          {point.score > 0 ? `+${point.score}` : point.score} · {formatPercent(point.completion)}
                        </option>
                      ))}
                  </select>
                ) : (
                  <span className="tabular-nums">
                    {indicator.score > 0 ? `+${indicator.score}` : indicator.score}
                  </span>
                )}
              </td>
              <td className="px-3 py-3 font-semibold tabular-nums">{formatPercent(completionOf(indicator))}</td>
              <td className="px-3 py-3 tabular-nums">{formatPercent(weightedOf(indicator))}</td>
              {admin ? (
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
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function commentLabel(count: number) {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return `${count} комментарий`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} комментария`
  return `${count} комментариев`
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
