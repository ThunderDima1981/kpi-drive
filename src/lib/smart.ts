import type { Indicator, SmartComment, SmartIndicator, SmartStatus, SmartTask } from '../types.ts'

export const SMART_STATUSES: SmartStatus[] = ['created', 'in_progress', 'done', 'closed']

export const SMART_STATUS_LABEL: Record<SmartStatus, string> = {
  created: 'Создан',
  in_progress: 'В работе',
  done: 'Выполнено',
  closed: 'Закрыт',
}

export function isSmartStatus(value: unknown): value is SmartStatus {
  return value === 'created' || value === 'in_progress' || value === 'done' || value === 'closed'
}

export function smartCompletion(status: SmartStatus) {
  return status === 'closed' ? 100 : 0
}

export function smartGroupCompletion(indicator: SmartIndicator) {
  return indicator.tasks.reduce((sum, task) => sum + (smartCompletion(task.status) * task.weight) / 100, 0)
}

export function normalizeIndicator(indicator: Indicator): Indicator {
  if (indicator.type !== 'smart') return indicator
  return normalizeSmart(indicator)
}

export function collapseSmartIndicators(indicators: Indicator[]): Indicator[] {
  const smarts = indicators.filter((item): item is SmartIndicator => item.type === 'smart')
  if (smarts.length <= 1) return indicators
  const total = smarts.reduce((sum, item) => sum + item.weight, 0)
  const tasks = smarts.flatMap((group) =>
    group.tasks.map((task) => ({
      ...task,
      weight: total > 0 ? (task.weight * group.weight) / total : 0,
    })),
  )
  const merged: SmartIndicator = {
    id: smarts[0]!.id,
    type: 'smart',
    weight: total,
    tasks,
  }
  const result: Indicator[] = []
  let placed = false
  for (const indicator of indicators) {
    if (indicator.type !== 'smart') {
      result.push(indicator)
      continue
    }
    if (!placed) {
      result.push(merged)
      placed = true
    }
  }
  return result
}

function normalizeSmart(raw: SmartIndicator): SmartIndicator {
  const legacy = raw as SmartIndicator & {
    name?: unknown
    detail?: unknown
    criterion?: unknown
    status?: unknown
    progress?: unknown
    comments?: unknown
    tasks?: unknown
  }
  const id = typeof legacy.id === 'string' && legacy.id ? legacy.id : crypto.randomUUID()
  if (Array.isArray(legacy.tasks)) {
    return {
      id,
      type: 'smart',
      weight: finite(legacy.weight),
      tasks: legacy.tasks.flatMap((task) => {
        const normalized = normalizeTask(task)
        return normalized ? [normalized] : []
      }),
    }
  }
  const task = normalizeTask({
    id: `${id}-task`,
    name: legacy.name,
    weight: 100,
    detail: legacy.detail,
    criterion: legacy.criterion,
    status: legacy.status,
    progress: legacy.progress,
    comments: legacy.comments,
  })
  return {
    id,
    type: 'smart',
    weight: finite(legacy.weight),
    tasks: task ? [task] : [],
  }
}

function normalizeTask(raw: unknown): SmartTask | null {
  if (!raw || typeof raw !== 'object') return null
  const task = raw as Partial<SmartTask> & { progress?: unknown }
  return {
    id: typeof task.id === 'string' && task.id ? task.id : crypto.randomUUID(),
    name: typeof task.name === 'string' ? task.name : '',
    weight: finite(task.weight),
    detail: typeof task.detail === 'string' ? task.detail : '',
    criterion: typeof task.criterion === 'string' ? task.criterion : '',
    status: statusFromLegacy(task.status, task.progress),
    comments: normalizeComments(task.comments),
  }
}

function finite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function statusFromLegacy(status: unknown, progress: unknown): SmartStatus {
  if (isSmartStatus(status)) return status
  if (typeof progress === 'number' && progress >= 100) return 'closed'
  if (typeof progress === 'number' && progress > 0) return 'in_progress'
  return 'created'
}

function normalizeComments(value: unknown): SmartComment[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const comment = item as Partial<SmartComment>
    if (typeof comment.text !== 'string' || comment.text.trim() === '') return []
    return [
      {
        id: typeof comment.id === 'string' && comment.id ? comment.id : crypto.randomUUID(),
        text: comment.text.trim(),
        createdAt: typeof comment.createdAt === 'string' ? comment.createdAt : new Date().toISOString(),
      },
    ]
  })
}

export function formatCommentDate(createdAt: string) {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
