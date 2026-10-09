import { ArrowUpRight } from 'lucide-react'
import { TeamKrChart, ZoneChart } from './analytics-charts.tsx'
import { PeriodCalendar } from './period-calendar.tsx'
import { OrgSearch, OrgToggle } from './org-toggle.tsx'
import { useOrgList } from './use-org-list.ts'
import { matrixResult } from '../lib/calc.ts'
import { formatPercent, initials, peopleLabel, zoneOf, ZONES, type ZoneKey } from '../lib/format.ts'
import type { OrgNode } from '../lib/org.ts'
import { useIsAdmin } from '../lib/role.tsx'
import { useTeamStore } from '../store/team-store.ts'

export function Dashboard({ onOpenEmployee, onOpenSettings }: { onOpenEmployee: (id: string) => void; onOpenSettings: () => void }) {
  const employees = useTeamStore((state) => state.employees)
  const kpiCatalog = useTeamStore((state) => state.kpiCatalog)
  const periodLabel = useTeamStore((state) => state.periodLabel)
  const currentPeriod = useTeamStore((state) => state.currentPeriod)
  const selectPeriod = useTeamStore((state) => state.selectPeriod)
  const admin = useIsAdmin()
  const org = useOrgList(employees)
  const rows = employees
    .map((employee) => {
      const result = matrixResult(employee.indicators, kpiCatalog)
      return { employee, ...result, zone: zoneOf(result.kr) }
    })
    .sort((a, b) => b.kr - a.kr)
  const byId = new Map(rows.map((row) => [row.employee.id, row]))

  const counts: Record<ZoneKey, number> = { red: 0, amber: 0, green: 0 }
  for (const row of rows) counts[row.zone] += 1
  const average = rows.length ? rows.reduce((sum, row) => sum + row.kr, 0) / rows.length : null

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-gold uppercase">{periodLabel}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Результативность команды</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Коэффициент результативности — взвешенная сумма выполнения матрицы за выбранный месяц. Зарплата и премии в расчёт не входят.
          </p>
        </div>
        <div className="w-full rounded-2xl border border-line bg-card p-4 shadow-sm sm:w-[22rem]">
          <PeriodCalendar value={currentPeriod} onChange={selectPeriod} />
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="В матрицах" value={peopleLabel(rows.length)} />
        <Stat label="Средний КР" value={average === null ? '—' : formatPercent(average)} />
        <Stat label="Зелёная зона" value={peopleLabel(counts.green)} tone={ZONES.green.color} />
        <Stat label="Ниже 80%" value={peopleLabel(counts.red)} tone={ZONES.red.color} />
      </section>

      {rows.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-line bg-card px-6 py-16 text-center">
          <h2 className="text-xl font-semibold">В команде пока никого</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
            {admin
              ? 'Добавьте сотрудника, соберите матрицу и введите факт. КР пересчитается сразу.'
              : 'Администратор ещё не открыл матрицы. Когда доступ появится, здесь можно создавать smart-задачи и отмечать их выполненными.'}
          </p>
          {admin ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className="mt-5 rounded-lg bg-pine px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Настроить команду
            </button>
          ) : null}
        </section>
      ) : (
        <>
          <section className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-2xl border border-line bg-card p-4 shadow-sm md:p-5">
              <h2 className="text-base font-semibold">Зоны результативности</h2>
              <p className="mt-1 text-sm text-ink-soft">Сколько человек сейчас в красной, жёлтой и зелёной зоне.</p>
              <ZoneChart counts={counts} />
            </article>
            <article className="rounded-2xl border border-line bg-card p-4 shadow-sm md:p-5">
              <h2 className="text-base font-semibold">КР по сотрудникам</h2>
              <p className="mt-1 text-sm text-ink-soft">Пунктир отмечает 80% и 100%. Шкала графика — до 130%.</p>
              <TeamKrChart rows={rows.map((row) => ({ id: row.employee.id, name: row.employee.name, kr: row.kr }))} />
            </article>
          </section>

          <section className="grid gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">Сотрудники</h2>
                <p className="mt-1 text-sm text-ink-soft">Ветка открывается по «+». Поиск оставляет совпадения и их руководителей.</p>
              </div>
              <div className="w-full sm:max-w-xs">
                <OrgSearch value={org.query} onChange={org.setQuery} tone="light" />
              </div>
            </div>
            {org.nodes.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line bg-card px-5 py-8 text-sm text-ink-soft">
                Никого не нашли по этому запросу.
              </p>
            ) : (
              <EmployeeBranches
                nodes={org.nodes}
                depth={0}
                open={org.open}
                byId={byId}
                onToggle={org.toggle}
                onOpen={onOpenEmployee}
              />
            )}
          </section>
        </>
      )}
    </div>
  )
}

function EmployeeBranches({
  nodes,
  depth,
  open,
  byId,
  onToggle,
  onOpen,
}: {
  nodes: OrgNode[]
  depth: number
  open: Set<string>
  byId: Map<string, { kr: number; zone: ZoneKey; byType: { kpi: number; smart: number; standard: number }; employee: { id: string; name: string; position: string } }>
  onToggle: (id: string) => void
  onOpen: (id: string) => void
}) {
  return (
    <div className="grid gap-3">
      {nodes.map((node) => {
        const row = byId.get(node.employee.id)
        if (!row) return null
        const expanded = open.has(node.employee.id)
        const hasChildren = node.children.length > 0
        return (
          <div key={node.employee.id} className="grid gap-3" style={{ marginLeft: depth > 0 ? 28 : 0 }}>
            <div className="flex items-start gap-2">
              {hasChildren ? (
                <div className="pt-5">
                  <OrgToggle open={expanded} name={node.employee.name} tone="light" onClick={() => onToggle(node.employee.id)} />
                </div>
              ) : (
                <span className="mt-5 size-6 shrink-0" />
              )}
              <EmployeeCard row={row} onOpen={() => onOpen(node.employee.id)} />
            </div>
            {hasChildren && expanded ? (
              <EmployeeBranches
                nodes={node.children}
                depth={depth + 1}
                open={open}
                byId={byId}
                onToggle={onToggle}
                onOpen={onOpen}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function EmployeeCard({
  row,
  onOpen,
}: {
  row: { kr: number; zone: ZoneKey; byType: { kpi: number; smart: number; standard: number }; employee: { id: string; name: string; position: string } }
  onOpen: () => void
}) {
  const zone = ZONES[row.zone]
  return (
    <button
      type="button"
      onClick={onOpen}
      className="min-w-0 flex-1 rounded-2xl border border-line bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-pine/40"
      style={{ boxShadow: `inset 0 3px 0 ${zone.color}` }}
      aria-label={`Открыть матрицу ${row.employee.name}, КР ${formatPercent(row.kr)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-muted text-sm font-semibold">
            {initials(row.employee.name)}
          </span>
          <span>
            <span className="block font-semibold">{row.employee.name}</span>
            <span className="block text-sm text-ink-soft">{row.employee.position}</span>
          </span>
        </div>
        <ArrowUpRight className="size-4 text-ink-soft" />
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <p className="font-display text-5xl leading-none tracking-tight" style={{ color: zone.color }}>
          {formatPercent(row.kr).replace('%', '')}
          <span className="ml-1 font-sans text-lg font-semibold">%</span>
        </p>
        <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ color: zone.color, background: zone.soft }}>
          {zone.label}
        </span>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="flex h-full">
          <span className="h-full bg-pine" style={{ width: `${(row.byType.kpi / 130) * 100}%` }} />
          <span className="h-full bg-gold" style={{ width: `${(row.byType.smart / 130) * 100}%` }} />
          <span className="h-full bg-ink-soft" style={{ width: `${(row.byType.standard / 130) * 100}%` }} />
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        KPI {formatPercent(row.byType.kpi)} · Задачи {formatPercent(row.byType.smart)} · Стандарты{' '}
        {formatPercent(row.byType.standard)}
      </p>
    </button>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <article className="rounded-2xl border border-line bg-card px-4 py-4 shadow-sm">
      <p className="text-xs font-medium tracking-wide text-ink-soft uppercase">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
    </article>
  )
}
