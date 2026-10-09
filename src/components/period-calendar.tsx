import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPeriod, MONTHS, parsePeriodId, periodId } from '../lib/period.ts'

export function PeriodCalendar({
  value,
  onChange,
}: {
  value: string
  onChange: (id: string) => void
}) {
  const selected = parsePeriodId(value) ?? { year: 2026, month: 10 }
  const [year, setYear] = useState(selected.year)
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    setYear(selected.year)
  }
  const today = new Date()
  const todayYear = today.getFullYear()
  const todayMonth = today.getMonth() + 1

  return (
    <div className="w-full">
      <p className="text-xs font-semibold tracking-[0.14em] text-gold uppercase">Период</p>
      <p className="mt-1 text-lg font-semibold">{formatPeriod(value)}</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Новый месяц копирует состав матрицы. План и факт заполняются заново, оценки стандартов начинаются с 0, smart-задачи создаются заново.
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          className="grid size-8 place-items-center rounded-lg border border-line bg-white text-ink hover:bg-muted"
          aria-label="Предыдущий год"
          onClick={() => setYear((current) => current - 1)}
        >
          <ChevronLeft className="size-4" />
        </button>
        <p className="text-sm font-medium tabular-nums">{year}</p>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-lg border border-line bg-white text-ink hover:bg-muted"
          aria-label="Следующий год"
          onClick={() => setYear((current) => current + 1)}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {MONTHS.map((month, index) => {
          const monthNumber = index + 1
          const active = selected.year === year && selected.month === monthNumber
          const current = todayYear === year && todayMonth === monthNumber
          return (
            <button
              key={month}
              type="button"
              aria-pressed={active}
              aria-label={`${month} ${year}`}
              onClick={() => onChange(periodId(year, monthNumber))}
              className={cn(
                'rounded-lg px-1 py-2 text-[13px] leading-tight whitespace-nowrap',
                active ? 'bg-pine font-semibold text-primary-foreground' : 'hover:bg-muted',
                current && !active && 'ring-1 ring-pine',
              )}
            >
              {month}
            </button>
          )
        })}
      </div>
    </div>
  )
}
