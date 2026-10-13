import { describe, expect, it } from 'vitest'
import { defaultStandardPoints } from './calc.ts'
import { sanitizeEmployees } from './org.ts'
import { publishPeriods } from './period.ts'
import { defaultSmartPoints } from './smart.ts'
import { documentOwnerId, mergeUserTeam, userChangeAllowed, visibleTeam } from './access.ts'
import type { SmartActor } from './smart-access.ts'
import type { SmartTask, TeamData } from '../types.ts'

function task(status: SmartTask['status'], id = 'task'): SmartTask {
  return { id, name: 'Задача', weight: 40, detail: '', criterion: '', status, comments: [] }
}

const employeeActor: SmartActor = { role: 'user', employeeId: 'person' }

function asSaved(value: ReturnType<typeof mergeUserTeam>) {
  return value && 'saved' in value ? value : null
}

function team(status: SmartTask['status'] = 'created'): TeamData {
  return publishPeriods(
    [
      {
        id: '2026-10',
        kpiCatalog: [],
        employees: [
          {
            id: 'person',
            name: 'Сотрудник',
            position: 'Роль',
            managerId: null,
            indicators: [
              {
                id: 'smart',
                type: 'smart',
                weight: 30,
                points: defaultSmartPoints(),
                tasks: [task(status)],
              },
              {
                id: 'std',
                type: 'standard',
                name: 'Срок',
                weight: 10,
                score: 0,
                points: defaultStandardPoints(),
                evaluatorId: null,
              },
            ],
          },
        ],
      },
    ],
    '2026-10',
  )
}

describe('documentOwnerId', () => {
  it('keeps the founding administrator on their own team and joins later administrators to it', () => {
    expect(documentOwnerId({ id: 'owner', role: 'admin', teamOwnerId: null })).toBe('owner')
    expect(documentOwnerId({ id: 'boss', role: 'admin', teamOwnerId: 'owner' })).toBe('owner')
    expect(documentOwnerId({ id: 'person', role: 'user', teamOwnerId: 'owner' })).toBe('owner')
    expect(documentOwnerId({ id: 'guest', role: 'user', teamOwnerId: null })).toBeNull()
  })
})

describe('user permissions', () => {
  it('allows a new smart task and the done status', () => {
    const before = team()
    const after = structuredClone(before)
    const smart = after.employees[0]?.indicators.find((item) => item.type === 'smart')
    if (smart?.type !== 'smart') throw new Error('missing smart')
    smart.tasks[0]!.status = 'done'
    smart.tasks.push({ ...task('created', 'next'), name: 'Вторая' })
    after.periods = after.periods.map((period) =>
      period.id === after.currentPeriod ? { ...period, employees: after.employees, kpiCatalog: after.kpiCatalog } : period,
    )
    expect(userChangeAllowed(before, after)).toBe(true)
  })

  it('rejects closing a task, editing a standard, and opening settings data', () => {
    const closed = structuredClone(team('done'))
    const smart = closed.employees[0]?.indicators.find((item) => item.type === 'smart')
    if (smart?.type !== 'smart') throw new Error('missing smart')
    smart.tasks[0]!.status = 'closed'
    closed.periods[0]!.employees = closed.employees
    expect(userChangeAllowed(team('done'), closed)).toBe(false)

    const scored = structuredClone(team())
    const standard = scored.employees[0]?.indicators.find((item) => item.type === 'standard')
    if (standard?.type !== 'standard') throw new Error('missing standard')
    standard.score = 2
    scored.periods[0]!.employees = scored.employees
    expect(userChangeAllowed(team(), scored)).toBe(false)
  })

  it('lets an employee add a comment to an existing task but not rewrite earlier comments', () => {
    const stored = structuredClone(team())
    const storedSmart = stored.employees[0]?.indicators.find((item) => item.type === 'smart')
    if (storedSmart?.type !== 'smart') throw new Error('missing smart')
    storedSmart.tasks[0]!.comments = [{ id: 'c1', text: 'Первый', createdAt: '2026-10-09T00:00:00.000Z' }]
    stored.periods[0]!.employees = stored.employees

    const appended = structuredClone(stored)
    const appendedSmart = appended.employees[0]?.indicators.find((item) => item.type === 'smart')
    if (appendedSmart?.type !== 'smart') throw new Error('missing smart')
    appendedSmart.tasks[0]!.comments.push({ id: 'c2', text: 'Второй', createdAt: '2026-10-10T00:00:00.000Z' })
    appended.periods[0]!.employees = appended.employees
    const merged = asSaved(mergeUserTeam(stored, appended, new Set(['person']), employeeActor))
    const savedSmart = merged?.saved.employees[0]?.indicators.find((item) => item.type === 'smart')
    expect(savedSmart?.type === 'smart' ? savedSmart.tasks[0]?.comments.map((item) => item.text) : null).toEqual([
      'Первый',
      'Второй',
    ])

    const rewritten = structuredClone(stored)
    const rewrittenSmart = rewritten.employees[0]?.indicators.find((item) => item.type === 'smart')
    if (rewrittenSmart?.type !== 'smart') throw new Error('missing smart')
    rewrittenSmart.tasks[0]!.comments = [{ id: 'c1', text: 'Исправлено', createdAt: '2026-10-09T00:00:00.000Z' }]
    rewritten.periods[0]!.employees = rewritten.employees
    expect(mergeUserTeam(stored, rewritten, new Set(['person']), employeeActor)).toBeNull()
  })

  it('allows a comment on a new task and rejects edits to existing comments', () => {
    const created = structuredClone(team())
    const smart = created.employees[0]?.indicators.find((item) => item.type === 'smart')
    if (smart?.type !== 'smart') throw new Error('missing smart')
    smart.tasks.push({
      ...task('created', 'next'),
      comments: [{ id: 'c1', text: 'Уточнение', createdAt: '2026-10-09T00:00:00.000Z' }],
    })
    created.periods[0]!.employees = created.employees
    expect(userChangeAllowed(team(), created)).toBe(true)

    const commented = structuredClone(team())
    const existing = commented.employees[0]?.indicators.find((item) => item.type === 'smart')
    if (existing?.type !== 'smart') throw new Error('missing smart')
    existing.tasks[0]!.comments = [{ id: 'c1', text: 'Позже', createdAt: '2026-10-09T00:00:00.000Z' }]
    commented.periods[0]!.employees = commented.employees
    expect(userChangeAllowed(team(), commented)).toBe(true)
    existing.tasks[0]!.comments = []
    const withComment = structuredClone(commented)
    const base = structuredClone(team())
    const baseSmart = base.employees[0]?.indicators.find((item) => item.type === 'smart')
    if (baseSmart?.type !== 'smart') throw new Error('missing smart')
    baseSmart.tasks[0]!.comments = [{ id: 'c0', text: 'Было', createdAt: '2026-10-08T00:00:00.000Z' }]
    base.periods[0]!.employees = base.employees
    expect(userChangeAllowed(base, withComment)).toBe(false)
  })

  it('keeps hidden employees when a granted matrix changes', () => {
    const stored = team('in_progress')
    const hidden = structuredClone(stored.employees[0]!)
    hidden.id = 'hidden'
    hidden.name = 'Скрытый'
    stored.periods[0]!.employees = [...stored.employees, hidden]
    stored.employees = stored.periods[0]!.employees
    const allowed = new Set(['person'])
    const incoming = structuredClone(visibleTeam(stored, allowed))
    const smart = incoming.employees[0]?.indicators.find((item) => item.type === 'smart')
    if (smart?.type !== 'smart') throw new Error('missing smart')
    smart.tasks[0]!.status = 'done'
    incoming.periods[0]!.employees = incoming.employees
    const merged = asSaved(mergeUserTeam(stored, incoming, allowed, employeeActor))
    const savedPerson = merged?.saved.employees.find((item) => item.id === 'person')
    const savedHidden = merged?.saved.employees.find((item) => item.id === 'hidden')
    const personTask = savedPerson?.indicators.find((item) => item.type === 'smart')
    const hiddenTask = savedHidden?.indicators.find((item) => item.type === 'smart')
    expect(personTask?.type === 'smart' ? personTask.tasks[0]?.status : null).toBe('done')
    expect(hiddenTask?.type === 'smart' ? hiddenTask.tasks[0]?.status : null).toBe('in_progress')
    expect(merged?.view.employees.map((item) => item.id)).toEqual(['person'])
  })

  it('saves a new smart task when the client drops a manager outside the granted matrices', () => {
    const stored = team()
    const boss = structuredClone(stored.employees[0]!)
    boss.id = 'boss'
    boss.name = 'Руководитель'
    boss.managerId = null
    boss.indicators = []
    const person = stored.employees[0]!
    person.managerId = 'boss'
    stored.periods[0]!.employees = [boss, person]
    stored.employees = stored.periods[0]!.employees
    const allowed = new Set(['person'])
    const incoming = structuredClone(visibleTeam(stored, allowed))
    incoming.employees = sanitizeEmployees(incoming.employees)
    incoming.periods = incoming.periods.map((period) => ({
      ...period,
      employees: sanitizeEmployees(period.employees),
    }))
    const smart = incoming.employees[0]?.indicators.find((item) => item.type === 'smart')
    if (smart?.type !== 'smart') throw new Error('missing smart')
    smart.tasks.push({ ...task('created', 'fresh'), name: 'Новая задача' })
    incoming.periods[0]!.employees = incoming.employees
    expect(incoming.employees[0]?.managerId).toBe('boss')
    incoming.employees[0]!.managerId = null
    incoming.periods[0]!.employees = incoming.employees

    const merged = asSaved(mergeUserTeam(stored, incoming, allowed, employeeActor))
    const savedPerson = merged?.saved.employees.find((item) => item.id === 'person')
    const savedBoss = merged?.saved.employees.find((item) => item.id === 'boss')
    const savedSmart = savedPerson?.indicators.find((item) => item.type === 'smart')
    const viewSmart = merged?.view.employees
      .find((item) => item.id === 'person')
      ?.indicators.find((item) => item.type === 'smart')
    expect(savedPerson?.managerId).toBe('boss')
    expect(savedBoss?.name).toBe('Руководитель')
    expect(savedSmart?.type === 'smart' ? savedSmart.tasks.map((item) => item.id) : []).toEqual(['task', 'fresh'])
    expect(viewSmart?.type === 'smart' ? viewSmart.tasks.map((item) => item.name) : []).toContain('Новая задача')
  })

  it('does not let a user add a smart block or rewrite a standard', () => {
    const stored = team()
    const allowed = new Set(['person'])
    const block = structuredClone(visibleTeam(stored, allowed))
    block.employees[0]!.indicators.push({
      id: 'extra',
      type: 'smart',
      weight: 10,
      points: defaultSmartPoints(),
      tasks: [task('created', 'extra-task')],
    })
    block.periods[0]!.employees = block.employees
    expect(mergeUserTeam(stored, block, allowed, employeeActor)).toBeNull()

    const scored = structuredClone(visibleTeam(stored, allowed))
    const standard = scored.employees[0]?.indicators.find((item) => item.type === 'standard')
    if (standard?.type !== 'standard') throw new Error('missing standard')
    standard.score = 2
    scored.periods[0]!.employees = scored.employees
    const merged = asSaved(mergeUserTeam(stored, scored, allowed, employeeActor))
    const saved = merged?.saved.employees[0]?.indicators.find((item) => item.type === 'standard')
    expect(saved?.type === 'standard' ? saved.score : null).toBe(0)
  })

  it('lets the employee mark in-progress work done and rejects the other transitions', () => {
    const started = team('in_progress')
    const done = structuredClone(visibleTeam(started, new Set(['person'])))
    const smart = done.employees[0]?.indicators.find((item) => item.type === 'smart')
    if (smart?.type !== 'smart') throw new Error('missing smart')
    smart.tasks[0]!.status = 'done'
    done.periods[0]!.employees = done.employees
    const merged = mergeUserTeam(started, done, new Set(['person']), employeeActor)
    const saved = merged && 'saved' in merged ? merged.saved : null
    const savedSmart = saved?.employees[0]?.indicators.find((item) => item.type === 'smart')
    expect(savedSmart?.type === 'smart' ? savedSmart.tasks[0]?.status : null).toBe('done')

    const created = team()
    const jumped = structuredClone(visibleTeam(created, new Set(['person'])))
    const createdSmart = jumped.employees[0]?.indicators.find((item) => item.type === 'smart')
    if (createdSmart?.type !== 'smart') throw new Error('missing smart')
    createdSmart.tasks[0]!.status = 'in_progress'
    jumped.periods[0]!.employees = jumped.employees
    const rejected = mergeUserTeam(created, jumped, new Set(['person']), employeeActor)
    expect(rejected && 'error' in rejected ? rejected.error : '').toBe(
      'В статус «В работе» смарт переводит руководитель или администратор.',
    )

    const finished = team('done')
    const closed = structuredClone(visibleTeam(finished, new Set(['person'])))
    const doneSmart = closed.employees[0]?.indicators.find((item) => item.type === 'smart')
    if (doneSmart?.type !== 'smart') throw new Error('missing smart')
    doneSmart.tasks[0]!.status = 'closed'
    closed.periods[0]!.employees = closed.employees
    const closeRejected = mergeUserTeam(finished, closed, new Set(['person']), employeeActor)
    expect(closeRejected && 'error' in closeRejected ? closeRejected.error : '').toBe(
      'Статус «Закрыт» ставит только руководитель сотрудника.',
    )
  })

  it('lets the direct manager start, create and close a subordinate task', () => {
    const stored = team()
    const person = stored.employees[0]!
    person.managerId = 'boss'
    stored.periods[0]!.employees = [person]
    stored.employees = [person]
    const manager: SmartActor = { role: 'user', employeeId: 'boss' }
    const allowed = new Set(['person'])
    const started = structuredClone(visibleTeam(stored, allowed))
    const smart = started.employees[0]?.indicators.find((item) => item.type === 'smart')
    if (smart?.type !== 'smart') throw new Error('missing smart')
    smart.tasks[0]!.status = 'in_progress'
    smart.tasks.push({ ...task('in_progress', 'assigned'), name: 'От руководителя' })
    started.periods[0]!.employees = started.employees
    const merged = mergeUserTeam(stored, started, allowed, manager)
    const savedSmart = merged && 'saved' in merged ? merged.saved.employees[0]?.indicators.find((item) => item.type === 'smart') : null
    expect(savedSmart?.type === 'smart' ? savedSmart.tasks.map((item) => item.status) : []).toEqual(['in_progress', 'in_progress'])

    const withDone = structuredClone(merged && 'saved' in merged ? merged.saved : stored)
    const doneSmart = withDone.employees[0]?.indicators.find((item) => item.type === 'smart')
    if (doneSmart?.type !== 'smart') throw new Error('missing smart')
    doneSmart.tasks[0]!.status = 'done'
    withDone.periods[0]!.employees = withDone.employees
    const closed = structuredClone(withDone)
    const closing = closed.employees[0]?.indicators.find((item) => item.type === 'smart')
    if (closing?.type !== 'smart') throw new Error('missing smart')
    closing.tasks[0]!.status = 'closed'
    closed.periods[0]!.employees = closed.employees
    const confirmed = mergeUserTeam(withDone, closed, allowed, manager)
    const confirmedSmart = confirmed && 'saved' in confirmed ? confirmed.saved.employees[0]?.indicators.find((item) => item.type === 'smart') : null
    expect(confirmedSmart?.type === 'smart' ? confirmedSmart.tasks[0]?.status : null).toBe('closed')
  })
})
