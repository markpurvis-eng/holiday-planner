# Moving documents from Google Drive into Supabase Storage

Roadmap #39, v1.39.0. Claude can't write to Supabase Storage, so when Mark hands Claude an
email attachment or a document, the file is staged in Google Drive and the `document` row
points at it (`drive_file_id` set, `file_url` = the Drive link). A script on Mark's PCs then
copies each staged file into the `documents` bucket and updates that same row, and a weekly
Claude scheduled task trashes the leftover Drive copies.

## What the script does

`scripts\migrate-drive-documents.mjs` finds `document` rows with `drive_file_id` set and
`migrated_at` empty. For each one it:

1. looks the file up in Drive by id (as a service account), and downloads it;
2. checks the size and Drive's own MD5 checksum against what it downloaded;
3. uploads it to `documents/drive-<document id>.<ext>` (same path every time, overwritten);
4. reads the bucket back and checks the stored size;
5. updates the row: `storage_path`, `migrated_at`, and `file_url` rewritten to the Storage
   URL, so the app needs no change. This only applies while `migrated_at` is still empty.

The Drive copy is left alone. The script has read-only access to Drive (the key's token
only has the `drive.readonly` scope), and in My Drive only the file's owner can trash it,
so the service account couldn't anyway. See "Tidying the Drive copies" below.

Any problem stops that row at that step. The row keeps working, still pointing at Drive,
and it is retried at the next check. Nothing is ever deleted. When no row is waiting it
exits straight away and doesn't need the Google key, so a PC without the key is harmless.

It is safe to run on two PCs at once (the fixed Storage path and the "only if
`migrated_at` is empty" update mean the second one changes nothing), and it skips itself
while a backup is running.

Until a row is migrated its link opens Drive: only Mark's Google account can open it
(Andi's shared login can't), the in-app PDF viewer isn't used and it isn't in the offline
cache. After migration it behaves like any uploaded document.

## One-time Google setup

1. console.cloud.google.com, signed in as mark.purvis@barbrookers.co.uk: create the project
   `holiday-planner-drive` and enable the **Google Drive API** (no billing needed).
2. IAM & Admin, Service Accounts: create `hpa-drive-migrator`, no project roles.
3. Keys, Add key, JSON: one key per PC, so one can be revoked on its own. If key creation
   is blocked, the organisation policy "Disable service account key creation" has to be
   overridden for this project (both the legacy `iam.disableServiceAccountKeyCreation` and
   the managed `iam.managed.disableServiceAccountKeyCreation` constraint can apply).
4. In Drive, share the folder **gmail attachments** with the service account's email
   address. **Viewer is enough** (the script only reads; Editor does not let it trash files
   owned by Mark). Claude must save staged files in that folder or a subfolder; the service
   account can't see anything else.

## Setting up each PC

1. `git pull`; Node 20.12 or newer; the usual `.env` (household login and Supabase values).
2. Create `C:\Users\markp\.hpa` and put that PC's key there as `drive-key.json`. Keep it out
   of OneDrive and out of the repo, and delete the copy in Downloads.
3. Add to `.env`: `GOOGLE_SA_KEY_FILE=C:\Users\markp\.hpa\drive-key.json`
4. Check access without changing anything:
   `node scripts\migrate-drive-documents.mjs --dry-run`
   Each waiting row should say which Drive file it found and where it would be copied.
5. Try one row for real: `node scripts\migrate-drive-documents.mjs --only <document id>`,
   then open that document in the app: it should open from Supabase Storage, not Drive.
6. Schedule it (below).

## Scheduling it (Windows Task Scheduler)

Same shape as the backup check, but on **each PC** that is used, and with no age limit: it
runs at every check and does nothing when nothing is waiting.

1. Task Scheduler, Create Task (not Basic Task). Name: `Holiday Planner Drive migration`.
2. General: leave "Run only when user is logged on" selected.
3. Triggers: New, Begin the task "At log on", Specific user (you). Tick "Delay task for"
   2 minutes. Tick "Repeat task every" 4 hours, "for a duration of" Indefinitely. Enabled.
4. Actions: New, Start a program.
   - Program/script: `C:\Program Files\nodejs\node.exe`
   - Add arguments: `"<repo>\scripts\migrate-drive-documents.mjs"`
   - Start in: `<repo>` (the repo folder on that PC)
5. Conditions: tick "Start only if the following network connection is available: Any
   connection"; on a laptop untick the AC power condition. Settings: tick "Run task as soon
   as possible after a scheduled start is missed"; if already running, "Do not start a new
   instance".
6. Right-click the task, Run, and check the log.

## Tidying the Drive copies

A Claude scheduled task, **Holiday Drive tidy**, runs weekly (Mondays, 08:15 UK) in the cloud
through Claude's Supabase and Google Drive connectors. It reads (never writes) the `document`
table for rows with `migrated_at` more than a day old and `drive_file_id` still set, checks
each Drive file is Mark's and sits in `gmail attachments` (or a subfolder), and moves it to
the Drive trash, where it stays recoverable for 30 days. It looks back 45 days, so a missed
week is caught up, and a file Mark restores from the trash within that window would be
trashed again. It only ever touches files that have a migrated row. Nothing else in Drive.

To tidy straight away, ask Claude in a session to "tidy the migrated Drive files", or trash
them by hand: the migration log lists each Drive file it has copied (`was <Drive link>`).

## Day to day

- **Log:** `...\OneDrive\Sync\Programs\Logs\Holiday-Planner-App\migrate-drive-<computer name>.log`
  (one file per PC, so OneDrive never has two PCs writing the same file).
- **Retries:** a failing row is tried up to `HPA_MIGRATE_MAX_ATTEMPTS` (5) times on that PC,
  then skipped with a warning in each run until you fix the cause and run with
  `--retry-failed`. Counts live in `%USERPROFILE%\.hpa\migrate-state.json`. A Google-native
  file (a Doc or Sheet) or one over `HPA_MIGRATE_MAX_MB` (40) is never retried.
- **Options:** `--dry-run`, `--only <id>`, `--retry-failed`. Exit code 0 = nothing to do or all done; 1 = a row failed or setup problem.

## When it says FAILED

- *Drive 404 (not found)*: the file isn't in a folder shared with the service account, or
  the id is wrong.
- *Drive 403 (no permission)*: the folder was shared as Viewer, or the sharing was removed.
- *Google sign-in failed ... invalid_grant*: the key was revoked or deleted, or the PC's
  clock is badly wrong.
- *Google-native file*: it is a Google Doc/Sheet, which can't be copied as is. Export it
  to PDF in Drive, upload that to the folder, and point the row at the new file.
- *checksum / size mismatch*, *upload failed*, *could not be verified*: nothing was changed
  on Drive or in the row. A half-finished upload can leave a file in the bucket that the
  backup's orphan report lists; the retry overwrites it.
