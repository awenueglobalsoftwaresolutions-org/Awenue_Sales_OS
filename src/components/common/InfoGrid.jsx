export default function InfoGrid({ items }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs font-medium text-ink-500">{label}</dt>
          <dd className="mt-0.5 break-words text-sm">{value || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
