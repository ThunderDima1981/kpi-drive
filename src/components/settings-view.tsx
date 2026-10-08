import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { initials } from '../lib/format.ts'
import { useTeamStore } from '../store/team-store.ts'
import type { Employee } from '../types.ts'

export function SettingsView() {
  const employees = useTeamStore((state) => state.employees)
  const periodLabel = useTeamStore((state) => state.periodLabel)
  const setPeriodLabel = useTeamStore((state) => state.setPeriodLabel)
  const addEmployee = useTeamStore((state) => state.addEmployee)
  const resetDemo = useTeamStore((state) => state.resetDemo)
  const [name, setName] = useState('')
  const [position, setPosition] = useState('')
  const [error, setError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  function add(event: React.FormEvent) {
    event.preventDefault()
    const id = addEmployee(name, position)
    if (!id) {
      setError('Укажите ФИО и должность.')
      return
    }
    setName('')
    setPosition('')
    setError('')
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-gold uppercase">Команда</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Настройки</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Состав команды и период матрицы хранятся в этом браузере. Расчёт по-прежнему только про коэффициент результативности.
        </p>
      </header>

      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <Label className="grid gap-1.5">
          <span>Период матрицы</span>
          <Input value={periodLabel} aria-label="Период матрицы" onValueChange={setPeriodLabel} />
        </Label>
      </section>

      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <h2 className="font-semibold">Новый сотрудник</h2>
        <form onSubmit={add} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Label className="grid gap-1.5">
            <span>ФИО</span>
            <Input value={name} onValueChange={setName} aria-label="ФИО нового сотрудника" />
          </Label>
          <Label className="grid gap-1.5">
            <span>Должность</span>
            <Input value={position} onValueChange={setPosition} aria-label="Должность нового сотрудника" />
          </Label>
          <Button type="submit">Добавить</Button>
        </form>
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      </section>

      <section className="rounded-2xl border border-line bg-card shadow-sm">
        <h2 className="px-5 pt-5 font-semibold">Состав</h2>
        {employees.length === 0 ? (
          <p className="px-5 py-8 text-sm text-ink-soft">Список пуст. Добавьте первого сотрудника или верните демонстрационную команду.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {employees.map((employee) => (
              <EmployeeRow key={employee.id} employee={employee} />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <h2 className="font-semibold">Демонстрационные данные</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Вернёт пять матриц, включая Иванова Ивана, директора по маркетингу. Текущие правки в этом браузере будут заменены.
        </p>
        <div className="mt-4 flex gap-2">
          {confirmReset ? (
            <>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  resetDemo()
                  setConfirmReset(false)
                }}
              >
                Заменить данные
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirmReset(false)}>
                Отмена
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={() => setConfirmReset(true)}>
              Вернуть демо-команду
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}

function EmployeeRow({ employee }: { employee: Employee }) {
  const updateEmployee = useTeamStore((state) => state.updateEmployee)
  const removeEmployee = useTeamStore((state) => state.removeEmployee)
  const [name, setName] = useState(employee.name)
  const [position, setPosition] = useState(employee.position)
  const [source, setSource] = useState({ name: employee.name, position: employee.position })
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (source.name !== employee.name || source.position !== employee.position) {
    setSource({ name: employee.name, position: employee.position })
    setName(employee.name)
    setPosition(employee.position)
  }

  function commit() {
    const nextName = name.trim()
    const nextPosition = position.trim()
    if (!nextName || !nextPosition) {
      setName(employee.name)
      setPosition(employee.position)
      return
    }
    updateEmployee(employee.id, { name: nextName, position: nextPosition })
  }

  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold">
        {initials(name || employee.name)}
      </span>
      <Label className="grid flex-1 gap-1">
        <span className="sr-only">ФИО</span>
        <Input value={name} aria-label={`ФИО: ${employee.name}`} onValueChange={setName} onBlur={commit} />
      </Label>
      <Label className="grid flex-1 gap-1">
        <span className="sr-only">Должность</span>
        <Input value={position} aria-label={`Должность: ${employee.name}`} onValueChange={setPosition} onBlur={commit} />
      </Label>
      {confirmDelete ? (
        <div className="flex gap-2">
          <Button type="button" variant="destructive" onClick={() => removeEmployee(employee.id)}>
            Удалить
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
            Нет
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => setConfirmDelete(true)}>
          Удалить
        </Button>
      )}
    </li>
  )
}
