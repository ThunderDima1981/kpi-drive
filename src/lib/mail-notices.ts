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

export function smartLetters(before: TeamData, after: TeamData, actor: SmartActor): MailLetter[] {
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
    if (actor.employeeId !== item.employeeId) continue
    letters.push(createdForEmployee(item), ...createdForManager(item))
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

function createdForEmployee(item: LocatedTask): MailLetter {
  const period = formatPeriod(item.periodId)
  return {
    toEmployeeId: item.employeeId,
    subject: `Вы создали smart-задачу «${item.task.name}»`,
    text: `Вы создали задачу «${item.task.name}» в матрице за ${period}. Статус: ${SMART_STATUS_LABEL.created}.`,
  }
}

function createdForManager(item: LocatedTask): MailLetter[] {
  if (!item.managerId) return []
  const period = formatPeriod(item.periodId)
  return [
    {
      toEmployeeId: item.managerId,
      subject: `Сотрудник создал smart-задачу «${item.task.name}»`,
      text: `${item.employeeName} создал задачу «${item.task.name}» за ${period}. Статус: ${SMART_STATUS_LABEL.created}.`,
    },
  ]
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
    text: `${item.managerName} закрыл задачу «${item.task.name}» за ${period}. Статус: ${SMART_STATUS_LABEL.closed}.`,
  }
}
