import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { parseNumber } from '../lib/format.ts'

export function DecimalInput({
  value,
  onValueChange,
  ariaLabel,
  className,
}: {
  value: number
  onValueChange: (value: number) => void
  ariaLabel: string
  className?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <Input
      aria-label={ariaLabel}
      inputMode="decimal"
      className={className}
      value={draft ?? String(value)}
      onFocus={() => setDraft(String(value))}
      onBlur={() => setDraft(null)}
      onValueChange={(next) => {
        setDraft(next)
        const parsed = parseNumber(next)
        if (parsed !== null) onValueChange(parsed)
      }}
    />
  )
}
