import { useCallback, useEffect, useState } from 'react'
import { useDebounce } from './useDebounce'
import { friendlyError } from '../lib/errors'
import { PAGE_SIZE } from '../lib/query'

// Owns paging, search, filters and sorting for a list screen. fetcher({page,pageSize,search,filters,sort}) -> {rows,total}
export function useListQuery(fetcher, { initialSort, initialFilters = {}, pageSize = PAGE_SIZE }) {
  const [page, setPage] = useState(1)
  const [search, setSearchRaw] = useState('')
  const [filters, setFilters] = useState(initialFilters)
  const [sort, setSort] = useState(initialSort)
  const [tick, setTick] = useState(0)
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: null })
  const debounced = useDebounce(search, 300)

  useEffect(() => {
    let off = false
    setState((s) => ({ ...s, loading: true, error: null }))
    fetcher({ page, pageSize, search: debounced, filters, sort })
      .then(({ rows, total }) => { if (!off) setState({ rows, total, loading: false, error: null }) })
      .catch((e) => { if (!off) setState((s) => ({ ...s, loading: false, error: friendlyError(e) })) })
    return () => { off = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, debounced, filters, sort, tick])

  const setSearch = useCallback((v) => { setSearchRaw(v); setPage(1) }, [])
  const setFilter = useCallback((k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1) }, [])
  const toggleSort = useCallback((key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'created_at' ? 'desc' : 'asc' }))
    setPage(1)
  }, [])
  const clearFilters = useCallback(() => { setFilters(initialFilters); setSearchRaw(''); setPage(1) }, [initialFilters])
  const isFiltered = Boolean(search) || Object.values(filters).some(Boolean)

  // If the last row on a page is deleted, step back a page.
  useEffect(() => { if (!state.loading && !state.rows.length && page > 1) setPage((p) => p - 1) }, [state.loading, state.rows.length, page])

  return { ...state, page, setPage, pageSize, search, setSearch, filters, setFilter, sort, toggleSort, clearFilters, isFiltered, reload: () => setTick((t) => t + 1) }
}
