export default function Avatar({ person, size = 36, className = '' }) {
  const name = person?.full_name || person?.email || '?'
  const initials = name.split(/[\s@]/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('')
  const style = { width: size, height: size, fontSize: size * 0.36 }
  return person?.avatar_url
    ? <img src={person.avatar_url} alt="" style={style} className={`shrink-0 rounded-full object-cover ${className}`} />
    : <span style={style} aria-hidden className={`grid shrink-0 place-items-center rounded-full bg-brand-100 font-bold text-brand-700 ${className}`}>{initials}</span>
}
