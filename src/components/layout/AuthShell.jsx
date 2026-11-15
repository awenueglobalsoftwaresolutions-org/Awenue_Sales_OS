import { isSupabaseConfigured } from '../../lib/supabase'

export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="grid min-h-screen place-items-center bg-ink-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-lg font-bold text-white" aria-hidden>A</div>
          <div className="leading-tight"><p className="font-bold">Awenue Sales OS</p><p className="text-xs text-ink-500">Global Software Solutions</p></div>
        </div>
        <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-card">
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
          {!isSupabaseConfigured && (
            <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              Supabase isn't configured. Copy <code>.env.example</code> to <code>.env</code> and add your project URL and anon key, then restart the dev server.
            </p>
          )}
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  )
}
