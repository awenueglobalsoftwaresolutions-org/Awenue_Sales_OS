import { Link } from 'react-router-dom'

const TONES = {
  brand: {
    icon: 'bg-brand-50 text-brand-600 ring-brand-200/80',
    border: 'border-brand-200/80 hover:border-brand-300',
    bar: 'bg-brand-500',
  },
  amber: {
    icon: 'bg-amber-50 text-amber-600 ring-amber-200/80',
    border: 'border-amber-200/80 hover:border-amber-300',
    bar: 'bg-amber-500',
  },
  sky: {
    icon: 'bg-sky-50 text-sky-600 ring-sky-200/80',
    border: 'border-sky-200/80 hover:border-sky-300',
    bar: 'bg-sky-500',
  },
  emerald: {
    icon: 'bg-emerald-50 text-emerald-600 ring-emerald-200/80',
    border: 'border-emerald-200/80 hover:border-emerald-300',
    bar: 'bg-emerald-500',
  },
  violet: {
    icon: 'bg-violet-50 text-violet-600 ring-violet-200/80',
    border: 'border-violet-200/80 hover:border-violet-300',
    bar: 'bg-violet-500',
  },
  red: {
    icon: 'bg-red-50 text-red-600 ring-red-200/80',
    border: 'border-red-200/80 hover:border-red-300',
    bar: 'bg-red-500',
  },
}

export default function StatTile({ icon: Icon, label, value, sub, to, onClick, tone = 'brand', danger = false }) {
  const t = danger ? TONES.red : (TONES[tone] || TONES.brand)
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-ink-500 sm:text-xs">{label}</p>
          <p className={`mt-0.5 break-words text-xl font-bold tabular-nums tracking-tight sm:mt-1 sm:text-2xl ${danger ? 'text-red-600' : 'text-ink-900'}`}>
            {value ?? '—'}
          </p>
        </div>
        {Icon && (
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ring-1 transition group-hover:scale-105 sm:h-9 sm:w-9 ${t.icon}`}>
            <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5" aria-hidden />
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        {sub && <p className={`truncate text-[10px] font-medium sm:text-[11px] ${danger ? 'text-red-600' : 'text-ink-500'}`}>{sub}</p>}
        <span className={`h-1.5 w-6 rounded-full ${t.bar}`} aria-hidden />
      </div>
    </>
  )

  const cls = `group block w-full rounded-2xl border ${t.border} bg-white p-3.5 sm:p-4 text-left shadow-card transition duration-150 hover:-translate-y-0.5 hover:shadow-card-hover`
  if (to) return <Link to={to} className={cls}>{content}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{content}</button>
  return <div className={cls}>{content}</div>
}

