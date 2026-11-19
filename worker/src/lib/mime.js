// RFC 2822 / MIME construction for Gmail's send API. Headers are cleaned of line breaks, non-ASCII text is encoded, and lines are wrapped.
const enc = new TextEncoder()

export const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s) }
export const unb64 = (s) => Uint8Array.from(atob(String(s).replace(/\s+/g, '')), (c) => c.charCodeAt(0))
export const base64url = (bytes) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const cleanHeader = (v) => String(v ?? '').replace(/[\r\n\0]+/g, ' ').replace(/\s+/g, ' ').trim()
export function encodeWord(v) {
  const s = cleanHeader(v)
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(enc.encode(s))}?=`
}
export const wrap76 = (s) => s.replace(/(.{76})/g, '$1\r\n').replace(/\r\n$/, '')
export function formatAddress(name, email) {
  const n = cleanHeader(name)
  if (!n) return `<${email}>`
  const word = encodeWord(n)
  if (word !== n) return `${word} <${email}>`
  return /^[A-Za-z0-9 ]+$/.test(n) ? `${n} <${email}>` : `"${n.replace(/["\\]/g, '\\$&')}" <${email}>`
}
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export const htmlFromText = (t) => esc(t).replace(/\r?\n/g, '<br>\n')
const ctype = (t) => (/^[\w.+-]+\/[\w.+-]+$/.test(String(t || '')) ? t : 'application/octet-stream')
const fname = (n) => `filename*=UTF-8''${encodeURIComponent(cleanHeader(n) || 'attachment')}`

export function buildMessage({ from, to, cc = [], bcc = [], subject, text, attachments = [] }) {
  const altB = `alt_${crypto.randomUUID()}`
  const mixB = `mix_${crypto.randomUUID()}`
  const htmlDoc = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#14161f">${htmlFromText(text)}</body></html>`
  const alt = [
    `--${altB}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(b64(enc.encode(text))),
    `--${altB}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(b64(enc.encode(htmlDoc))),
    `--${altB}--`,
  ]
  const head = [`From: ${from}`, `To: ${to.map(cleanHeader).join(', ')}`]
  if (cc.length) head.push(`Cc: ${cc.map(cleanHeader).join(', ')}`)
  if (bcc.length) head.push(`Bcc: ${bcc.map(cleanHeader).join(', ')}`)
  head.push(`Subject: ${encodeWord(subject)}`, `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0')
  if (!attachments.length) return [...head, `Content-Type: multipart/alternative; boundary="${altB}"`, '', ...alt, ''].join('\r\n')
  const parts = [
    `--${mixB}`, `Content-Type: multipart/alternative; boundary="${altB}"`, '', ...alt,
    ...attachments.flatMap((a) => [`--${mixB}`, `Content-Type: ${ctype(a.type)}`, `Content-Disposition: attachment; ${fname(a.name)}`, 'Content-Transfer-Encoding: base64', '', wrap76(b64(a.bytes))]),
    `--${mixB}--`,
  ]
  return [...head, `Content-Type: multipart/mixed; boundary="${mixB}"`, '', ...parts, ''].join('\r\n')
}
