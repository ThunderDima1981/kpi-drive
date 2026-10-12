import { useEffect, useState } from 'react'
import { PeriodCalendar } from './period-calendar.tsx'
import { ApiError, api } from '../lib/api.ts'
import { scoreLabel, type EvaluationItem } from '../lib/evaluations.ts'
import { formatPercent } from '../lib/format.ts'
import { useTeamStore } from '../store/team-store.ts'

type EvaluationResponse = {
  assigned: boolean
  period: string
  items: EvaluationItem[]
}

export function EvaluationsView() {
  const currentPeriod = useTeamStore((state) => state.currentPeriod)
  const setPeriodScore = useTeamStore((state) => state.setPeriodScore)
  const [period, setPeriod] = useState(currentPeriod)
  const [items, setItems] = useState<EvaluationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    void api<EvaluationResponse>(`/api/evaluations?period=${encodeURIComponent(period)}`)
      .then((result) => {
        if (!cancelled) setItems(result.items)
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось загрузить оценки.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [period])

  async function choose(item: EvaluationItem, score: number) {
    if (item.score === score) return
    setSavingId(item.indicatorId)
    setError('')
    try {
      const result = await api<{ item: EvaluationItem }>('/api/evaluations', {
        method: 'POST',
        body: JSON.stringify({
          periodId: period,
          employeeId: item.employeeId,
          indicatorId: item.indicatorId,
          score,
        }),
      })
      setItems((current) => current.map((row) => (row.indicatorId === item.indicatorId && row.employeeId === item.employeeId ? result.item : row)))
      setPeriodScore(period, item.employeeId, item.indicatorId, score)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось сохранить оценку.')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-gold uppercase">Оценки</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Заполнить оценки</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Здесь показатели, по которым вы назначены оценщиком другого сотрудника. Оценка относится к выбранному месяцу.
        </p>
      </header>
      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <PeriodCalendar value={period} onChange={setPeriod} />
      </section>
      {loading ? <p className="text-sm text-ink-soft">Загружаем показатели…</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!loading && items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-card px-5 py-8 text-sm text-ink-soft">
          В этом месяце вам не назначены оценки других сотрудников.
        </p>
      ) : null}
      <ul className="grid gap-3">
        {items.map((item) => (
          <li key={`${item.employeeId}-${item.indicatorId}`} className="rounded-2xl border border-line bg-card p-5 shadow-sm">
            <p className="font-medium">{item.employeeName}</p>
            <p className="text-sm text-ink-soft">{item.position}</p>
            <p className="mt-3 font-medium">{item.name}</p>
            <p className="text-sm text-ink-soft">Вес {formatPercent(item.weight)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {item.points.map((point) => {
                const selected = point.score === item.score
                return (
                  <button
                    key={point.score}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`Оценка ${item.name}: ${scoreLabel(point.score)}`}
                    disabled={savingId === item.indicatorId}
                    onClick={() => void choose(item, point.score)}
                    className={
                      selected
                        ? 'rounded-lg bg-pine px-3 py-2 text-sm font-semibold text-primary-foreground'
                        : 'rounded-lg border border-line bg-white px-3 py-2 text-sm hover:bg-muted'
                    }
                  >
                    {scoreLabel(point.score)} · {formatPercent(point.completion)}
                  </button>
                )
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
