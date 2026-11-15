import { useState } from 'react'
import { friendlyError } from '../lib/errors'

// Wraps react-hook-form's handleSubmit: shows server errors and blocks double submits (isSubmitting stays true while pending).
export function useFormSubmit(form, onSubmit) {
  const [formError, setFormError] = useState('')
  const submit = form.handleSubmit(async (values) => {
    setFormError('')
    try { await onSubmit(values) } catch (e) { setFormError(friendlyError(e)) }
  })
  return { submit, formError }
}
