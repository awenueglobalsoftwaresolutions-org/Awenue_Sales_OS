import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { contactSchema } from './schemas'
import { Field, FormError, FormFooter } from './FormParts'
import Spinner from '../common/Spinner'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import { useFetch } from '../../hooks/useFetch'
import { toFormValues } from '../../lib/query'
import { CONTACT_FIELDS } from '../../services/contacts'
import { listOrganizationOptions } from '../../services/lookups'

export default function ContactForm({ initial, onSubmit, onCancel }) {
  const form = useForm({ resolver: zodResolver(contactSchema), defaultValues: toFormValues(initial, CONTACT_FIELDS) })
  const { register, formState: { errors, isSubmitting } } = form
  const { submit, formError } = useFormSubmit(form, onSubmit)
  const orgs = useFetch(listOrganizationOptions, [])
  if (orgs.loading) return <Spinner label="Loading form" className="py-10" />
  return (
    <form onSubmit={submit} noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" required error={errors.first_name?.message}><input className="input" {...register('first_name')} /></Field>
        <Field label="Last name"><input className="input" {...register('last_name')} /></Field>
        <Field label="Designation"><input className="input" {...register('designation')} /></Field>
        <Field label="Organization">
          <select className="input" {...register('organization_id')}>
            <option value="">None</option>
            {(orgs.data || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <Field label="Email" error={errors.email?.message}><input type="email" className="input" {...register('email')} /></Field>
        <Field label="Phone"><input className="input" {...register('phone')} /></Field>
        <Field label="LinkedIn profile"><input className="input" {...register('linkedin_url')} /></Field>
        <Field label="Country"><input className="input" {...register('country')} /></Field>
        <Field label="Notes" className="sm:col-span-2"><textarea rows={3} className="input" {...register('notes')} /></Field>
      </div>
      <FormFooter busy={isSubmitting} onCancel={onCancel} label={initial?.id ? 'Save changes' : 'Add contact'} />
    </form>
  )
}
