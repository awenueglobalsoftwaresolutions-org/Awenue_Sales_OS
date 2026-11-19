import { useEffect, useRef, useState } from 'react'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useDebounce } from '../../hooks/useDebounce'

// An input that offers suggestions as you type. Arrow keys and Enter pick one; anything you type is still accepted as it is.
export default function Suggest({ value, onChange, load, onPick, renderItem, placeholder, ariaLabel, minChars = 2 }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [active, setActive] = useState(0)
  const wrap = useRef(null); const touched = useRef(false); const req = useRef(0)
  const debounced = useDebounce(value, 200)
  useClickOutside(wrap, () => setOpen(false), open)

  useEffect(() => {
    if (!touched.current) return
    const id = ++req.current
    if ((debounced || '').trim().length < minChars) { setItems([]); return }
    Promise.resolve(load(debounced)).then((r) => { if (id === req.current) { setItems(r || []); setActive(0) } }).catch(() => { if (id === req.current) setItems([]) })
  }, [debounced]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (item) => { setOpen(false); setItems([]); touched.current = false; onPick(item) }
  const onKey = (e) => {
    if (!open || !items.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % items.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + items.length) % items.length) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(items[active]) }
    else if (e.key === 'Escape') setOpen(false)
  }
  return (
    <div ref={wrap} className="relative">
      <input className="input" role="combobox" aria-expanded={open && items.length > 0} aria-label={ariaLabel} autoComplete="off" placeholder={placeholder} value={value}
        onChange={(e) => { touched.current = true; onChange(e.target.value); setOpen(true) }} onFocus={() => items.length && setOpen(true)} onKeyDown={onKey} />
      {open && items.length > 0 && (
        <ul role="listbox" className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-ink-100 bg-white p-1 shadow-lg">
          {items.map((it, i) => (
            <li key={it.key ?? i} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); pick(it) }} onMouseEnter={() => setActive(i)}
              className={`cursor-pointer rounded-lg px-3 py-2 ${i === active ? 'bg-brand-50' : ''}`}>{renderItem(it)}</li>))}
        </ul>)}
    </div>
  )
}
