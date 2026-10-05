// Runs scripts/backup.mjs only if the last good backup is more than a week old.
// Made for Windows Task Scheduler on a PC that is switched on and off at will: schedule it
// "At log on" (and repeat every few hours), not at a fixed time. See docs/backup-and-restore.md.
//
// Usage:  node scripts/backup-if-due.mjs [--force]
//   --force   back up now even if one is recent (same as running backup.mjs)
//
// "Last good backup" = the newest db\<folder>\manifest.json with "ok": true, labelled or not,
// so a manual `go backup hpa pre-v4` counts. A failed or interrupted run does not count, so
// it is retried at the next check.
//
// Optional .env settings: HPA_BACKUP_MAX_AGE_DAYS (default 7), HPA_BACKUP_WAIT_MINUTES
// (how long to wait for the network after log on, default 10), plus everything backup.mjs reads.
// Exit code: 0 = not due or backed up OK, 1 = backup failed or no network.

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { backupDir } from './lib/storage.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
try {
  process.loadEnvFile(path.join(root, '.env'))
} catch {
  console.error('No .env found in the repo root.')
  process.exit(1)
}

const force = process.argv.includes('--force')
const num = (value, fallback) => (Number(value) > 0 ? Number(value) : fallback)
const maxAgeDays = num(process.env.HPA_BACKUP_MAX_AGE_DAYS, 7)
const waitMinutes = num(process.env.HPA_BACKUP_WAIT_MINUTES, 10)

const base = backupDir()
fs.mkdirSync(path.join(base, 'db'), { recursive: true })
const logFile = path.join(base, 'backup.log')
const log = (message) => {
  console.log(message)
  fs.appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`)
}

function lastGoodBackup() {
  const dbRoot = path.join(base, 'db')
  let newest = null
  for (const name of fs.readdirSync(dbRoot)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dbRoot, name, 'manifest.json'), 'utf8'))
      const when = Date.parse(manifest.created)
      if (manifest.ok === true && manifest.database && !Number.isNaN(when) && (newest === null || when > newest.when)) {
        newest = { when, name }
      }
    } catch {
      // folder without a readable manifest: not a good backup
    }
  }
  return newest
}

const last = lastGoodBackup()
const ageDays = last ? (Date.now() - last.when) / 86400000 : Infinity
if (!force && ageDays < maxAgeDays) {
  log(`Backup check: last good backup db\\${last.name} is ${ageDays.toFixed(1)} days old (limit ${maxAgeDays}); not due.`)
  process.exit(0)
}
log(
  last
    ? `Backup check: last good backup db\\${last.name} is ${ageDays.toFixed(1)} days old (limit ${maxAgeDays}); starting a backup.`
    : 'Backup check: no good backup found; starting a backup.',
)

// Another run (manual or scheduled) may already be going; a lock older than 3 hours is stale.
const lockFile = path.join(base, 'backup.lock')
try {
  if (Date.now() - fs.statSync(lockFile).mtimeMs < 3 * 3600 * 1000) {
    log('Backup check: another backup is already running (backup.lock); leaving it to finish.')
    process.exit(0)
  }
} catch {
  // no lock file
}
fs.writeFileSync(lockFile, `${process.pid} ${new Date().toISOString()}\n`)
const releaseLock = () => fs.rmSync(lockFile, { force: true })
process.on('exit', releaseLock)

// Just after log on the network may not be up yet. Any HTTP answer from Supabase counts.
async function networkUp() {
  try {
    await fetch(`${process.env.VITE_SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY ?? '' },
      signal: AbortSignal.timeout(8000),
    })
    return true
  } catch {
    return false
  }
}
const deadline = Date.now() + waitMinutes * 60000
while (!(await networkUp())) {
  if (Date.now() > deadline) {
    log(`Backup check: no network after ${waitMinutes} minutes; will try again at the next check.`)
    process.exit(1)
  }
  await new Promise((resolve) => setTimeout(resolve, 15000))
}

const result = spawnSync(process.execPath, [path.join(here, 'backup.mjs')], { stdio: 'inherit' })
if (result.status !== 0) {
  log(`Backup check: backup.mjs finished with errors (exit ${result.status ?? result.error?.message}); will retry at the next check.`)
  process.exit(1)
}
process.exit(0)
