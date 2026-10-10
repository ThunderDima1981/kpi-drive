import { useRef } from 'react'
import { Button } from '@/components/ui/button'

export function ExcelButtons({
  templateLabel,
  uploadLabel,
  busy,
  onTemplate,
  onFile,
}: {
  templateLabel: string
  uploadLabel: string
  busy: boolean
  onTemplate: () => void
  onFile: (file: File) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button type="button" variant="outline" onClick={onTemplate}>
        {templateLabel}
      </Button>
      <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Загружаем…' : uploadLabel}
      </Button>
      <input
        ref={input}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        aria-label={uploadLabel}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) onFile(file)
        }}
      />
    </>
  )
}
