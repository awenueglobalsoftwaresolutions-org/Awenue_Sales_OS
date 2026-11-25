import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Search } from 'lucide-react'
import { useDebounce } from '../../hooks/useDebounce'
import { useClickOutside } from '../../hooks/useClickOutside'
import { friendlyError } from '../../lib/errors'
import { globalSearch } from '../../services/search'
import Badge from '../common/Badge'

const TONE = { Lead: 'blue', Organization: 'indigo', Contact: 'green', Deal: 'amber' }

export default function GlobalSearch() {
  const navigate = useNavigate()
  const wrap = useRef(null)
  const reqId = useRef(0)
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const [state, setState] = useState({ results: [], loading: false, error: '' })
  const [active, setActive] = useState(0)
  const debounced = useDebounce(term, 250)
  useClickOutside(wrap, () => setOpen(false), open)

  useEffect(() => {
    const id = ++reqId.current
    if (debounced.trim().length < 2) { setState({ results: [], loading: false, error: '' }); return }
    setState((s) => ({ ...s, loading: true, error: '' }))
    globalSearch(debounced)
      .then((results) => { if (id === reqId.current) { setState({ results, loading: false, error: '' }); setActive(0) } })
      .catch((e) => { if (id === reqId.current) setState({ results: [], loading: false, error: friendlyError(e) }) })
  }, [debounced])

  const go = (r) => { setOpen(false); setTerm(''); navigate(r.to) }
  const onKey = (e) => {
    const n = state.results.length
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); setActive((a) => (a + 1) % n) }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); setActive((a) => (a - 1 + n) % n) }
    else if (e.key === 'Enter' && n) { e.preventDefault(); go(state.results[active]) }
  }
  const short = term.trim().length < 2
  const showPanel = open && term.length > 0

  return (
    <div ref={wrap} className="relative min-w-0 max-w-md flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 sm:left-3.5" aria-hidden />
      <input
        className="input !rounded-xl !bg-ink-50/70 !pl-9 !pr-3 focus:!bg-white sm:!pl-10 sm:!pr-16"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="global-search-results"
        aria-label="Global search"
        placeholder="Search leads, organizations, contacts, deals"
        value={term}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        onChange={(e) => { setTerm(e.target.value); setOpen(true) }}
      />
      {state.loading
        ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-brand-500" aria-hidden />
        : !term && <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-ink-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink-400 sm:inline-block">Ctrl K</kbd>}
      {showPanel && (
        <div id="global-search-results" role="listbox" className="absolute left-0 right-0 z-50 mt-2 max-h-[70vh] animate-fade-up overflow-y-auto rounded-2xl border border-ink-100 bg-white p-1.5 shadow-pop">
          {short ? <p className="px-3 py-4 text-sm text-ink-500">Type at least 2 characters.</p>
            : state.error ? <p role="alert" className="px-3 py-4 text-sm text-red-700">{state.error}</p>
            : !state.results.length && !state.loading ? <p className="px-3 py-4 text-sm text-ink-500">No results for “{term.trim()}”.</p>
            : state.results.map((r, i) => (
              <button key={`${r.type}-${r.id}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => go(r)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${i === active ? 'bg-brand-50' : ''}`}>
                <span className="w-24 shrink-0"><Badge tone={TONE[r.type]}>{r.type}</Badge></span>
                <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink-900">{r.title}</span>{r.subtitle && <span className="block truncate text-xs text-ink-500">{r.subtitle}</span>}</span>
              </button>))}
        </div>
      )}
    </div>
  )
}
