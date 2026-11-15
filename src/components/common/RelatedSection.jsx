import Spinner from './Spinner'
import ErrorState from './ErrorState'

// state = result of useFetch returning an array; children = (row) => <li key=...>
export default function RelatedSection({ title, state, empty, children }) {
  return (
    <section className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
      <h2 className="mb-3 text-sm font-semibold">{title}{state.data && <span className="ml-1 font-normal text-ink-500">({state.data.length})</span>}</h2>
      {state.loading && !state.data ? <Spinner className="py-4" />
        : state.error ? <ErrorState message={state.error} onRetry={state.reload} />
        : !state.data?.length ? <p className="text-sm text-ink-500">{empty}</p>
        : <ul className="divide-y divide-ink-100">{state.data.map(children)}</ul>}
    </section>
  )
}
