// Moves documents that Claude staged in Google Drive into Supabase Storage.
// A `document` row with drive_file_id set and migrated_at empty still points at Drive;
// this copies the file into the `documents` bucket, then updates that same row
// (storage_path, migrated_at, and file_url rewritten to the Storage URL). The Drive copy
// is left alone: the script only has read access, and the service account could not trash
// files owned by Mark anyway. A weekly Claude scheduled task ("Holiday Drive tidy") trashes
// the Drive copy of rows migrated more than a day ago.
//
// Usage (paths resolve from this script's location, so any working directory is fine):
//   node scripts/migrate-drive-documents.mjs [--dry-run] [--only <document-id>] [--retry-failed]
//
//   --dry-run       look at Drive and report what would happen; changes nothing anywhere
//   --only <id>     handle just that document row (use for the first real test)
//   --retry-failed  also retry rows that have already failed HPA_MIGRATE_MAX_ATTEMPTS times
//
// Meant for Windows Task Scheduler on any machine (see docs/drive-migration.md): it does
// nothing, and needs no Google key, when no row is waiting. Safe to run on two machines:
// the Storage path is fixed per row (documents/drive-<document id>.<ext>, overwritten),
// and the row update only applies while migrated_at is still empty.
//
// Reads from .env (gitignored): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, GEOCODE_EMAIL,
// GEOCODE_PASSWORD (the household login), GOOGLE_SA_KEY_FILE (service account key, kept
// outside the repo and outside OneDrive). Optional: HPA_LOG_DIR, HPA_MIGRATE_MAX_MB (40),
// HPA_MIGRATE_MAX_ATTEMPTS (5), HPA_BACKUP_WAIT_MINUTES (network wait, default 10).
// Log: <HPA_LOG_DIR>\migrate-drive-<computer name>.log (one per machine, so OneDrive never
// has two machines writing the same file). Retry counts: %USERPROFILE%\.hpa\migrate-state.json.
// Exit code: 0 = nothing to do or all done, 1 = at least one row failed or setup problem.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { backupDir, logDir, signIn } from './lib/storage.mjs'
import { createDriveClient, getAccessToken, loadServiceAccountKey } from './lib/drive.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
try {
  process.loadEnvFile(path.join(root, '.env'))
} catch {
  console.error('No .env found in the repo root.')
  process.exit(1)
}

const args = process.argv.slice(2)
const flags = new Set()
let onlyId = null
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--only') {
    onlyId = args[++i] ?? ''
  } else if (arg.startsWith('--only=')) {
    onlyId = arg.slice('--only='.length)
  } else if (['--dry-run', '--retry-failed'].includes(arg)) {
    flags.add(arg)
  } else {
    console.error(`Unknown option: ${arg}`)
    process.exit(2)
  }
}
if (onlyId !== null && !/^[0-9a-f-]{36}$/i.test(onlyId)) {
  console.error('--only needs a document id (the uuid from the document table).')
  process.exit(2)
}
const dryRun = flags.has('--dry-run')
const retryFailed = flags.has('--retry-failed')

const num = (value, fallback) => (Number(value) > 0 ? Number(value) : fallback)
const maxMb = num(process.env.HPA_MIGRATE_MAX_MB, 40)
const maxAttempts = num(process.env.HPA_MIGRATE_MAX_ATTEMPTS, 5)
const waitMinutes = num(process.env.HPA_BACKUP_WAIT_MINUTES, 10)

const host = os.hostname()
fs.mkdirSync(logDir(), { recursive: true })
const logFile = path.join(logDir(), `migrate-drive-${host}.log`)
const redact = (text) => [process.env.GEOCODE_PASSWORD].filter(Boolean).reduce((t, s) => t.split(s).join('<hidden>'), String(text))
const log = (message) => {
  const line = redact(message)
  console.log(line)
  fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`)
}

const stateDir = path.join(os.homedir(), '.hpa')
fs.mkdirSync(stateDir, { recursive: true })
const stateFile = path.join(stateDir, 'migrate-state.json')
const lockFile = path.join(stateDir, 'migrate.lock')
let state = {}
try {
  state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
} catch {
  // first run, or unreadable: start clean
}

const freshLock = (file, hours) => {
  try {
    return Date.now() - fs.statSync(file).mtimeMs < hours * 3600 * 1000
  } catch {
    return false
  }
}

if (!dryRun) {
  if (freshLock(path.join(backupDir(), 'backup.lock'), 3)) {
    log('Drive migration: a backup is running (backup.lock); will try again at the next check.')
    process.exit(0)
  }
  if (freshLock(lockFile, 1)) {
    log('Drive migration: another run is already in progress on this PC (migrate.lock); leaving it to finish.')
    process.exit(0)
  }
  fs.writeFileSync(lockFile, `${process.pid} ${new Date().toISOString()}\n`)
  process.on('exit', () => fs.rmSync(lockFile, { force: true }))
}

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
    log(`Drive migration: no network after ${waitMinutes} minutes; will try again at the next check.`)
    process.exit(1)
  }
  await new Promise((resolve) => setTimeout(resolve, 15000))
}

const MIME_EXT = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'text/plain': 'txt',
  'text/html': 'html',
  'message/rfc822': 'eml',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}
const extFor = (name, mime) => (/\.([A-Za-z0-9]{1,5})$/.exec(name ?? '')?.[1] ?? MIME_EXT[mime] ?? 'bin').toLowerCase()
const permanent = (message) => Object.assign(new Error(message), { permanent: true })
const mb = (bytes) => (bytes / 1048576).toFixed(1)

let supabase
try {
  supabase = await signIn()
} catch (err) {
  log(`FAILED: ${err.message}`)
  process.exit(1)
}

const { data: waiting, error: listError } = await supabase
  .from('document')
  .select('id, title, file_url, drive_file_id, storage_path')
  .not('drive_file_id', 'is', null)
  .is('migrated_at', null)
  .order('created_at')
if (listError) {
  log(`FAILED: could not read the document table: ${listError.message}`)
  process.exit(1)
}
let rows = waiting
if (onlyId) {
  rows = waiting.filter((r) => r.id.toLowerCase() === onlyId.toLowerCase())
  if (rows.length === 0) {
    log(`Drive migration: document ${onlyId} is not waiting to be migrated (no drive_file_id, or already migrated).`)
    process.exit(1)
  }
}
if (rows.length === 0) {
  log('Drive migration: nothing waiting.')
  process.exit(0)
}

const todo = []
let skipped = 0
for (const row of rows) {
  const fails = state[row.id]?.fails ?? 0
  if (fails >= maxAttempts && !retryFailed) {
    skipped++
    log(`WARNING: "${row.title ?? row.id}" skipped: it has failed ${fails} times (last: ${state[row.id].lastError}). Fix the cause, then run with --retry-failed.`)
  } else {
    todo.push(row)
  }
}
if (todo.length === 0) {
  log(`Drive migration: ${skipped} document(s) waiting, all skipped after repeated failures.`)
  process.exit(0)
}

log(`Drive migration${dryRun ? ' (dry run)' : ''}: ${todo.length} document(s) to move from Drive to Storage.`)
let drive
try {
  drive = createDriveClient(await getAccessToken(loadServiceAccountKey()))
} catch (err) {
  log(`FAILED: ${err.message}`)
  process.exit(1)
}

const counts = { migrated: 0, already: 0, failed: 0, dry: 0 }

async function migratedElsewhere(id) {
  const { data } = await supabase.from('document').select('migrated_at').eq('id', id).maybeSingle()
  return !!data?.migrated_at
}

async function migrateOne(row) {
  const label = `"${row.title ?? row.id}"`
  const file = await drive.getFile(row.drive_file_id)
  if (file.mimeType.startsWith('application/vnd.google-apps.')) {
    throw permanent(`it is a Google-native file (${file.mimeType}); only uploaded files (PDF, images, Word...) can be copied`)
  }
  const size = Number(file.size)
  if (!Number.isFinite(size)) throw permanent('Drive reports no size for it')
  if (size > maxMb * 1048576) throw permanent(`it is ${mb(size)} MB, over the ${maxMb} MB limit (HPA_MIGRATE_MAX_MB)`)
  const objectPath = `drive-${row.id}.${extFor(file.name, file.mimeType)}`

  if (dryRun) {
    log(`  ${label}: Drive file "${file.name}" (${file.mimeType}, ${mb(size)} MB) would be copied to documents/${objectPath}.`)
    return 'dry'
  }

  const bytes = await drive.download(row.drive_file_id)
  if (bytes.length !== size) throw new Error(`downloaded ${bytes.length} bytes but Drive says ${size}`)
  if (file.md5Checksum && crypto.createHash('md5').update(bytes).digest('hex') !== file.md5Checksum) {
    throw new Error('downloaded file does not match Drive\'s checksum')
  }

  const bucket = supabase.storage.from('documents')
  const { error: uploadError } = await bucket.upload(objectPath, bytes, { upsert: true, contentType: file.mimeType })
  if (uploadError) throw new Error(`upload to Storage failed: ${uploadError.message}`)
  const { data: listed, error: verifyError } = await bucket.list('', { limit: 10, search: objectPath })
  const stored = listed?.find((o) => o.name === objectPath)
  if (verifyError || !stored || Number(stored.metadata?.size) !== bytes.length) {
    throw new Error('the Storage copy could not be verified (missing or wrong size); the Drive copy and the row are untouched')
  }

  const { data: updated, error: updateError } = await supabase
    .from('document')
    .update({ storage_path: objectPath, migrated_at: new Date().toISOString(), file_url: bucket.getPublicUrl(objectPath).data.publicUrl })
    .eq('id', row.id)
    .is('migrated_at', null)
    .select('id')
  if (updateError) throw new Error(`row update failed: ${updateError.message}`)
  if (!updated?.length) {
    log(`  ${label}: already migrated by another run; nothing more to do.`)
    return 'already'
  }
  log(`  ${label}: copied to documents/${objectPath} (${mb(bytes.length)} MB); row updated (was ${row.file_url}).`)

  return 'migrated'
}

for (const row of todo) {
  try {
    counts[await migrateOne(row)]++
    delete state[row.id]
  } catch (err) {
    if (!dryRun && (await migratedElsewhere(row.id))) {
      log(`  "${row.title ?? row.id}": migrated by another run while this one was working; nothing more to do.`)
      counts.already++
      delete state[row.id]
      continue
    }
    counts.failed++
    const hint = err.status === 404 ? ' (not found: is it in a folder shared with the service account?)' : err.status === 403 ? ' (no permission: check the folder is shared with the service account)' : ''
    log(`FAILED: "${row.title ?? row.id}": ${err.message}${hint}`)
    if (!dryRun) {
      const fails = err.permanent ? maxAttempts : (state[row.id]?.fails ?? 0) + 1
      state[row.id] = { fails, lastError: err.message.slice(0, 200), lastAt: new Date().toISOString() }
    }
  }
}
if (!dryRun) fs.writeFileSync(stateFile, JSON.stringify(state, null, 2))

log(
  dryRun
    ? `Drive migration (dry run) finished: ${counts.dry} would be moved, ${counts.failed} problem(s).`
    : `Drive migration finished: ${counts.migrated} moved, ${counts.already} already done, ${counts.failed} failed${skipped ? `, ${skipped} skipped after repeated failures` : ''}.`,
)
process.exit(counts.failed ? 1 : 0)
