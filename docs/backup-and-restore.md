# Backup, restore and schema changes

The Supabase project is on the Free plan: no automatic backups and no point-in-time
recovery. These scripts are the backup. They cover the database and the Storage files
(uploaded documents and shared itinerary PDFs), because deleting a trip removes the
database rows by cascade but Storage files are handled separately.

## What a backup holds

Everything lands under the backup folder, by default
`C:\Users\markp\OneDrive\Sync\Programs\HolidayPlannerApp` (OneDrive syncs it off the
laptop). Change it with `HPA_BACKUP_DIR` in `.env`.

| Path | Contents |
|---|---|
| `db\<yyyy-mm-dd_hhmmss>[_label]\public.sql` | `pg_dump` of the `public` schema WITH data (schema, rows, RLS, policies, grants, trigger) |
| `db\...\schema-snapshot.sql` | the live schema as idempotent SQL (what `supabase\schema.sql` shows) |
| `db\...\storage-definitions.sql` | the `documents` and `itineraries` buckets and their policies |
| `db\...\manifest.json` | row counts (dump vs what the app sees), schema_version, orphan report, warnings |
| `storage\documents\...`, `storage\itineraries\...` | mirror of every Storage file; downloads new and changed files only; never deletes |
| `backup.log` | one line per step, including scheduled runs |

Not covered: the Supabase Auth user (recreate it, see the restore steps), project
settings, and the Netlify environment variables.

## One-time setup (laptop or PC)

1. Add these to `.env` (it is gitignored; `.env.example` lists them):
   - `HPA_DB_URL`: the Postgres connection string, the same one `go dump` has used
     (Supabase, Connect, session pooler). Put it in quotes if the password contains `#`.
   - `GEOCODE_EMAIL` and `GEOCODE_PASSWORD`: the household login (already there for
     `geocode-pins.mjs`). The backup signs in with it to list and download Storage files.
   - Optional: `HPA_BACKUP_DIR`, `HPA_BACKUP_KEEP` (default 8), `HPA_PG_BIN`.
2. Tools: Node 20.12 or newer, and the PostgreSQL command line tools (`pg_dump` and
   `psql`). `pg_dump` must be the same major version as the Supabase server or newer
   (Supabase currently runs Postgres 17). If they are not on PATH, set `HPA_PG_BIN` to
   their folder, for example `C:\Program Files\PostgreSQL\17\bin`.
3. Once `HPA_DB_URL` is in `.env`, delete the `DumpConnection` line (it holds the
   password in plain text) from `go.ps1`. `go dump` reads `.env` first.
4. Try it: `go backup hpa first-test`, then look in the backup folder.

No reboot or restart is needed. If you change PATH, open a new PowerShell window.

## Taking a backup

```powershell
go backup hpa pre-v4          # labelled: kept forever. Use before every schema change.
go backup hpa                 # unlabelled: pruned to the newest 8
node scripts\backup.mjs pre-v4 --db-only        # same thing without go; also --storage-only, --no-prune
```

What to read in the output:

- `Database: done. schema_version 3, 10 tables, N rows`: the dump worked.
- `WARNING: <table>: dump holds X rows but the app sees Y`: rows changed during the
  dump, or the dump is incomplete. Run it again.
- `Storage: <bucket>: N files; A new/changed, B unchanged, C failed`
- `orphan check`: lists Storage files with no `document` row and `document` rows whose
  file is missing. It reports only; nothing is deleted. Decide what to do with them yourself.
- The script exits non-zero (and says `FAILED`) if the dump or any download failed.

## Scheduling it (Windows Task Scheduler)

Set it up on one machine only, the one that is on most often.

1. Task Scheduler, Create Task (not Basic Task). Name: `Holiday Planner backup`.
2. General: leave "Run only when user is logged on" selected.
3. Triggers: New, Weekly, Sunday, 03:00.
4. Actions: New, Start a program.
   - Program/script: `node` (or the full path, `C:\Program Files\nodejs\node.exe`)
   - Add arguments: `"C:\Users\markp\Programs\Src\Holiday Planner App\holiday-planner\scripts\backup.mjs"`
   - Start in: `C:\Users\markp\Programs\Src\Holiday Planner App\holiday-planner`
5. Conditions: tick "Start only if the following network connection is available: Any
   connection". Settings: tick "Run task as soon as possible after a scheduled start is
   missed".
6. OK, then right-click the task, Run, and check `backup.log` and the new folder.

Leave the scheduled run unlabelled so old ones are pruned.

## Changing the schema

1. Back up: `go backup hpa pre-v<N>` (N = the new schema_version). Check it finishes OK.
2. Apply the change with Claude's `apply_migration`, and save the same SQL as
   `supabase\migrations\<version>_<name>.sql`, where `<version>` is the 14-digit number
   Supabase records (see `list_migrations`). The SQL must also:
   - insert its own `schema_version` row (next number);
   - for a new table, include the Data API grants (from 30 Oct 2026 Supabase no longer
     grants them automatically) and enable RLS with a policy;
   - leave `trip` and `todo` alone unless the weekly to-do email task is updated too.
3. Regenerate the snapshot: `go schema hpa` (or `node scripts\gen-schema.mjs`). Then
   `node scripts\gen-schema.mjs --check` should say it is up to date.

`supabase\migrations\20261004200000_baseline.sql` is the schema as it stood at
schema_version 3. It was never applied to the live project (live already matched it).
It exists to rebuild an empty project: run it first, then later migrations in filename order.

## Restoring

First, take a backup of the current state (`go backup hpa before-restore`) even if it
looks broken.

### A. Recover some lost rows

Do not restore over the live project. Restore the dump into a throwaway database
(a local Postgres, or a second free Supabase project), look at the rows there, and copy
back only what is missing:

```powershell
psql "<scratch connection string>" -f "<backup folder>\public.sql"
psql "<scratch connection string>" -c "\copy (select * from booking where trip_id = '<id>') to 'rows.csv' csv header"
psql "<live connection string>"    -c "\copy booking from 'rows.csv' csv header"
```

Copy parents before children (trip, then booking, then the rows that reference it).
`trip` inserts fire the photos-link trigger, so restore `link` rows only if the trip's
`photos` link is missing.

### B. Rebuild the whole project (new Supabase project)

1. Create the new project (same region). Note its URL, anon key and connection string.
2. Authentication, Users, Add user: recreate the household login (same email), auto-confirmed.
3. Restore the database. Expect exactly one error, `schema "public" already exists`:

   ```powershell
   psql "<new connection string>" -f "<backup folder>\public.sql"
   psql "<new connection string>" -f "<backup folder>\storage-definitions.sql"
   ```

   The dump creates the trigger after loading the rows, so trips do not get a second
   photos link.
4. Restore the files. Point `.env` at the new project (`VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`, same household login), then:

   ```powershell
   node scripts\restore-storage.mjs --dry-run
   node scripts\restore-storage.mjs
   ```

   It uploads files that are missing, never overwrites (unless `--overwrite`) and never deletes.
5. Fix the stored file addresses. `document.file_url` holds full public URLs that include
   the old project reference (`slvfndnupgchafeltqpq`). Run once, with the new reference:

   ```sql
   update public.document
   set file_url = replace(file_url, 'https://slvfndnupgchafeltqpq.supabase.co', 'https://<new-ref>.supabase.co')
   where file_url like 'https://slvfndnupgchafeltqpq.supabase.co/%';
   ```
6. Point everything at the new project: the Netlify variables `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (then redeploy), `.env`, `HPA_DB_URL`, and the weekly to-do
   email scheduled task, which queries the project directly.
7. Check: `select max(version) from schema_version` matches `manifest.json`; row counts
   match `api_rows` in the manifest; the app loads; a document opens; regenerate a shared itinerary.

### Tested

On 4 Oct 2026 a backup of a scratch database was restored into an empty database exactly
as in step 3: row counts matched, the schema matched the original, and the trigger added
no duplicate links. The scheduled-task and new-project steps (2, 5 to 7) have not been
rehearsed; doing one real restore into a second free Supabase project is worthwhile.
