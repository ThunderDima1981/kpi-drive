import { execFileSync } from 'node:child_process'

export function ensureLocalPostgres(databaseUrl: string) {
  let host = ''
  try {
    host = new URL(databaseUrl).hostname
  } catch {
    return
  }
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') return

  try {
    execFileSync('pg_isready', ['-h', '127.0.0.1', '-p', '5432'], { stdio: 'ignore' })
  } catch {
    execFileSync('sudo', ['pg_ctlcluster', '16', 'main', 'start'], { stdio: 'inherit' })
  }

  execFileSync(
    'sudo',
    [
      '-u',
      'postgres',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kpi') THEN
          CREATE ROLE kpi LOGIN PASSWORD 'kpi';
        END IF;
      END $$;`,
    ],
    { stdio: 'inherit' },
  )

  const exists = execFileSync(
    'sudo',
    ['-u', 'postgres', 'psql', '-tAc', "SELECT 1 FROM pg_database WHERE datname = 'kpi_drive'"],
    { encoding: 'utf8' },
  ).trim()
  if (exists !== '1') {
    execFileSync('sudo', ['-u', 'postgres', 'psql', '-c', 'CREATE DATABASE kpi_drive OWNER kpi'], {
      stdio: 'inherit',
    })
  }
}
