export type ZoneKey = 'red' | 'amber' | 'green'

export const ZONES: Record<
  ZoneKey,
  { label: string; range: string; color: string; soft: string }
> = {
  red: { label: 'Красная зона', range: 'ниже 80%', color: '#b42318', soft: '#f8e6e3' },
  amber: { label: 'Жёлтая зона', range: '80–99%', color: '#b45309', soft: '#f8edd9' },
  green: { label: 'Зелёная зона', range: '100% и выше', color: '#157a4b', soft: '#e5f3ec' },
}

export function roundTo(value: number, digits = 1) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function zoneOf(kr: number): ZoneKey {
  const value = roundTo(kr, 1)
  if (value < 80) return 'red'
  if (value < 100) return 'amber'
  return 'green'
}

export function formatPercent(value: number, digits = 1) {
  if (!Number.isFinite(value)) return '—'
  const rounded = roundTo(value, digits)
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',')
  return `${text}%`
}

export function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)
}

export function parseNumber(raw: string) {
  const normalized = raw.replace(/\s/g, '').replace(',', '.')
  if (normalized.trim() === '' || normalized === '-' || normalized === '.' || normalized === '-.') {
    return null
  }
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

export function peopleLabel(count: number) {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return `${count} сотрудник`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} сотрудника`
  return `${count} сотрудников`
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('ru-RU') ?? '')
    .join('')
}
