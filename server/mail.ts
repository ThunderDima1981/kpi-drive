import nodemailer from 'nodemailer'
import { smartLetters, type MailLetter } from '../src/lib/mail-notices.ts'
import type { SmartActor } from '../src/lib/smart-access.ts'
import type { TeamData } from '../src/types.ts'
import { pool } from './db.ts'

export type MailConfig = {
  host: string
  port: number
  secure: boolean
  username: string
  from: string
  passwordSet: boolean
}

type StoredMail = MailConfig & { password: string }

export async function loadMailConfig(): Promise<MailConfig> {
  const stored = await readMail()
  return {
    host: stored.host,
    port: stored.port,
    secure: stored.secure,
    username: stored.username,
    from: stored.from,
    passwordSet: stored.password.length > 0,
  }
}

export async function saveMailConfig(input: {
  host: string
  port: number
  secure: boolean
  username: string
  password: string
  from: string
}) {
  const current = await readMail()
  const password = input.password.length > 0 ? input.password : current.password
  await pool.query(
    `INSERT INTO mail_settings (id, host, port, secure, username, password, from_address)
     VALUES (1, $1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE
     SET host = EXCLUDED.host, port = EXCLUDED.port, secure = EXCLUDED.secure,
         username = EXCLUDED.username, password = EXCLUDED.password, from_address = EXCLUDED.from_address`,
    [input.host, input.port, input.secure, input.username, password, input.from],
  )
  return loadMailConfig()
}

export async function sendTestMail(to: string) {
  const settings = await readMail()
  if (!settings.host || !settings.from) throw new Error('Укажите сервер и адрес отправителя.')
  await sendMessages(settings, [{ to, subject: 'Проверочное письмо KPI-Drive', text: 'Подключение к почтовому серверу работает.' }])
}

export async function deliverSmartMail(ownerId: string, before: TeamData, after: TeamData, actor: SmartActor) {
  const letters = smartLetters(before, after, actor)
  if (letters.length === 0) return
  const settings = await readMail()
  if (!settings.host || !settings.from) return
  const recipients = await emailsByEmployee(ownerId, letters)
  const messages = letters.flatMap((letter) =>
    (recipients.get(letter.toEmployeeId) ?? []).map((to) => ({ to, subject: letter.subject, text: letter.text })),
  )
  if (messages.length === 0) return
  await sendMessages(settings, messages)
}

async function sendMessages(settings: StoredMail, messages: { to: string; subject: string; text: string }[]) {
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: settings.username ? { user: settings.username, pass: settings.password } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  })
  for (const message of messages) {
    await transport.sendMail({ from: settings.from, to: message.to, subject: message.subject, text: message.text })
  }
}

async function emailsByEmployee(ownerId: string, letters: MailLetter[]) {
  const ids = [...new Set(letters.map((letter) => letter.toEmployeeId))]
  const found = await pool.query<{ email: string; employee_id: string }>(
    `SELECT email, employee_id FROM users
     WHERE employee_id = ANY($1::text[]) AND (id = $2 OR team_owner_id = $2)`,
    [ids, ownerId],
  )
  const grouped = new Map<string, string[]>()
  for (const row of found.rows) {
    const list = grouped.get(row.employee_id) ?? []
    if (!list.includes(row.email)) list.push(row.email)
    grouped.set(row.employee_id, list)
  }
  return grouped
}

async function readMail(): Promise<StoredMail> {
  const found = await pool.query<{
    host: string
    port: number
    secure: boolean
    username: string
    password: string
    from_address: string
  }>('SELECT host, port, secure, username, password, from_address FROM mail_settings WHERE id = 1')
  const row = found.rows[0]
  return {
    host: row?.host ?? '',
    port: row?.port ?? 587,
    secure: row?.secure ?? false,
    username: row?.username ?? '',
    from: row?.from_address ?? '',
    password: row?.password ?? '',
    passwordSet: Boolean(row?.password),
  }
}
