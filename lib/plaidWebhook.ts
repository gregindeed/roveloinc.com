import 'server-only'

// ── Plaid webhook verification (ES256 JWT) ───────────────────────────────────
// Plaid signs every webhook with a JWT in the `Plaid-Verification` header. We
// verify: (1) the signature against Plaid's published public key, (2) that the
// body hash in the token matches the actual request body (tamper check), and
// (3) that the token isn't stale (replay guard). Edge-safe: Web Crypto only, no
// SDK. Docs: https://plaid.com/docs/api/webhooks/webhook-verification/

const PLAID_BASE = () =>
  (process.env.PLAID_ENV ?? 'sandbox').toLowerCase() === 'production'
    ? 'https://production.plaid.com'
    : 'https://sandbox.plaid.com'

type Jwk = { kty?: string; crv?: string; x?: string; y?: string }

// Verification keys rarely change; cache the imported CryptoKey per key id.
const keyCache = new Map<string, CryptoKey>()

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

function b64urlToString(s: string): string {
  return new TextDecoder().decode(b64urlToBytes(s))
}

function bytesToHex(bytes: Uint8Array): string {
  let h = ''
  for (const b of bytes) h += b.toString(16).padStart(2, '0')
  return h
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return bytesToHex(new Uint8Array(digest))
}

async function getVerificationKey(kid: string): Promise<CryptoKey | null> {
  const cached = keyCache.get(kid)
  if (cached) return cached

  const client_id = process.env.PLAID_CLIENT_ID
  const secret = process.env.PLAID_SECRET
  if (!client_id || !secret) return null

  const res = await fetch(`${PLAID_BASE()}/webhook_verification_key/get`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id, secret, key_id: kid }),
  })
  if (!res.ok) return null

  const data = (await res.json()) as { key?: Jwk }
  const jwk = data.key
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) return null

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  )
  keyCache.set(kid, key)
  return key
}

// True only if the JWT is validly signed by Plaid, its claimed body hash matches
// the raw request body, and it was issued within the last 5 minutes.
export async function verifyPlaidWebhook(rawBody: string, jwt: string | null): Promise<boolean> {
  if (!jwt) return false
  const parts = jwt.split('.')
  if (parts.length !== 3) return false
  const [headerB64, payloadB64, sigB64] = parts

  let header: { alg?: string; kid?: string }
  let payload: { iat?: number; request_body_sha256?: string }
  try {
    header = JSON.parse(b64urlToString(headerB64))
    payload = JSON.parse(b64urlToString(payloadB64))
  } catch {
    return false
  }
  if (header.alg !== 'ES256' || !header.kid) return false

  const key = await getVerificationKey(header.kid)
  if (!key) return false

  // 1) Signature over `header.payload`. JOSE ES256 signatures are raw r||s (64
  //    bytes) — exactly what Web Crypto's ECDSA verify expects.
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  const sig = b64urlToBytes(sigB64)
  let signatureOk = false
  try {
    signatureOk = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, signingInput)
  } catch {
    signatureOk = false
  }
  if (!signatureOk) return false

  // 2) Body integrity — the token pins the sha256 of the request body.
  if (!payload.request_body_sha256) return false
  if ((await sha256Hex(rawBody)) !== payload.request_body_sha256) return false

  // 3) Replay guard — reject tokens older than 5 minutes (small negative skew ok).
  if (typeof payload.iat !== 'number') return false
  const ageSec = Math.floor(Date.now() / 1000) - payload.iat
  if (ageSec > 300 || ageSec < -60) return false

  return true
}
