import { mergeDetails } from '../src/lib/audit.ts'
import { pool } from './db.ts'

export type AuditActor = { id: string | null; name: string }

export type AuditEntry = {
  id: string
  userName: string
  action: string
  details: string[]
  createdAt: string
  updatedAt: string
}

const COALESCE_MINUTES = 5

export async function recordAudit(actor: AuditActor, action: string, details: string[] = [], key = '') {
  try {
    if (key && actor.id) {
      const recent = await pool.query<{ id: string; details: unknown }>(
        `SELECT id, details FROM audit_log
         WHERE user_id = $1 AND entry_key = $2 AND action = $3
           AND updated_at > now() - make_interval(mins => $4)
         ORDER BY updated_at DESC LIMIT 1`,
        [actor.id, key, action, COALESCE_MINUTES],
      )
      const row = recent.rows[0]
      if (row) {
        const merged = mergeDetails(textList(row.details), details)
        await pool.query('UPDATE audit_log SET details = $2::jsonb, updated_at = now() WHERE id = $1', [
          row.id,
          JSON.stringify(merged),
        ])
        return
      }
    }
    await pool.query(
      'INSERT INTO audit_log (user_id, user_name, action, details, entry_key) VALUES ($1, $2, $3, $4::jsonb, $5)',
      [actor.id, actor.name, action, JSON.stringify(mergeDetails([], details)), key],
    )
  } catch (error) {
    console.error(error)
  }
}

export async function listAudit(limit: number, before: string | null) {
  const found = await pool.query<{
    id: string
    user_name: string
    action: string
    details: unknown
    created_at: Date
    updated_at: Date
  }>(
    `SELECT id::text, user_name, action, details, created_at, updated_at FROM audit_log
     WHERE $1::bigint IS NULL OR id < $1::bigint
     ORDER BY id DESC LIMIT $2`,
    [before, limit + 1],
  )
  const rows = found.rows.slice(0, limit)
  const entries: AuditEntry[] = rows.map((row) => ({
    id: row.id,
    userName: row.user_name,
    action: row.action,
    details: textList(row.details),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }))
  return { entries, more: found.rows.length > limit }
}

function textList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}
