// Gmail refresh tokens are sealed with AES-256-GCM using a key held only as a Worker secret (TOKEN_ENCRYPTION_KEY, 64 hex characters).
import { HttpError } from './http.js'

const enc = new TextEncoder(), dec = new TextDecoder()
function keyBytes(hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex || '')) throw new HttpError(500, 'TOKEN_ENCRYPTION_KEY must be 64 hex characters. See the README.')
  return Uint8Array.from(hex.match(/../g), (h) => parseInt(h, 16))
}
const importKey = (hex, usage) => crypto.subtle.importKey('raw', keyBytes(hex), { name: 'AES-GCM' }, false, [usage])
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s) }
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export async function encryptSecret(plain, hex) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(hex, 'encrypt'), enc.encode(plain)))
  const out = new Uint8Array(iv.length + ct.length); out.set(iv); out.set(ct, iv.length)
  return b64(out)
}
export async function decryptSecret(token, hex) {
  const raw = unb64(token)
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await importKey(hex, 'decrypt'), raw.slice(12)))
}
