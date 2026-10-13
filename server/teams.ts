import type { PoolClient } from 'pg'
import type { TeamData } from '../src/types.ts'
import { pool } from './db.ts'

export type StoredTeam = { document: TeamData; revision: number; updatedBy: string }

export const REVISION_HEADER = 'x-team-revision'

export async function loadTeamDocument(ownerId: string) {
  return readTeam(pool, ownerId, false)
}

export async function withTeamLock<T>(
  ownerId: string,
  work: (stored: StoredTeam | null, save: (document: TeamData, updatedBy: string) => Promise<number>) => Promise<T>,
) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const stored = await readTeam(client, ownerId, true)
    const result = await work(stored, async (document, updatedBy) => {
      if (stored && sameJson(stored.document, document)) return stored.revision
      return writeTeam(client, ownerId, document, updatedBy)
    })
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function readTeam(client: Pick<PoolClient, 'query'>, ownerId: string, lock: boolean): Promise<StoredTeam | null> {
  const found = await client.query<{ document: TeamData; revision: string; updated_by_name: string }>(
    `SELECT document, revision::text, updated_by_name FROM teams WHERE user_id = $1${lock ? ' FOR UPDATE' : ''}`,
    [ownerId],
  )
  const row = found.rows[0]
  return row ? { document: row.document, revision: Number(row.revision), updatedBy: row.updated_by_name } : null
}

async function writeTeam(client: Pick<PoolClient, 'query'>, ownerId: string, document: TeamData, updatedBy: string) {
  const saved = await client.query<{ revision: string }>(
    `INSERT INTO teams (user_id, document, updated_at, revision, updated_by_name)
     VALUES ($1, $2::jsonb, now(), 1, $3)
     ON CONFLICT (user_id) DO UPDATE
     SET document = EXCLUDED.document, updated_at = now(),
         revision = teams.revision + 1, updated_by_name = EXCLUDED.updated_by_name
     RETURNING revision::text`,
    [ownerId, JSON.stringify(document), updatedBy],
  )
  return Number(saved.rows[0]?.revision ?? 0)
}

export function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => sameJson(item, right[index]))
  }
  const a = Object.entries(left).filter(([, value]) => value !== undefined)
  const b = new Map(Object.entries(right).filter(([, value]) => value !== undefined))
  return a.length === b.size && a.every(([key, value]) => b.has(key) && sameJson(value, b.get(key)))
}
