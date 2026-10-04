// Turns the jsonb document returned by scripts/sql/schema-catalog.sql into SQL.
// Shared by scripts/gen-schema.mjs (writes supabase/schema.sql) and
// scripts/backup.mjs (writes a schema snapshot and the storage definitions
// next to each database dump). Output is deterministic and idempotent: tables
// use `create table if not exists`, policies and triggers are dropped and
// recreated, buckets and schema_version rows use `on conflict`.

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const CATALOG_SQL = path.join(here, '..', 'sql', 'schema-catalog.sql')

// HPA_PG_BIN (optional) is the folder holding pg_dump and psql, for machines
// (or scheduled tasks) where the PostgreSQL tools are not on PATH.
export const pgBin = (name) => (process.env.HPA_PG_BIN ? path.join(process.env.HPA_PG_BIN, name) : name)

export function fetchCatalog(dbUrl) {
  const result = spawnSync(
    pgBin('psql'),
    [dbUrl, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', 'set search_path = public', '-f', CATALOG_SQL],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  if (result.error) {
    throw new Error(
      result.error.code === 'ENOENT'
        ? 'psql not found. It ships with the PostgreSQL command line tools (same folder as pg_dump): add that folder to PATH, or set HPA_PG_BIN in .env.'
        : result.error.message,
    )
  }
  if (result.status !== 0) {
    throw new Error(`psql failed (exit ${result.status}): ${(result.stderr || '').split(dbUrl).join('<HPA_DB_URL>').trim()}`)
  }
  const out = result.stdout.trim()
  const start = out.indexOf('{')
  if (start < 0) throw new Error(`Unexpected psql output: ${out.slice(0, 200)}`)
  return JSON.parse(out.slice(start))
}

const RESERVED = new Set(
  ('all analyse analyze and any array as asc asymmetric both case cast check collate column constraint create ' +
    'current_catalog current_date current_role current_time current_timestamp current_user default deferrable ' +
    'desc distinct do else end except false fetch for foreign from grant group having in initially intersect ' +
    'into lateral leading limit localtime localtimestamp not null offset on only or order placing primary ' +
    'references returning select session_user some symmetric system_user table then to trailing true union ' +
    'unique user using variadic when where window with').split(' '),
)
const qi = (s) => (/^[a-z_][a-z0-9_]*$/.test(s) && !RESERVED.has(s) ? s : `"${s.replace(/"/g, '""')}"`)
const ql = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`)
const qlist = (arr) => (arr === null || arr === undefined ? 'null' : `array[${arr.map(ql).join(', ')}]`)
const pub = (name) => `public.${qi(name)}`

// Postgres 16 and earlier: these seven are ALL on a table. Postgres 17 adds
// MAINTAIN. A role holding the full set is written as `grant all`, which
// works on either version; any other set is listed out.
const CORE_PRIVILEGES = ['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']

function assertSupported(catalog) {
  const problems = [...catalog.unsupported]
  for (const table of catalog.tables) {
    for (const column of table.columns) {
      if (column.generated || column.identity) problems.push(`generated/identity column ${table.name}.${column.name}`)
    }
  }
  for (const constraint of catalog.constraints) {
    if (!['p', 'u', 'c', 'f'].includes(constraint.type)) {
      problems.push(`constraint ${constraint.name} of type ${constraint.type}`)
    }
  }
  if (problems.length) {
    throw new Error(
      `The database has objects the generator cannot write yet:\n  - ${problems.join('\n  - ')}\n` +
        'Extend scripts/sql/schema-catalog.sql and scripts/lib/schema-render.mjs, then run again.',
    )
  }
}

function qualifyReferences(def) {
  return def.replace(/REFERENCES (?!public\.)([a-z_][a-z0-9_]*|"[^"]+")\(/, 'REFERENCES public.$1(')
}

function policySql(policy) {
  const table = `${policy.schema}.${qi(policy.table)}`
  const roles = policy.roles.map((r) => (r === 'public' ? 'public' : qi(r))).join(', ')
  const name = `"${policy.name.replace(/"/g, '""')}"`
  const parts = [
    `create policy ${name} on ${table}`,
    policy.permissive === 'RESTRICTIVE' ? 'as restrictive' : null,
    `for ${policy.cmd.toLowerCase()}`,
    `to ${roles}`,
    policy.using === null ? null : `using (${policy.using})`,
    policy.check === null ? null : `with check (${policy.check})`,
  ].filter(Boolean)
  return `drop policy if exists ${name} on ${table};\n${parts.join(' ')};`
}

export function renderSections(catalog) {
  assertSupported(catalog)
  const extensions = catalog.extensions.map(
    (e) => `create extension if not exists "${e.name}" with schema ${qi(e.schema)};`,
  )

  const tables = catalog.tables.map((table) => {
    const own = catalog.constraints.filter((c) => c.table === table.name && ['p', 'u', 'c'].includes(c.type))
    own.sort((a, b) => 'puc'.indexOf(a.type) - 'puc'.indexOf(b.type) || a.name.localeCompare(b.name))
    const lines = [
      ...table.columns.map(
        (c) => `  ${qi(c.name)} ${c.type}${c.not_null ? ' not null' : ''}${c.default === null ? '' : ` default ${c.default}`}`,
      ),
      ...own.map((c) => `  constraint ${qi(c.name)} ${c.def}`),
    ]
    return `create table if not exists ${pub(table.name)} (\n${lines.join(',\n')}\n);`
  })

  const indexes = catalog.indexes.map(
    (i) => i.def.replace(/^CREATE (UNIQUE )?INDEX /, (_, u) => `create ${u ? 'unique ' : ''}index if not exists `) + ';',
  )

  const foreignKeys = catalog.constraints
    .filter((c) => c.type === 'f')
    .map(
      (c) =>
        `do $$ begin\n  if not exists (select 1 from pg_constraint where conname = ${ql(c.name)} and conrelid = 'public.${qi(c.table)}'::regclass) then\n` +
        `    alter table ${pub(c.table)} add constraint ${qi(c.name)} ${qualifyReferences(c.def)};\n  end if;\nend $$;`,
    )

  const functions = catalog.functions.map((f) => f.def.trimEnd() + ';')

  const triggers = catalog.triggers.map(
    (t) =>
      `drop trigger if exists ${qi(t.name)} on ${pub(t.table)};\n` +
      t.def.replace(/EXECUTE FUNCTION (?!public\.)([a-z_][a-z0-9_]*)\(/, 'EXECUTE FUNCTION public.$1(') +
      ';',
  )

  const security = [
    ...catalog.tables.flatMap((t) => [
      ...(t.rls ? [`alter table ${pub(t.name)} enable row level security;`] : []),
      ...(t.force_rls ? [`alter table ${pub(t.name)} force row level security;`] : []),
    ]),
    ...catalog.policies.filter((p) => p.schema === 'public').map(policySql),
  ]

  const grants = catalog.grants.map((g) => {
    const set = new Set(g.privileges)
    const all = CORE_PRIVILEGES.every((p) => set.has(p)) && g.privileges.every((p) => CORE_PRIVILEGES.includes(p) || p === 'MAINTAIN')
    const list = all ? 'all' : g.privileges.map((p) => p.toLowerCase()).join(', ')
    return `grant ${list} on ${pub(g.table)} to ${qi(g.role)};`
  })

  const storage = [
    ...(catalog.buckets.length
      ? [
          'insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values\n' +
            catalog.buckets
              .map((b) => `  (${ql(b.id)}, ${ql(b.name)}, ${b.public}, ${b.file_size_limit === null ? 'null' : b.file_size_limit}, ${qlist(b.allowed_mime_types)})`)
              .join(',\n') +
            '\non conflict (id) do update set\n  name = excluded.name,\n  public = excluded.public,\n  file_size_limit = excluded.file_size_limit,\n  allowed_mime_types = excluded.allowed_mime_types;',
        ]
      : []),
    ...catalog.policies.filter((p) => p.schema === 'storage').map(policySql),
  ]

  const versions = catalog.schema_version.length
    ? [
        'insert into public.schema_version (version, description, applied_at) values\n' +
          catalog.schema_version
            .map((v) => `  (${v.version}, ${ql(v.description)}, ${ql(v.applied_at)}::timestamptz)`)
            .join(',\n') +
          '\non conflict (version) do nothing;',
      ]
    : []

  const currentVersion = catalog.schema_version.reduce((max, v) => Math.max(max, v.version), 0)
  return { extensions, tables, indexes, foreignKeys, functions, triggers, security, grants, storage, versions, currentVersion }
}

const block = (title, items, sep = '\n\n') => (items.length ? `-- --- ${title} ${'-'.repeat(Math.max(3, 70 - title.length))}\n\n${items.join(sep)}\n` : '')

export function renderBody(catalog) {
  const s = renderSections(catalog)
  return [
    block('extensions', s.extensions, '\n'),
    block('tables', s.tables),
    block('indexes', s.indexes, '\n'),
    block('foreign keys', s.foreignKeys),
    block('functions', s.functions),
    block('triggers', s.triggers),
    block('row level security and policies', s.security),
    block('data api grants', s.grants, '\n'),
    block('storage buckets and policies', s.storage),
    block('schema_version history', s.versions),
  ]
    .filter(Boolean)
    .join('\n')
}

export function renderStorageDefinitions(catalog, headerLines = []) {
  const s = renderSections(catalog)
  return [...headerLines, '', block('storage buckets and policies', s.storage)].join('\n')
}

export function renderSchema(catalog, headerLines) {
  return headerLines.join('\n') + '\n\n' + renderBody(catalog)
}

export function currentSchemaVersion(catalog) {
  return renderSections(catalog).currentVersion
}

export function snapshotHeader(version) {
  return [
    '-- Holiday Planner database schema: CURRENT STATE (generated file, do not edit by hand)',
    '--',
    '-- Regenerate from the live database:   node scripts/gen-schema.mjs',
    '-- Check it is up to date:              node scripts/gen-schema.mjs --check',
    '-- (needs HPA_DB_URL in .env and psql on PATH; see docs/backup-and-restore.md)',
    '--',
    '-- This file shows what is live; it is not how to change it. Schema changes use',
    '-- migration files in supabase/migrations/:',
    '--   1. Back up first:  node scripts/backup.mjs pre-v<N>   (or: go backup hpa pre-v<N>)',
    '--   2. Write supabase/migrations/<yyyymmddhhmmss>_<name>.sql and apply it with',
    '--      apply_migration. The migration inserts its own schema_version row (next number)',
    '--      and, for a new table, its Data API grants (from 30 Oct 2026 Supabase no longer',
    '--      grants them automatically).',
    '--   3. Regenerate this file:  node scripts/gen-schema.mjs',
    '--',
    `-- Current schema_version: ${version}`,
    '-- Safe to run against an empty Supabase project (idempotent). Row data is not in this',
    '-- file: restore it from a backup dump (docs/backup-and-restore.md).',
  ]
}
