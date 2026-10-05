// Helpers shared by scripts/backup.mjs and scripts/restore-storage.mjs.

import os from 'node:os'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

export const BUCKETS = ['documents', 'itineraries']

export const DEFAULT_BACKUP_DIR = path.join(os.homedir(), 'OneDrive', 'Sync', 'Programs', 'HolidayPlannerApp')

export function backupDir() {
  return process.env.HPA_BACKUP_DIR || DEFAULT_BACKUP_DIR
}

// Logs live with the other apps' logs, not in the backup folder.
export const DEFAULT_LOG_DIR = path.join(os.homedir(), 'OneDrive', 'Sync', 'Programs', 'Logs', 'Holiday-Planner-App')

export function logDir() {
  return process.env.HPA_LOG_DIR || DEFAULT_LOG_DIR
}

// Windows-illegal characters (and %, so decoding is unambiguous) are written
// as %XX; a trailing dot or space is encoded too. Object paths the app
// generates never need this, but a mirror must not fail on an odd name.
export function encodeSegment(segment) {
  if (segment === '.' || segment === '..' || segment === '') throw new Error(`Unsafe storage path segment: "${segment}"`)
  const encoded = segment.replace(/[<>:"|?*\\%\x00-\x1f]/g, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase())
  return encoded.replace(/[. ]$/, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

export const decodeSegment = (segment) => decodeURIComponent(segment)

export const localPathFor = (base, bucket, objectPath) =>
  path.join(base, 'storage', bucket, ...objectPath.split('/').map(encodeSegment))

export const extractStoragePath = (url, bucket) => {
  const marker = `/storage/v1/object/public/${bucket}/`
  const idx = (url ?? '').indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(url.slice(idx + marker.length).split('?')[0])
}

export async function signIn() {
  const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: anonKey, GEOCODE_EMAIL: email, GEOCODE_PASSWORD: password } = process.env
  const missing = Object.entries({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: anonKey, GEOCODE_EMAIL: email, GEOCODE_PASSWORD: password })
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length) throw new Error(`Missing in .env: ${missing.join(', ')}`)
  const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Sign-in failed: ${error.message}`)
  return supabase
}

// Every object in a bucket, folders walked recursively: [{ path, size, updatedAt }].
export async function listAll(supabase, bucket, prefix = '') {
  const found = []
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw new Error(`Listing ${bucket}/${prefix}: ${error.message}`)
    for (const item of data) {
      const objectPath = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id === null || item.metadata === null) {
        found.push(...(await listAll(supabase, bucket, objectPath)))
      } else {
        found.push({ path: objectPath, size: item.metadata?.size ?? null, updatedAt: item.updated_at ?? item.metadata?.lastModified ?? null })
      }
    }
    if (data.length < 100) break
  }
  return found
}
