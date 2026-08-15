import 'server-only'

// ── Secret-at-rest encryption (AES-256-GCM, edge-safe) ───────────────────────
// Used to encrypt Plaid access tokens before they touch the database. A stolen
// service-role key or a DB dump then yields ciphertext, not live bank
// credentials. Uses the Web Crypto API (global `crypto.subtle`), so it runs the
// same on Cloudflare Workers and Node — no SDK, matching our Plaid/Anthropic
// style.
//
// Key: PLAID_TOKEN_KEY, a 32-byte key as base64 or hex. Generate one with:
//   openssl rand -base64 32
// then set it as a Worker secret:
//   npx wrangler secret put PLAID_TOKEN_KEY
//
// Rollout is safe in either order:
//   • If the key is UNSET, encryptSecret returns plaintext (legacy behavior), so
//     deploying this code before setting the secret can't break bank connects.
//   • decryptSecret handles both: a value tagged 'v1:' is decrypted; anything
//     else is treated as a legacy plaintext token and returned as-is.
// Once the key is set, new tokens are encrypted; existing plaintext rows keep
// working. Do NOT rotate/lose the key while encrypted rows exist — reconnect the
// bank if you ever do.

const PREFIX = 'v1:'

function keyBytes(): Uint8Array<ArrayBuffer> | null {
  const raw = process.env.PLAID_TOKEN_KEY?.trim()
  if (!raw) return null

  let bytes: Uint8Array<ArrayBuffer> | null = null
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    // 32-byte hex
    bytes = new Uint8Array(32)
    for (let i = 0; i < 32; i++) bytes[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16)
  } else {
    try {
      bytes = b64decode(raw)
    } catch {
      bytes = null
    }
  }
  if (!bytes || bytes.length !== 32) {
    throw new Error('PLAID_TOKEN_KEY must decode to 32 bytes (base64 or 64-char hex).')
  }
  return bytes
}

function b64encode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function b64decode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

// True once PLAID_TOKEN_KEY is configured (tokens will be encrypted at rest).
export function isSecretEncryptionOn(): boolean {
  return !!process.env.PLAID_TOKEN_KEY
}

// Encrypt a secret for storage. No key set → returns the plaintext unchanged so
// the feature keeps working before the secret is provisioned.
export async function encryptSecret(plaintext: string): Promise<string> {
  const kb = keyBytes()
  if (!kb) return plaintext
  const key = await crypto.subtle.importKey('raw', kb, { name: 'AES-GCM' }, false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
  )
  return `${PREFIX}${b64encode(iv)}:${b64encode(ct)}`
}

// Decrypt a stored secret. Legacy plaintext (no 'v1:' tag) is returned as-is.
export async function decryptSecret(stored: string): Promise<string> {
  if (!stored || !stored.startsWith(PREFIX)) return stored
  const kb = keyBytes()
  if (!kb) throw new Error('PLAID_TOKEN_KEY is not set, but a stored token is encrypted.')
  const parts = stored.slice(PREFIX.length).split(':')
  if (parts.length !== 2) throw new Error('Malformed encrypted secret.')
  const key = await crypto.subtle.importKey('raw', kb, { name: 'AES-GCM' }, false, ['decrypt'])
  const iv = b64decode(parts[0])
  const ct = b64decode(parts[1])
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return new TextDecoder().decode(pt)
}
