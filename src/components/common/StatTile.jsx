import { Link } from 'react-router-dom'

const TONES = {
  brand: { bg: 'bg-brand-50', text: 'text-brand-600', ring: 'ring-brand-100' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-100' },
  sky: { bg: 'bg-sky-50', text: 'text-sky-600', ring: 'ring-sky-100' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600', ring: 'ring-amber-100' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-600', ring: 'ring-rose-100' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-600', ring: 'ring-violet-100' },
  red: { bg: 'bg-red-50', text: 'text-red-600', ring: 'ring-red-100' },
}

export default function StatTile({ icon: Icon, label, value, sub, to, onClick, tone = 'brand', danger = false }) {
  const t = danger ? TONES.red : (TONES[tone] || TONES.brand)
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-ink-500">{label}</p>
          <p className={`mt-1 break-words text-lg font-bold leading-tight tracking-tight sm:text-xl ${danger ? 'text-red-600' : 'text-ink-900'}`}>
            {value ?? '—'}
          </p>
        </div>
        {Icon && (
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ${t.bg} ${t.text} ${t.ring}`}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        )}
      </div>
      {sub && <p className={`mt-1.5 truncate text-[11px] font-medium ${danger ? 'text-red-600' : 'text-ink-500'}`}>{sub}</p>}
    </>
  )

  const cls = 'group block w-full rounded-2xl border border-ink-100 bg-white p-3.5 text-left shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card-hover'
  if (to) return <Link to={to} className={cls}>{content}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{content}</button>
  return <div className={cls}>{content}</div>
}

