// Time zone helpers. The database stores UTC; people read and enter times in their own zone.
export const validTz = (tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false } }
export const safeTz = (tz) => (tz && validTz(tz) ? tz : 'UTC')

function offsetMs(utcMs, tz) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs))
  const g = (t) => Number(p.find((x) => x.type === t).value)
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(utcMs / 1000) * 1000
}

// "2026-11-15" + "09:30" as wall-clock time in `tz` -> the exact UTC instant.
export function zonedToUtc(dateStr, timeStr = '00:00', tz = 'UTC') {
  const [y, m, d] = dateStr.split('-').map(Number); const [hh, mm] = timeStr.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const first = guess - offsetMs(guess, tz)
  return new Date(guess - offsetMs(first, tz))                       // second pass settles daylight-saving edges
}
export const addDays = (dateStr, n) => { const [y, m, d] = dateStr.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }

const fmt = (iso, tz, opts) => (iso ? new Intl.DateTimeFormat('en-GB', { timeZone: safeTz(tz), ...opts }).format(new Date(iso)) : '—')
export const fmtDateTz = (iso, tz) => fmt(iso, tz, { day: '2-digit', month: 'short', year: 'numeric' })
export const fmtTimeTz = (iso, tz) => fmt(iso, tz, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
export const fmtDateTimeTz = (iso, tz) => (iso ? `${fmtDateTz(iso, tz)}, ${fmtTimeTz(iso, tz)}` : '—')
export const todayIn = (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: safeTz(tz) }).format(new Date())   // yyyy-mm-dd
