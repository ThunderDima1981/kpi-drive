import { cn } from '@/lib/utils'

export function OrgToggle({
  open,
  name,
  tone,
  onClick,
}: {
  open: boolean
  name: string
  tone: 'dark' | 'light'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`${open ? 'Свернуть' : 'Развернуть'} ${name}`}
      onClick={onClick}
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-md border text-sm leading-none font-semibold',
        tone === 'dark'
          ? 'border-white/20 text-white hover:bg-white/10'
          : 'border-line bg-white text-ink hover:bg-muted',
      )}
    >
      {open ? '−' : '+'}
    </button>
  )
}

export function OrgSearch({
  value,
  onChange,
  tone,
}: {
  value: string
  onChange: (value: string) => void
  tone: 'dark' | 'light'
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Поиск"
      aria-label="Поиск сотрудника"
      className={cn(
        'h-9 w-full rounded-lg border px-2.5 text-sm outline-none',
        tone === 'dark'
          ? 'border-white/15 bg-white/5 text-white placeholder:text-white/40 focus:border-white/40'
          : 'border-input bg-white placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/50',
      )}
    />
  )
}
