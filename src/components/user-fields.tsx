import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type TeamEmployee = { id: string; name: string; position: string }

export function AccessFields({
  employees,
  employeeId,
  matrixIds,
  onEmployeeId,
  onMatrixIds,
}: {
  employees: TeamEmployee[]
  employeeId: string
  matrixIds: string[]
  onEmployeeId: (id: string) => void
  onMatrixIds: (ids: string[]) => void
}) {
  const people = employees.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  const known = new Set(people.map((employee) => employee.id))
  const missing = matrixIds.filter((id) => !known.has(id))

  function toggle(id: string, checked: boolean) {
    onMatrixIds(checked ? [...matrixIds, id] : matrixIds.filter((item) => item !== id))
  }

  return (
    <div className="grid gap-3">
      <Label className="grid gap-1.5">
        <span>Сотрудник</span>
        <select
          aria-label="Сотрудник учётной записи"
          value={employeeId}
          onChange={(event) => {
            const next = event.target.value
            onEmployeeId(next)
            if (next && !matrixIds.includes(next)) onMatrixIds([...matrixIds, next])
          }}
          className="h-8 rounded-lg border border-input bg-white px-2 text-sm"
        >
          <option value="">Не выбран</option>
          {people.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name} · {employee.position}
            </option>
          ))}
          {employeeId && !known.has(employeeId) ? <option value={employeeId}>Сотрудник не найден</option> : null}
        </select>
      </Label>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Матрицы</legend>
        <p className="text-xs text-ink-soft">Пользователь открывает только отмеченные матрицы.</p>
        {people.length === 0 && missing.length === 0 ? (
          <p className="text-sm text-ink-soft">В этом месяце пока нет сотрудников.</p>
        ) : (
          <ul className="grid max-h-48 gap-2 overflow-y-auto">
            {people.map((employee) => (
              <li key={employee.id}>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={matrixIds.includes(employee.id)}
                    aria-label={`Матрица: ${employee.name}`}
                    onCheckedChange={(checked) => toggle(employee.id, checked === true)}
                  />
                  <span>{employee.name}</span>
                  <span className="text-ink-soft">{employee.position}</span>
                </label>
              </li>
            ))}
            {missing.map((id) => (
              <li key={id}>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked aria-label="Матрица удалённого сотрудника" onCheckedChange={(checked) => toggle(id, checked === true)} />
                  <span className="text-ink-soft">Сотрудник не найден</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
    </div>
  )
}

export function Field({
  label,
  name,
  type = 'text',
  defaultValue,
  autoComplete,
}: {
  label: string
  name: string
  type?: string
  defaultValue?: string
  autoComplete?: string
}) {
  return (
    <Label className="grid gap-1.5">
      <span>{label}</span>
      <Input name={name} type={type} defaultValue={defaultValue} autoComplete={autoComplete} aria-label={label} />
    </Label>
  )
}
