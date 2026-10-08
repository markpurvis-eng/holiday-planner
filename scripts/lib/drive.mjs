// Minimal Google Drive client for scripts/migrate-drive-documents.mjs: signs in as a
// service account (RS256 JWT, built with node:crypto, so no extra package) and wraps the
// three Drive v3 calls the migration needs. The key file is read, never logged.

import fs from 'node:fs'
import crypto from 'node:crypto'

const SCOPE = 'https://www.googleapis.com/auth/drive'
const API = 'https://www.googleapis.com/drive/v3'
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function loadServiceAccountKey(file = process.env.GOOGLE_SA_KEY_FILE) {
  if (!file) throw new Error('GOOGLE_SA_KEY_FILE is not set in .env (path to the service account key .json).')
  let key
  try {
    key = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    throw new Error(`Cannot read the service account key at ${file}: ${err.code ?? err.message}`)
  }
  if (key.type !== 'service_account' || !key.client_email || !key.private_key) {
    throw new Error(`${file} is not a service account key file (expected type, client_email and private_key).`)
  }
  return key
}

export async function getAccessToken(key) {
  const now = Math.floor(Date.now() / 1000)
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const uri = key.token_uri || DEFAULT_TOKEN_URI
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: key.client_email, scope: SCOPE, aud: uri, iat: now, exp: now + 3600 })}`
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(key.private_key).toString('base64url')
  const res = await fetch(uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(30000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) {
    throw new Error(`Google sign-in failed (${res.status}): ${body.error_description ?? body.error ?? 'no detail'}. If it says invalid_grant, the key may have been revoked or this PC's clock is wrong.`)
  }
  return body.access_token
}

export function createDriveClient(token) {
  async function call(url, init = {}) {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(url, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(120000),
      })
      if (res.ok) return res
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        await sleep(2000 * attempt)
        continue
      }
      let detail = ''
      try {
        detail = (await res.json()).error?.message ?? ''
      } catch {
        // not JSON
      }
      const err = new Error(`Drive ${res.status}${detail ? `: ${detail}` : ''}`)
      err.status = res.status
      throw err
    }
  }

  const fileUrl = (id, query) => `${API}/files/${encodeURIComponent(id)}?supportsAllDrives=true${query}`

  return {
    async getFile(id) {
      const fields = 'id,name,mimeType,size,md5Checksum,trashed,capabilities(canTrash,canDownload)'
      return (await call(fileUrl(id, `&fields=${encodeURIComponent(fields)}`))).json()
    },
    async download(id) {
      return Buffer.from(await (await call(fileUrl(id, '&alt=media'))).arrayBuffer())
    },
    async trash(id) {
      await call(fileUrl(id, '&fields=id'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      })
    },
  }
}
