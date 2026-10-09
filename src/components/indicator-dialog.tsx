import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { defaultStandardPoints } from '../lib/calc.ts'
import { formatPercent, parseNumber } from '../lib/format.ts'
import { formatCommentDate, SMART_STATUS_LABEL, SMART_STATUSES } from '../lib/smart.ts'
import { useTeamStore } from '../store/team-store.ts'
import type { Indicator, IndicatorType, SmartComment, SmartStatus, StandardScore } from '../types.ts'

function dialogTitle(initial: Indicator | null, defaultType: IndicatorType) {
  const type = initial?.type ?? defaultType
  if (type === 'smart') return initial ? 'Smart-задача' : 'Новая smart-задача'
  if (type === 'kpi') return 'Вес в матрице'
  return initial ? 'Стандарт' : 'Новый стандарт'
}

const SCORES: StandardScore[] = [-2, -1, 0, 1, 2]

interface Draft {
  type: IndicatorType
  name: string
  weight: string
  detail: string
  criterion: string
  status: SmartStatus
  comments: SmartComment[]
  score: number
  evaluatorId: string
}

function emptyDraft(type: IndicatorType): Draft {
  return {
    type,
    name: '',
    weight: '',
    detail: '',
    criterion: '',
    status: 'created',
    comments: [],
    score: 0,
    evaluatorId: '',
  }
}

function draftFrom(indicator: Indicator): Draft {
  if (indicator.type === 'kpi') return { ...emptyDraft('kpi'), weight: String(indicator.weight) }
  if (indicator.type === 'smart') {
    return {
      ...emptyDraft('smart'),
      name: indicator.name,
      weight: String(indicator.weight),
      detail: indicator.detail,
      criterion: indicator.criterion,
      status: indicator.status,
      comments: indicator.comments,
    }
  }
  return {
    ...emptyDraft('standard'),
    name: indicator.name,
    weight: String(indicator.weight),
    score: indicator.score,
    evaluatorId: indicator.evaluatorId ?? '',
  }
}

export function IndicatorDialog({
  employeeId,
  initial,
  defaultType,
  onOpenChange,
}: {
  employeeId: string
  initial: Indicator | null
  defaultType: IndicatorType
  onOpenChange: (open: boolean) => void
}) {
  const employees = useTeamStore((state) => state.employees)
  const addIndicator = useTeamStore((state) => state.addIndicator)
  const updateIndicator = useTeamStore((state) => state.updateIndicator)
  const removeIndicator = useTeamStore((state) => state.removeIndicator)
  const addComment = useTeamStore((state) => state.addComment)
  const [draft, setDraft] = useState<Draft>(() => {
    const next = initial ? draftFrom(initial) : emptyDraft(defaultType)
    if (!initial && defaultType === 'standard' && !next.evaluatorId) {
      const owner = useTeamStore.getState().employees.find((item) => item.id === employeeId)
      next.evaluatorId = owner?.managerId ?? ''
    }
    return next
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [commentText, setCommentText] = useState('')
  const [commentError, setCommentError] = useState('')

  const indicatorType = initial?.type ?? defaultType
  const employee = employees.find((item) => item.id === employeeId)
  const parsedWeight = parseNumber(draft.weight)
  const otherWeight =
    employee?.indicators
      .filter((indicator) => indicator.id !== initial?.id)
      .reduce((sum, indicator) => sum + indicator.weight, 0) ?? 0
  const nextWeightSum = otherWeight + (parsedWeight ?? 0)

  function save(event: React.FormEvent) {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    const name = draft.name.trim()
    const weight = parseNumber(draft.weight)
    if (!name) nextErrors.name = 'Введите название.'
    if (weight === null || weight <= 0 || weight > 100) {
      nextErrors.weight = 'Вес — число больше 0 и не больше 100.'
    }

    let indicator: Indicator | null = null
    if (indicatorType === 'smart' && weight !== null) {
      indicator = {
        id: initial?.id ?? crypto.randomUUID(),
        type: 'smart',
        name,
        weight,
        detail: draft.detail.trim(),
        criterion: draft.criterion.trim(),
        status: initial ? draft.status : 'created',
        comments: draft.comments,
      }
    } else if (indicatorType === 'standard' && weight !== null) {
      const evaluatorId = employees.some((item) => item.id === draft.evaluatorId) ? draft.evaluatorId : ''
      if (!evaluatorId) nextErrors.evaluator = 'Выберите оценщика из сотрудников.'
      else {
        indicator = {
          id: initial?.id ?? crypto.randomUUID(),
          type: 'standard',
          name,
          weight,
          score: draft.score,
          evaluatorId,
          points: initial?.type === 'standard' ? initial.points : defaultStandardPoints(),
        }
      }
    }

    if (!name || weight === null || weight <= 0 || weight > 100) indicator = null
    if (Object.keys(nextErrors).length > 0 || !indicator) {
      setErrors(nextErrors)
      return
    }
    if (initial) updateIndicator(employeeId, indicator)
    else addIndicator(employeeId, indicator)
    onOpenChange(false)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        <form className="flex max-h-[min(92vh,860px)] min-h-0 flex-col" onSubmit={save}>
          <DialogHeader className="px-4 pt-4 pr-12">
            <DialogTitle>{dialogTitle(initial, defaultType)}</DialogTitle>
            <DialogDescription>
              Вес входит в сумму 100%. КР считается как выполнение, умноженное на вес.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 pb-4">
            <Field label="Название" error={errors.name}>
              <Input
                value={draft.name}
                aria-invalid={Boolean(errors.name)}
                onValueChange={(name) => setDraft((current) => ({ ...current, name }))}
              />
            </Field>
            <Field label="Вес, %" error={errors.weight}>
              <Input
                inputMode="decimal"
                value={draft.weight}
                aria-invalid={Boolean(errors.weight)}
                onValueChange={(weight) => setDraft((current) => ({ ...current, weight }))}
              />
              <p className={cn('text-xs', Math.abs(nextWeightSum - 100) < 0.05 ? 'text-zone-green' : 'text-zone-amber')}>
                После сохранения сумма весов матрицы будет {formatPercent(nextWeightSum)}.
              </p>
            </Field>

            {indicatorType === 'smart' ? (
              <SmartFields
                draft={draft}
                statusEditable={Boolean(initial)}
                commentText={commentText}
                commentError={commentError}
                onDraft={setDraft}
                onCommentText={(value) => {
                  setCommentText(value)
                  if (commentError) setCommentError('')
                }}
                onAddComment={() => {
                  const text = commentText.trim()
                  if (!text) {
                    setCommentError('Напишите текст комментария.')
                    return
                  }
                  const comment: SmartComment = {
                    id: crypto.randomUUID(),
                    text,
                    createdAt: new Date().toISOString(),
                  }
                  setDraft((current) => ({ ...current, comments: [...current.comments, comment] }))
                  if (initial?.type === 'smart') addComment(employeeId, initial.id, comment)
                  setCommentText('')
                  setCommentError('')
                }}
              />
            ) : null}

            {indicatorType === 'standard' ? (
              <div className="grid gap-4">
                <Field label="Оценщик" error={errors.evaluator}>
                  <select
                    aria-label="Оценщик стандарта"
                    value={draft.evaluatorId}
                    onChange={(event) => setDraft((current) => ({ ...current, evaluatorId: event.target.value }))}
                    className="h-9 w-full rounded-lg border border-input bg-white px-2 text-sm"
                  >
                    <option value="">Выберите сотрудника</option>
                    {employees
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
                      .map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-ink-soft">Сотрудник, который ставит оценку по этому стандарту.</p>
                </Field>
                <div>
                <p className="mb-2 text-sm font-medium">Текущая оценка</p>
                <select
                  aria-label="Текущая оценка стандарта"
                  value={String(draft.score)}
                  onChange={(event) => setDraft((current) => ({ ...current, score: Number(event.target.value) }))}
                  className="h-9 w-full rounded-lg border border-input bg-white px-2 text-sm"
                >
                  {(initial?.type === 'standard' ? initial.points : defaultStandardPoints())
                    .slice()
                    .sort((a, b) => a.score - b.score)
                    .map((point) => (
                      <option key={point.id} value={point.score}>
                        {point.score > 0 ? `+${point.score}` : point.score} · {formatPercent(point.completion)}
                      </option>
                    ))}
                </select>
                <p className="mt-2 text-xs text-ink-soft">Точки шкалы и их проценты выполнения меняются на графике.</p>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="mx-0 mt-0 mb-0 shrink-0 sm:justify-between">
            {initial ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  removeIndicator(employeeId, initial.id)
                  onOpenChange(false)
                }}
              >
                Удалить
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <DialogClose render={<Button variant="outline" type="button" />}>Отмена</DialogClose>
              <Button type="submit">Сохранить</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <Label className="grid items-start gap-1.5 font-medium">
      <span>{label}</span>
      {children}
      {error ? <span className="text-xs font-normal text-destructive">{error}</span> : null}
    </Label>
  )
}

function SmartFields({
  draft,
  statusEditable,
  commentText,
  commentError,
  onDraft,
  onCommentText,
  onAddComment,
}: {
  draft: Draft
  statusEditable: boolean
  commentText: string
  commentError: string
  onDraft: (update: (current: Draft) => Draft) => void
  onCommentText: (value: string) => void
  onAddComment: () => void
}) {
  return (
    <>
      <Field label="Подробный комментарий">
        <TextArea
          value={draft.detail}
          aria-label="Подробный комментарий"
          onChange={(event) => onDraft((current) => ({ ...current, detail: event.target.value }))}
        />
      </Field>
      <Field label="Критерий оценки">
        <TextArea
          value={draft.criterion}
          aria-label="Критерий оценки"
          onChange={(event) => onDraft((current) => ({ ...current, criterion: event.target.value }))}
        />
      </Field>
      <div>
        <p className="mb-2 text-sm font-medium">Статус</p>
        {statusEditable ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Статус smart-задачи">
            {SMART_STATUSES.map((status) => {
              const selected = draft.status === status
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onDraft((current) => ({ ...current, status }))}
                  className={cn(
                    'h-9 rounded-lg border px-2 text-sm font-medium',
                    selected ? 'border-pine bg-pine text-primary-foreground' : 'border-line hover:bg-muted',
                  )}
                >
                  {SMART_STATUS_LABEL[status]}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-sm">Создан</p>
        )}
        <p className="mt-2 text-xs text-ink-soft">
          {statusEditable
            ? 'Закрыт — 100% выполнения. Создан, в работе и выполнено — 0%.'
            : 'Новая задача сразу получает статус «Создан».'}
        </p>
      </div>
      <div className="rounded-xl border border-line px-3 py-3">
        <p className="text-sm font-medium">Комментарии</p>
        {draft.comments.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">Комментариев пока нет.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {draft.comments.map((comment) => (
              <li key={comment.id} className="rounded-lg bg-muted px-3 py-2">
                <p className="text-xs text-ink-soft">{formatCommentDate(comment.createdAt)}</p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{comment.text}</p>
              </li>
            ))}
          </ul>
        )}
        <label className="mt-3 grid gap-1.5 text-sm font-medium">
          Новый комментарий
          <TextArea
            value={commentText}
            aria-label="Новый комментарий"
            aria-invalid={Boolean(commentError)}
            className="min-h-16"
            onChange={(event) => onCommentText(event.target.value)}
          />
        </label>
        {commentError ? <p className="mt-1 text-xs text-destructive">{commentError}</p> : null}
        <Button type="button" variant="outline" className="mt-2" onClick={onAddComment}>
          Добавить комментарий
        </Button>
      </div>
    </>
  )
}

function TextArea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
      {...props}
    />
  )
}

export function ScorePicker({
  value,
  onChange,
}: {
  value: StandardScore
  onChange: (score: StandardScore) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-white p-0.5" role="group" aria-label="Оценка стандарта">
      {SCORES.map((score) => {
        const selected = score === value
        return (
          <button
            key={score}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(score)}
            className={cn(
              'h-8 min-w-9 rounded-md px-2 text-sm font-semibold tabular-nums',
              selected ? 'bg-ink text-white' : 'text-ink-soft hover:bg-muted',
            )}
          >
            {score > 0 ? `+${score}` : score}
          </button>
        )
      })}
    </div>
  )
}
