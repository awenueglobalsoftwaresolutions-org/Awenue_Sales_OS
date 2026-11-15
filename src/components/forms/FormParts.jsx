import { Loader2 } from 'lucide-react'

export const Field = ({ label, error, required, className = '', children }) => (
  <label className={`block ${className}`}>
    <span className="label">{label}{required && <span className="text-red-500"> *</span>}</span>
    {children}
    {error && <p className="field-error">{error}</p>}
  </label>
)

export const Options = ({ list, placeholder = 'Select…' }) => (
  <>
    <option value="">{placeholder}</option>
    {list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
  </>
)

export const FormError = ({ message }) =>
  message ? <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p> : null

export const FormFooter = ({ busy, onCancel, label = 'Save' }) => (
  <div className="mt-6 flex justify-end gap-2">
    <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
    <button type="submit" className="btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{label}</button>
  </div>
)
