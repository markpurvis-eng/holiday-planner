// Regenerates supabase/schema.sql from the LIVE database, so the file always
// shows the current schema. Read-only: it only runs the catalog query in
// scripts/sql/schema-catalog.sql.
//
// Usage (from anywhere; paths are resolved from this script's location):
//   node scripts/gen-schema.mjs                  rewrite supabase/schema.sql
//   node scripts/gen-schema.mjs --check          exit 1 if the file is out of date
//   node scripts/gen-schema.mjs --out <file>     write somewhere else
//   node scripts/gen-schema.mjs --from-json <f>  use a saved catalog document instead of psql
//
// Reads HPA_DB_URL from .env (gitignored); psql must be on PATH (or HPA_PG_BIN set).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { currentSchemaVersion, fetchCatalog, renderSchema, snapshotHeader } from './lib/schema-render.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
try {
  process.loadEnvFile(path.join(root, '.env'))
} catch {
  // .env is optional when --from-json is used
}

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const value = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const known = new Set(['--check', '--out', '--from-json'])
const unknown = args.filter((a) => a.startsWith('--') && !known.has(a))
if (unknown.length) {
  console.error(`Unknown option: ${unknown.join(' ')}`)
  process.exit(2)
}

const outFile = path.resolve(value('--out') ?? path.join(root, 'supabase', 'schema.sql'))

let catalog
try {
  if (value('--from-json')) {
    catalog = JSON.parse(fs.readFileSync(value('--from-json'), 'utf8'))
  } else {
    if (!process.env.HPA_DB_URL) {
      console.error('HPA_DB_URL is not set. Add it to .env (the Postgres connection string used by `go dump`).')
      process.exit(1)
    }
    catalog = fetchCatalog(process.env.HPA_DB_URL)
  }
  const version = currentSchemaVersion(catalog)
  const text = renderSchema(catalog, snapshotHeader(version))

  const existing = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : null
  const eol = existing?.includes('\r\n') ? '\r\n' : '\n'
  const normalised = (t) => t.replace(/\r\n/g, '\n')
  const same = existing !== null && normalised(existing) === normalised(text)

  if (flag('--check')) {
    if (same) {
      console.log(`${path.relative(root, outFile)} is up to date (schema_version ${version}).`)
      process.exit(0)
    }
    console.error(`${path.relative(root, outFile)} is OUT OF DATE with the live database. Run: node scripts/gen-schema.mjs`)
    process.exit(1)
  }

  if (same) {
    console.log(`${path.relative(root, outFile)} already matches the live database (schema_version ${version}); nothing written.`)
  } else {
    fs.mkdirSync(path.dirname(outFile), { recursive: true })
    fs.writeFileSync(outFile, text.replace(/\n/g, eol))
    console.log(`Wrote ${path.relative(root, outFile)} (${text.split('\n').length} lines, schema_version ${version}).`)
  }
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
