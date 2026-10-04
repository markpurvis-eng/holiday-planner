// Backs up the whole Holiday Planner project: the database AND the Storage files.
// Read-only against Supabase: it dumps, lists and downloads; it never writes to the project.
//
// Usage (paths resolve from this script's location, so any working directory is fine):
//   node scripts/backup.mjs [label] [--db-only] [--storage-only] [--no-prune]
//   (or, from PowerShell:  go backup hpa [label])
//
//   label     optional, e.g. pre-v4. A labelled backup is never pruned. Use one before
//             every schema change. An unlabelled run (the scheduled one) is pruned to
//             the newest HPA_BACKUP_KEEP (default 8).
//
// Writes under HPA_BACKUP_DIR (default C:\Users\<you>\OneDrive\Sync\Programs\HolidayPlannerApp):
//   db\<yyyy-mm-dd_hhmmss>[_label]\public.sql              pg_dump of the public schema WITH data
//                                  schema-snapshot.sql     the live schema as idempotent SQL
//                                  storage-definitions.sql buckets and storage policies
//                                  manifest.json           counts, versions, orphan report
//   storage\<bucket>\...           incremental mirror of every file in Storage (never deletes)
//   backup.log                     one line per step, for scheduled runs
//
// Reads from .env (gitignored): HPA_DB_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
// GEOCODE_EMAIL, GEOCODE_PASSWORD; optional HPA_BACKUP_DIR, HPA_BACKUP_KEEP, HPA_PG_BIN.
// pg_dump and psql must be on PATH (or HPA_PG_BIN set); pg_dump must be the same
// major version as the Supabase server or newer.

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  currentSchemaVersion,
  fetchCatalog,
  pgBin,
  renderSchema,
  renderStorageDefinitions,
  snapshotHeader,
} from './lib/schema-render.mjs'
import { BUCKETS, backupDir, extractStoragePath, listAll, localPathFor, signIn } from './lib/storage.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
try {
  process.loadEnvFile(path.join(root, '.env'))
} catch {
  console.error('No .env found in the repo root.')
  process.exit(1)
}

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const unknown = [...flags].filter((f) => !['--db-only', '--storage-only', '--no-prune'].includes(f))
if (unknown.length) {
  console.error(`Unknown option: ${unknown.join(' ')}`)
  process.exit(2)
}
const label = args.find((a) => !a.startsWith('--'))
if (label && !/^[A-Za-z0-9._-]+$/.test(label)) {
  console.error('Label may only contain letters, digits, dot, dash and underscore, e.g. pre-v4')
  process.exit(2)
}
if (flags.has('--db-only') && flags.has('--storage-only')) {
  console.error('Pick at most one of --db-only and --storage-only.')
  process.exit(2)
}
const doDb = !flags.has('--storage-only')
const doStorage = !flags.has('--db-only')

const dbUrl = process.env.HPA_DB_URL
if (!dbUrl) {
  console.error('HPA_DB_URL is not set in .env (the Postgres connection string used by `go dump`).')
  process.exit(1)
}
const keep = Number(process.env.HPA_BACKUP_KEEP) > 0 ? Number(process.env.HPA_BACKUP_KEEP) : 8

const base = backupDir()
fs.mkdirSync(path.join(base, 'db'), { recursive: true })
const logFile = path.join(base, 'backup.log')
const redact = (text) =>
  [dbUrl, process.env.GEOCODE_PASSWORD].filter(Boolean).reduce((t, secret) => t.split(secret).join('<hidden>'), String(text))
const log = (message) => {
  const line = redact(message)
  console.log(line)
  fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`)
}

const pad = (n) => String(n).padStart(2, '0')
const now = new Date()
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
const dumpName = label ? `${stamp}_${label}` : stamp
const dumpDir = path.join(base, 'db', dumpName)

const manifest = {
  created: now.toISOString(),
  label: label ?? null,
  folder: dumpName,
  database: null,
  storage: null,
  warnings: [],
  ok: true,
}
const warn = (message) => {
  manifest.warnings.push(redact(message))
  log(`WARNING: ${message}`)
}
const fail = (message) => {
  manifest.ok = false
  log(`FAILED: ${message}`)
}

// Rows per table in a plain-SQL pg_dump (COPY blocks), to confirm the dump holds the data.
function countCopyRows(file) {
  const counts = {}
  let table = null
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (table === null) {
      const m = /^COPY public\.("?[^\s"]+"?) \(/.exec(line)
      if (m) {
        table = m[1].replace(/"/g, '')
        counts[table] = 0
      }
    } else if (line === '\\.' || line === '\\.\r') {
      table = null
    } else {
      counts[table]++
    }
  }
  return counts
}

let supabase = null
async function client() {
  supabase ??= await signIn()
  return supabase
}

async function backupDatabase() {
  log(`Database: dumping the public schema with data to db\\${dumpName}\\public.sql ...`)
  fs.mkdirSync(dumpDir, { recursive: true })
  const dumpFile = path.join(dumpDir, 'public.sql')
  const dump = spawnSync(pgBin('pg_dump'), [dbUrl, '--schema=public', '--no-owner', '--file', dumpFile], { encoding: 'utf8' })
  if (dump.error) {
    return fail(
      dump.error.code === 'ENOENT'
        ? 'pg_dump not found. Install the PostgreSQL command line tools and add them to PATH, or set HPA_PG_BIN in .env.'
        : dump.error.message,
    )
  }
  if (dump.status !== 0) {
    fs.rmSync(dumpFile, { force: true })
    const detail = redact(dump.stderr || '').trim()
    return fail(
      `pg_dump failed (exit ${dump.status}): ${detail}${/version/i.test(detail) ? '\n  pg_dump must be the same major version as the Supabase server, or newer.' : ''}`,
    )
  }
  const versionLine = spawnSync(pgBin('pg_dump'), ['--version'], { encoding: 'utf8' }).stdout?.trim()

  let catalog
  try {
    catalog = fetchCatalog(dbUrl)
  } catch (err) {
    return fail(`Schema snapshot: ${err.message}`)
  }
  const version = currentSchemaVersion(catalog)
  fs.writeFileSync(path.join(dumpDir, 'schema-snapshot.sql'), renderSchema(catalog, snapshotHeader(version)))
  fs.writeFileSync(
    path.join(dumpDir, 'storage-definitions.sql'),
    renderStorageDefinitions(catalog, ['-- Storage buckets and policies for the Holiday Planner project (idempotent).']),
  )

  const dumped = countCopyRows(dumpFile)
  const tables = {}
  for (const t of catalog.tables) tables[t.name] = { dump_rows: dumped[t.name] ?? 0, api_rows: null }
  try {
    const sb = await client()
    for (const name of Object.keys(tables)) {
      const { count, error } = await sb.from(name).select('*', { count: 'exact', head: true })
      if (error) throw new Error(`${name}: ${error.message}`)
      tables[name].api_rows = count
      if (count !== tables[name].dump_rows) {
        warn(`${name}: dump holds ${tables[name].dump_rows} rows but the app sees ${count} (rows added or removed during the dump, or the dump is incomplete).`)
      }
    }
  } catch (err) {
    warn(`Row-count cross-check skipped: ${err.message}`)
  }
  manifest.database = {
    schema_version: version,
    pg_dump: versionLine,
    dump_bytes: fs.statSync(dumpFile).size,
    tables,
  }
  const total = Object.values(tables).reduce((sum, t) => sum + t.dump_rows, 0)
  log(`Database: done. schema_version ${version}, ${Object.keys(tables).length} tables, ${total} rows, ${(manifest.database.dump_bytes / 1024).toFixed(0)} KB.`)
}

async function backupStorage() {
  log('Storage: mirroring buckets (new and changed files only) ...')
  const sb = await client()
  const summary = { buckets: {}, orphans: {} }
  const listings = {}

  for (const bucket of BUCKETS) {
    const objects = await listAll(sb, bucket)
    listings[bucket] = objects
    const stats = { objects: objects.length, bytes: 0, downloaded: 0, unchanged: 0, failed: 0 }
    for (const obj of objects) {
      stats.bytes += obj.size ?? 0
      let target
      try {
        target = localPathFor(base, bucket, obj.path)
      } catch (err) {
        stats.failed++
        warn(`${bucket}/${obj.path}: ${err.message}`)
        continue
      }
      const remoteTime = obj.updatedAt ? Date.parse(obj.updatedAt) : null
      if (fs.existsSync(target)) {
        const local = fs.statSync(target)
        const sameSize = obj.size === null || local.size === obj.size
        const sameTime = remoteTime === null || Math.abs(local.mtimeMs - remoteTime) < 2000
        if (sameSize && sameTime) {
          stats.unchanged++
          continue
        }
      }
      try {
        const { data, error } = await sb.storage.from(bucket).download(obj.path)
        if (error) throw new Error(error.message)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(`${target}.part`, Buffer.from(await data.arrayBuffer()))
        fs.renameSync(`${target}.part`, target)
        if (remoteTime !== null) fs.utimesSync(target, new Date(), new Date(remoteTime))
        stats.downloaded++
      } catch (err) {
        stats.failed++
        fs.rmSync(`${target}.part`, { force: true })
        warn(`${bucket}/${obj.path}: download failed: ${err.message}`)
      }
    }
    summary.buckets[bucket] = stats
    if (stats.failed) manifest.ok = false
    log(`Storage: ${bucket}: ${stats.objects} files, ${(stats.bytes / 1048576).toFixed(1)} MB; ${stats.downloaded} new/changed, ${stats.unchanged} unchanged, ${stats.failed} failed.`)
  }

  // Orphan report: information only, nothing is deleted.
  try {
    const rows = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('document').select('id, title, file_url, storage_path').range(from, from + 999)
      if (error) throw new Error(error.message)
      rows.push(...data)
      if (data.length < 1000) break
    }
    const { data: trips, error: tripError } = await sb.from('trip').select('id')
    if (tripError) throw new Error(tripError.message)

    const inBucket = new Set(listings.documents.map((o) => o.path))
    const referenced = new Set()
    const missing = []
    let external = 0
    for (const row of rows) {
      const fromUrl = extractStoragePath(row.file_url, 'documents')
      if (fromUrl) {
        referenced.add(fromUrl)
        if (!inBucket.has(fromUrl)) missing.push({ document_id: row.id, title: row.title, path: fromUrl })
      } else {
        external++
      }
      if (row.storage_path) referenced.add(row.storage_path)
    }
    // .emptyFolderPlaceholder is the marker the Supabase dashboard puts in a bucket; not an orphan.
    const filesWithoutRow = listings.documents
      .map((o) => o.path)
      .filter((p) => !referenced.has(p) && path.posix.basename(p) !== '.emptyFolderPlaceholder')
    const pdfs = new Set(trips.map((t) => `${t.id}.pdf`))
    const itineraryOrphans = listings.itineraries.map((o) => o.path).filter((p) => !pdfs.has(p))

    summary.orphans = {
      documents_files_without_document_row: filesWithoutRow,
      document_rows_without_file: missing,
      itinerary_pdfs_without_trip: itineraryOrphans,
      documents_with_external_url: external,
    }
    log(
      `Storage: orphan check: ${filesWithoutRow.length} document file(s) with no document row, ${missing.length} document row(s) with no file, ${itineraryOrphans.length} itinerary PDF(s) with no trip (report only; nothing deleted).`,
    )
    for (const p of filesWithoutRow.slice(0, 10)) log(`  file without a document row: documents/${p}`)
    for (const m of missing.slice(0, 10)) log(`  document row without a file: "${m.title ?? m.document_id}" -> documents/${m.path}`)
  } catch (err) {
    warn(`Orphan check skipped: ${err.message}`)
  }
  manifest.storage = summary
}

function prune() {
  const dbRoot = path.join(base, 'db')
  const unlabelled = fs
    .readdirSync(dbRoot)
    .filter((n) => /^\d{4}-\d{2}-\d{2}_\d{6}$/.test(n) && fs.statSync(path.join(dbRoot, n)).isDirectory())
    .sort()
  const old = unlabelled.slice(0, Math.max(0, unlabelled.length - keep))
  for (const name of old) {
    fs.rmSync(path.join(dbRoot, name), { recursive: true, force: true })
    log(`Pruned old unlabelled backup db\\${name} (keeping the newest ${keep}; labelled backups are never pruned).`)
  }
}

log(`Backup started${label ? ` (label: ${label})` : ''} -> ${base}`)
try {
  if (doDb) await backupDatabase()
  if (doStorage) await backupStorage()
} catch (err) {
  fail(err.message)
}

if (doDb && fs.existsSync(dumpDir)) {
  fs.writeFileSync(path.join(dumpDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
}
if (manifest.ok && doDb && !flags.has('--no-prune')) prune()

log(manifest.ok ? `Backup finished OK${manifest.warnings.length ? ` with ${manifest.warnings.length} warning(s)` : ''}.` : 'Backup finished WITH ERRORS (see above).')
process.exit(manifest.ok ? 0 : 1)
