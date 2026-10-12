import { formatPeriod, nextPeriodId } from './period.ts'
import { SMART_STATUS_LABEL } from './smart.ts'
import type { SmartActor } from './smart-access.ts'
import type { SmartStatus, SmartTask, TeamData } from '../types.ts'

export type MailLetter = {
  toEmployeeId: string
  subject: string
  text: string
}

type LocatedTask = {
  periodId: string
  employeeId: string
  employeeName: string
  managerId: string | null
  managerName: string
  task: SmartTask
}

export function smartLetters(before: TeamData, after: TeamData, actor: SmartActor & { name?: string }): MailLetter[] {
  const beforeTasks = collectTasks(before)
  const afterTasks = collectTasks(after)
  const beforeById = new Map(beforeTasks.map((item) => [item.task.id, item]))
  const afterIds = new Set(afterTasks.map((item) => item.task.id))
  const removed = beforeTasks.filter((item) => !afterIds.has(item.task.id))
  const added = afterTasks.filter((item) => !beforeById.has(item.task.id))
  const moved = new Set<string>()
  for (const gone of removed) {
    const match = added.find((item) => !moved.has(item.task.id) && isMove(gone, item))
    if (match) moved.add(match.task.id)
  }

  const letters: MailLetter[] = []
  for (const item of added) {
    if (moved.has(item.task.id)) continue
    letters.push(...creationLetters(item, actor, creatorName(after, actor)))
  }
  for (const item of afterTasks) {
    const prior = beforeById.get(item.task.id)
    if (!prior || prior.task.status === item.task.status) continue
    letters.push(...statusForManager(item, prior.task.status))
    if (item.task.status === 'closed' && actor.employeeId && actor.employeeId === item.managerId) {
      letters.push(closedForEmployee(item))
    }
  }
  return letters
}

function collectTasks(team: TeamData): LocatedTask[] {
  const found: LocatedTask[] = []
  for (const period of team.periods) {
    const names = new Map(period.employees.map((employee) => [employee.id, employee.name]))
    for (const employee of period.employees) {
      for (const indicator of employee.indicators) {
        if (indicator.type !== 'smart') continue
        for (const task of indicator.tasks) {
          found.push({
            periodId: period.id,
            employeeId: employee.id,
            employeeName: employee.name,
            managerId: employee.managerId,
            managerName: employee.managerId ? (names.get(employee.managerId) ?? 'Руководитель') : 'Руководитель',
            task,
          })
        }
      }
    }
  }
  return found
}

function isMove(gone: LocatedTask, added: LocatedTask) {
  return (
    gone.employeeId === added.employeeId &&
    nextPeriodId(gone.periodId) === added.periodId &&
    gone.task.name === added.task.name &&
    gone.task.weight === added.task.weight &&
    gone.task.detail === added.task.detail &&
    gone.task.criterion === added.task.criterion &&
    gone.task.status === added.task.status &&
    commentText(gone.task) === commentText(added.task)
  )
}

function commentText(task: SmartTask) {
  return task.comments.map((comment) => `${comment.text}\n${comment.createdAt}`).join('\n')
}

function creatorName(team: TeamData, actor: SmartActor & { name?: string }) {
  if (actor.employeeId) {
    for (const period of team.periods) {
      const person = period.employees.find((employee) => employee.id === actor.employeeId)
      if (person?.name.trim()) return person.name.trim()
    }
  }
  return actor.name?.trim() || 'Руководитель'
}

function creationLetters(item: LocatedTask, actor: SmartActor, creator: string): MailLetter[] {
  const period = formatPeriod(item.periodId)
  const status = SMART_STATUS_LABEL[item.task.status]
  const name = item.task.name
  const self = actor.employeeId === item.employeeId
  const letters: MailLetter[] = [
    self
      ? {
          toEmployeeId: item.employeeId,
          subject: `Вы создали smart-задачу «${name}»`,
          text: `Вы создали задачу «${name}» в матрице за ${period}. Статус: ${status}.`,
        }
      : {
          toEmployeeId: item.employeeId,
          subject: `Вам создали smart-задачу «${name}»`,
          text: `Вам создана smart-задача «${name}» в матрице за ${period}. Создал: ${creator}. Статус: ${status}.`,
        },
  ]
  const others = new Set<string>()
  if (item.managerId && item.managerId !== item.employeeId) others.add(item.managerId)
  if (actor.employeeId && actor.employeeId !== item.employeeId) others.add(actor.employeeId)
  for (const id of others) {
    const own = id === actor.employeeId
    letters.push(
      own
        ? {
            toEmployeeId: id,
            subject: `Вы создали smart-задачу «${name}» сотруднику ${item.employeeName}`,
            text: `Вы создали задачу «${name}» сотруднику ${item.employeeName} за ${period}. Статус: ${status}.`,
          }
        : {
            toEmployeeId: id,
            subject: `Сотруднику ${item.employeeName} создана smart-задача «${name}»`,
            text: `Сотруднику ${item.employeeName} создана задача «${name}» за ${period}. Статус: ${status}.`,
          },
    )
  }
  return letters
}

function statusForManager(item: LocatedTask, from: SmartStatus): MailLetter[] {
  if (!item.managerId) return []
  const period = formatPeriod(item.periodId)
  return [
    {
      toEmployeeId: item.managerId,
      subject: `Изменился статус smart-задачи «${item.task.name}»`,
      text: `Задача «${item.task.name}» сотрудника ${item.employeeName} за ${period}: ${SMART_STATUS_LABEL[from]} → ${SMART_STATUS_LABEL[item.task.status]}.`,
    },
  ]
}

function closedForEmployee(item: LocatedTask): MailLetter {
  const period = formatPeriod(item.periodId)
  return {
    toEmployeeId: item.employeeId,
    subject: `Руководитель закрыл smart-задачу «${item.task.name}»`,
    text: `Задача «${item.task.name}» за ${period} закрыта руководителем ${item.managerName}. Статус: ${SMART_STATUS_LABEL.closed}.`,
  }
}
