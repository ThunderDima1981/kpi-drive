import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { calendarDays, formatPeriod, MONTHS, parsePeriodId, periodId, WEEKDAYS } from '../lib/period.ts'

export function PeriodCalendar({
  value,
  onChange,
}: {
  value: string
  onChange: (id: string) => void
}) {
  const selected = parsePeriodId(value) ?? { year: 2026, month: 10 }
  const [visible, setVisible] = useState(selected)
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    setVisible(selected)
  }
  const today = new Date()
  const todayYear = today.getFullYear()
  const todayMonth = today.getMonth() + 1
  const todayDay = today.getDate()
  const days = calendarDays(visible.year, visible.month)
  const visibleId = periodId(visible.year, visible.month)
  const monthSelected = visibleId === value

  function move(delta: number) {
    const date = new Date(visible.year, visible.month - 1 + delta, 1)
    setVisible({ year: date.getFullYear(), month: date.getMonth() + 1 })
  }

  return (
    <div className="w-full">
      <p className="text-xs font-semibold tracking-[0.14em] text-gold uppercase">Период</p>
      <p className="mt-1 text-lg font-semibold">{formatPeriod(value)}</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Месяц матрицы. Новый месяц копирует состав и план: факт встаёт на 0% шкалы, smart-задачи получают статус «Создан», оценки стандартов — 0.
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          className="grid size-8 place-items-center rounded-lg border border-line bg-white text-ink hover:bg-muted"
          aria-label="Предыдущий месяц"
          onClick={() => move(-1)}
        >
          <ChevronLeft className="size-4" />
        </button>
        <p className="text-sm font-medium">{`${MONTHS[visible.month - 1]} ${visible.year}`}</p>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-lg border border-line bg-white text-ink hover:bg-muted"
          aria-label="Следующий месяц"
          onClick={() => move(1)}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-ink-soft">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((day, index) => {
          if (!day) return <span key={`empty-${index}`} />
          const isToday = visible.year === todayYear && visible.month === todayMonth && day === todayDay
          return (
            <button
              key={day}
              type="button"
              aria-pressed={monthSelected}
              aria-label={`${day} ${MONTHS[visible.month - 1]} ${visible.year}`}
              onClick={() => onChange(visibleId)}
              className={cn(
                'h-8 rounded-lg text-sm tabular-nums',
                monthSelected && !isToday && 'bg-pine/15 font-semibold text-pine',
                !monthSelected && 'hover:bg-muted',
                isToday && 'bg-pine font-semibold text-primary-foreground',
              )}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}
