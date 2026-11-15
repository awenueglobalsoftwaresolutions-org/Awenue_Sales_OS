import { useEffect, useState } from 'react'
import { friendlyError } from '../lib/errors'

// fn must return a promise; deps decide when to refetch. reload() forces a refetch.
export function useFetch(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let off = false
    setState((s) => ({ ...s, loading: true, error: null }))
    fn().then((data) => { if (!off) setState({ data, loading: false, error: null }) })
        .catch((e) => { if (!off) setState({ data: null, loading: false, error: friendlyError(e) }) })
    return () => { off = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { ...state, reload: () => setTick((t) => t + 1) }
}
