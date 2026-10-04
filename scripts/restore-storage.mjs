// Uploads the local Storage mirror (made by scripts/backup.mjs) back into the project's
// buckets. Use it after restoring the database into a new or emptied project.
// It never deletes anything and, by default, never overwrites a file that already exists.
//
// Usage:
//   node scripts/restore-storage.mjs                    upload every missing file, both buckets
//   node scripts/restore-storage.mjs --dry-run          list what would be uploaded
//   node scripts/restore-storage.mjs --bucket documents only one bucket
//   node scripts/restore-storage.mjs --overwrite        replace files that already exist
//
// Reads VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, GEOCODE_EMAIL, GEOCODE_PASSWORD from .env
// (point them at the project you are restoring INTO). Optional HPA_BACKUP_DIR.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUCKETS, backupDir, decodeSegment, listAll, signIn } from './lib/storage.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
try {
  process.loadEnvFile(path.join(root, '.env'))
} catch {
  console.error('No .env found in the repo root.')
  process.exit(1)
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const overwrite = args.includes('--overwrite')
const bucketArg = args.includes('--bucket') ? args[args.indexOf('--bucket') + 1] : null
const known = new Set(['--dry-run', '--overwrite', '--bucket', bucketArg])
const unknown = args.filter((a) => !known.has(a))
if (unknown.length || (bucketArg !== null && !BUCKETS.includes(bucketArg))) {
  console.error(`Usage: node scripts/restore-storage.mjs [--dry-run] [--overwrite] [--bucket ${BUCKETS.join('|')}]`)
  process.exit(2)
}

const TYPES = {
  '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.heic': 'image/heic', '.txt': 'text/plain', '.json': 'application/json', '.html': 'text/html',
}

function* walk(dir, prefix = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) yield* walk(path.join(dir, entry.name), [...prefix, entry.name])
    else if (!entry.name.endsWith('.part')) yield { file: path.join(dir, entry.name), segments: [...prefix, entry.name] }
  }
}

try {
  const supabase = await signIn()
  let uploaded = 0
  let skipped = 0
  let failed = 0
  for (const bucket of bucketArg ? [bucketArg] : BUCKETS) {
    const dir = path.join(backupDir(), 'storage', bucket)
    if (!fs.existsSync(dir)) {
      console.log(`${bucket}: no local mirror at ${dir}; skipping.`)
      continue
    }
    const existing = new Set((await listAll(supabase, bucket)).map((o) => o.path))
    for (const { file, segments } of walk(dir)) {
      const objectPath = segments.map(decodeSegment).join('/')
      if (existing.has(objectPath) && !overwrite) {
        skipped++
        continue
      }
      if (dryRun) {
        console.log(`would upload ${bucket}/${objectPath}`)
        uploaded++
        continue
      }
      const { error } = await supabase.storage.from(bucket).upload(objectPath, fs.readFileSync(file), {
        upsert: overwrite,
        contentType: TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      })
      if (error) {
        failed++
        console.error(`FAILED ${bucket}/${objectPath}: ${error.message}`)
      } else {
        uploaded++
      }
    }
  }
  console.log(`${dryRun ? 'Would upload' : 'Uploaded'} ${uploaded}, already present ${skipped}, failed ${failed}.`)
  process.exit(failed ? 1 : 0)
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
