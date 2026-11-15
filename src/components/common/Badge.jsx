const TONES = {
  gray: 'bg-ink-100 text-ink-700', blue: 'bg-sky-50 text-sky-700', indigo: 'bg-brand-50 text-brand-700',
  green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-700',
}
export default function Badge({ tone = 'gray', children }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>
}
