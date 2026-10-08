import { formatPercent, zoneOf, ZONES } from '../lib/format.ts'

export function KrGauge({ kr }: { kr: number }) {
  const zone = ZONES[zoneOf(kr)]
  const radius = 78
  const circumference = 2 * Math.PI * radius
  const visible = circumference * (240 / 360)
  const clamped = Math.min(Math.max(kr, 0), 130)
  const progress = visible * (clamped / 130)
  const label = formatPercent(kr).replace('%', '')

  return (
    <div className="relative mx-auto size-52">
      <svg viewBox="0 0 200 200" className="size-full" aria-hidden="true">
        <g transform="rotate(150 100 100)">
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="#efe6d4"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${visible} ${circumference}`}
          />
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke={zone.color}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference}`}
          />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-3">
        <p className="font-display text-[2.7rem] leading-none tracking-tight text-ink" style={{ color: zone.color }}>
          {label}
          <span className="ml-0.5 font-sans text-xl font-semibold">%</span>
        </p>
        <p className="mt-2 text-[11px] font-semibold tracking-[0.16em] text-ink-soft uppercase">шкала до 130%</p>
      </div>
    </div>
  )
}
