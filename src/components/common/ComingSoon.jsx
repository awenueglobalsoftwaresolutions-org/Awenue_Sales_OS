export default function ComingSoon({ title, phase, icon: Icon, children }) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-ink-300 bg-white px-6 py-16 text-center shadow-card">
        {Icon && <Icon className="mb-4 h-10 w-10 text-brand-500" aria-hidden />}
        <p className="text-base font-semibold">{title} is built in Phase {phase}</p>
        <p className="mt-1 max-w-md text-sm text-ink-500">{children ?? 'The route, layout and database tables are ready. The screens land in the next phase.'}</p>
      </div>
    </div>
  )
}
