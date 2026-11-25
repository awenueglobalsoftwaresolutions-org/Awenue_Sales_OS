/**
 * Custom lightweight SVG illustrations & decorative graphics for empty states,
 * dashboard hero, and auth backdrop.
 */

export function EmptyIllustration({ type = 'default', className = 'h-28 w-36' }) {
  const palettes = {
    leads: { accent: '#5b5bd6', soft: '#eef2ff', mid: '#c7d2fe', badge: '#10b981' },
    deals: { accent: '#5b5bd6', soft: '#eef2ff', mid: '#c7d2fe', badge: '#f59e0b' },
    pipeline: { accent: '#4b4bc4', soft: '#eef2ff', mid: '#c7d2fe', badge: '#10b981' },
    contacts: { accent: '#0284c7', soft: '#e0f2fe', mid: '#bae6fd', badge: '#5b5bd6' },
    organizations: { accent: '#7c3aed', soft: '#f5f3ff', mid: '#ddd6fe', badge: '#0ea5e9' },
    tasks: { accent: '#10b981', soft: '#ecfdf5', mid: '#a7f3d0', badge: '#5b5bd6' },
    invoices: { accent: '#f59e0b', soft: '#fffbeb', mid: '#fde68a', badge: '#10b981' },
    activities: { accent: '#5b5bd6', soft: '#eef2ff', mid: '#c7d2fe', badge: '#ec4899' },
    reports: { accent: '#4b4bc4', soft: '#eef2ff', mid: '#c7d2fe', badge: '#10b981' },
    search: { accent: '#6b7185', soft: '#eceef3', mid: '#c9ccd6', badge: '#5b5bd6' },
    default: { accent: '#5b5bd6', soft: '#eef2ff', mid: '#c7d2fe', badge: '#10b981' },
  }
  const p = palettes[type] || palettes.default

  return (
    <svg viewBox="0 0 180 130" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      {/* Soft ambient blob */}
      <ellipse cx="90" cy="70" rx="68" ry="44" fill={p.soft} />
      <circle cx="34" cy="36" r="6" fill={p.mid} opacity="0.65" />
      <circle cx="148" cy="40" r="4" fill={p.badge} opacity="0.45" />
      <circle cx="142" cy="100" r="7" fill={p.mid} opacity="0.5" />

      {/* Back card */}
      <rect x="46" y="24" width="88" height="72" rx="10" fill="#ffffff" stroke={p.mid} strokeWidth="1.5" transform="rotate(-4 46 24)" />

      {/* Main card */}
      <rect x="44" y="30" width="92" height="70" rx="10" fill="#ffffff" stroke="#dfe2ea" strokeWidth="1.5" />
      <rect x="54" y="42" width="38" height="6" rx="3" fill={p.accent} opacity="0.85" />
      <rect x="54" y="54" width="66" height="5" rx="2.5" fill="#eceef3" />
      <rect x="54" y="64" width="52" height="5" rx="2.5" fill="#eceef3" />
      <rect x="54" y="74" width="60" height="5" rx="2.5" fill="#eceef3" />

      {/* Mini status pill */}
      <rect x="54" y="85" width="26" height="7" rx="3.5" fill={p.soft} />
      <circle cx="122" cy="86" r="11" fill={p.accent} />
      <path d="M118 86h8M122 82v8" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function DashboardHeroArt({ className = 'h-24 w-48' }) {
  return (
    <svg viewBox="0 0 220 110" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <rect x="14" y="18" width="192" height="82" rx="14" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.22)" />
      {/* Mini bars */}
      <rect x="34" y="64" width="14" height="22" rx="4" fill="rgba(255,255,255,0.35)" />
      <rect x="56" y="50" width="14" height="36" rx="4" fill="rgba(255,255,255,0.5)" />
      <rect x="78" y="56" width="14" height="30" rx="4" fill="rgba(255,255,255,0.4)" />
      <rect x="100" y="38" width="14" height="48" rx="4" fill="rgba(255,255,255,0.75)" />
      <rect x="122" y="44" width="14" height="42" rx="4" fill="rgba(255,255,255,0.55)" />
      <rect x="144" y="30" width="14" height="56" rx="4" fill="#ffffff" />
      {/* Trend line */}
      <path d="M41 58 L63 44 L85 50 L107 32 L129 38 L151 24 L176 28" stroke="#a5f3fc" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="151" cy="24" r="4" fill="#ffffff" stroke="#38bdf8" strokeWidth="2" />
      <circle cx="176" cy="28" r="4" fill="#34d399" />
    </svg>
  )
}

export function AuthBackdropArt() {
  return (
    <svg className="pointer-events-none fixed inset-0 h-full w-full opacity-45" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <pattern id="auth-grid" width="36" height="36" patternUnits="userSpaceOnUse">
          <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#dfe2ea" strokeWidth="0.7" />
        </pattern>
        <radialGradient id="auth-glow" cx="50%" cy="35%" r="55%">
          <stop offset="0%" stopColor="#e0e7ff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#f6f7fa" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#auth-grid)" />
      <rect width="100%" height="100%" fill="url(#auth-glow)" />
    </svg>
  )
}

