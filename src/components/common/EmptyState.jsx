import { EmptyIllustration } from './Graphics'

export default function EmptyState({ icon: Icon, illustration, title, description, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center animate-fade-up">
      {illustration
        ? <EmptyIllustration type={illustration} className="mb-3 h-28 w-36" />
        : Icon && (
          <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-500 ring-1 ring-brand-100">
            <Icon className="h-7 w-7" aria-hidden />
          </div>
        )}
      <p className="text-sm font-semibold text-ink-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
