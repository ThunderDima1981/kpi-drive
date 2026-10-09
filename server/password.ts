import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = ((await scrypt(password, salt, 32)) as Buffer).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, salt, hash] = stored.split('$')
  if (algo !== 'scrypt' || !salt || !hash) return false
  const next = (await scrypt(password, salt, 32)) as Buffer
  const previous = Buffer.from(hash, 'hex')
  if (next.length !== previous.length) return false
  return timingSafeEqual(next, previous)
}
