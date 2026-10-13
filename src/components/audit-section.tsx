import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError, api } from '../lib/api.ts'

type AuditEntry = {
  id: string
  userName: string
  action: string
  details: string[]
  createdAt: string
  updatedAt: string
}

type AuditPage = { entries: AuditEntry[]; more: boolean }

const PAGE = 50
const SHORT = 4
const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

export function AuditSection() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  const load = useCallback(async (before?: string) => {
    const params = new URLSearchParams({ limit: String(PAGE) })
    if (before) params.set('before', before)
    return api<AuditPage>(`/api/audit?${params}`)
  }, [])

  const refresh = useCallback(() => {
    setLoading(true)
    setError('')
    void load()
      .then((page) => {
        setEntries(page.entries)
        setMore(page.more)
      })
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : 'Не удалось загрузить журнал.'))
      .finally(() => setLoading(false))
  }, [load])

  useEffect(() => {
    let cancelled = false
    void load()
      .then((page) => {
        if (cancelled) return
        setEntries(page.entries)
        setMore(page.more)
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof ApiError ? reason.message : 'Не удалось загрузить журнал.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [load])

  async function loadMore() {
    const last = entries.at(-1)
    if (!last) return
    setLoadingMore(true)
    try {
      const page = await load(last.id)
      setEntries((items) => [...items, ...page.entries])
      setMore(page.more)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось загрузить журнал.')
    } finally {
      setLoadingMore(false)
    }
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru')
    if (!needle) return entries
    return entries.filter((entry) =>
      [entry.userName, entry.action, ...entry.details].some((text) => text.toLocaleLowerCase('ru').includes(needle)),
    )
  }, [entries, query])

  const days = useMemo(() => {
    const groups: { day: string; items: AuditEntry[] }[] = []
    for (const entry of visible) {
      const day = dayFormat.format(new Date(entry.updatedAt))
      const group = groups.at(-1)
      if (group?.day === day) group.items.push(entry)
      else groups.push({ day, items: [entry] })
    }
    return groups
  }, [visible])

  return (
    <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">История изменений</h2>
          <p className="mt-1 max-w-xl text-sm text-ink-soft">
            Видят только администраторы. Правки одного человека за 5 минут собираются в одну запись.
          </p>
        </div>
        <Button type="button" variant="outline" disabled={loading} onClick={refresh}>
          <RefreshCw className={loading ? 'animate-spin' : undefined} />
          Обновить
        </Button>
      </div>
      <Input
        className="mt-4"
        value={query}
        placeholder="Поиск по имени, действию или сотруднику"
        aria-label="Поиск по журналу"
        onValueChange={setQuery}
      />
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {loading && entries.length === 0 ? (
        <p role="status" className="mt-4 text-sm text-ink-soft">
          Загружаем журнал…
        </p>
      ) : entries.length === 0 && !error ? (
        <p className="mt-4 text-sm text-ink-soft">
          Записей пока нет. Здесь появятся правки матриц, показателей, пользователей и настроек.
        </p>
      ) : visible.length === 0 && query ? (
        <p className="mt-4 text-sm text-ink-soft">В загруженных записях ничего не нашли.</p>
      ) : (
        <div className="mt-4 grid gap-5">
          {days.map((group) => (
            <div key={group.day}>
              <p className="text-xs font-semibold tracking-wide text-ink-soft uppercase">{group.day}</p>
              <ol className="mt-2 grid gap-2">
                {group.items.map((entry) => (
                  <AuditRow key={entry.id} entry={entry} />
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
      {more ? (
        <Button type="button" variant="outline" className="mt-4" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? 'Загружаем…' : 'Показать ещё'}
        </Button>
      ) : null}
    </section>
  )
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false)
  const started = timeFormat.format(new Date(entry.createdAt))
  const finished = timeFormat.format(new Date(entry.updatedAt))
  const shown = open ? entry.details : entry.details.slice(0, SHORT)
  const hidden = entry.details.length - shown.length
  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm">
          <span className="font-medium">{entry.userName || 'Система'}</span>
          <span className="text-ink-soft"> · {entry.action}</span>
        </p>
        <p className="text-xs text-ink-soft tabular-nums">{started === finished ? started : `${started}–${finished}`}</p>
      </div>
      {shown.length > 0 ? (
        <ul className="mt-2 grid gap-1 text-sm text-ink-soft">
          {shown.map((line, index) => (
            <li key={`${index}-${line}`} className="break-words">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      {hidden > 0 || (open && entry.details.length > SHORT) ? (
        <button type="button" className="mt-2 text-sm font-medium text-pine" onClick={() => setOpen((value) => !value)}>
          {open ? 'Свернуть' : `Ещё ${hidden}`}
        </button>
      ) : null}
    </li>
  )
}
