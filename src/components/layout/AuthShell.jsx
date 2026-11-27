import { isSupabaseConfigured } from '../../lib/supabase'
import { AuthBackdropArt } from '../common/Graphics'

export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-ink-50 px-4 py-10">
      <AuthBackdropArt />
      <div className="relative z-10 w-full max-w-sm animate-fade-up">
        <div className="mb-7 flex items-center gap-3">
          <img
            src="/brand/awenue-mark.webp"
            alt="Awenue"
            width="44"
            height="44"
            className="h-11 w-11 object-contain"
          />
          <div className="leading-tight">
            <p className="font-bold text-ink-900">Awenue Sales OS</p>
            <p className="text-xs text-ink-500">Global Software Solutions</p>
          </div>
        </div>
        <div className="rounded-2xl border border-ink-100 bg-white/95 p-6 shadow-pop backdrop-blur-sm">
          <h1 className="text-xl font-bold text-ink-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
          {!isSupabaseConfigured && (
            <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
              Supabase isn't configured. Copy <code>.env.example</code> to <code>.env</code> and add your project URL and anon key, then restart the dev server.
            </p>
          )}
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  )
}
