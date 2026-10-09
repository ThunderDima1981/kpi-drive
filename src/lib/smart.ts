import type { Indicator, SmartComment, SmartIndicator, SmartStatus } from '../types.ts'

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

export function normalizeIndicator(indicator: Indicator): Indicator {
  if (indicator.type !== 'smart') return indicator
  const legacy = indicator as SmartIndicator & { progress?: number }
  return {
    id: legacy.id,
    type: 'smart',
    name: typeof legacy.name === 'string' ? legacy.name : '',
    weight: Number.isFinite(legacy.weight) ? legacy.weight : 0,
    detail: typeof legacy.detail === 'string' ? legacy.detail : '',
    criterion: typeof legacy.criterion === 'string' ? legacy.criterion : '',
    status: statusFromLegacy(legacy.status, legacy.progress),
    comments: normalizeComments(legacy.comments),
  }
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
