import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { organizationSchema } from './schemas'
import { Field, FormError, FormFooter, Options } from './FormParts'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import { toFormValues } from '../../lib/query'
import { ORG_FIELDS } from '../../services/organizations'
import { COMPANY_SIZES } from '../../constants/options'

export default function OrganizationForm({ initial, onSubmit, onCancel }) {
  const form = useForm({ resolver: zodResolver(organizationSchema), defaultValues: toFormValues(initial, ORG_FIELDS) })
  const { register, formState: { errors, isSubmitting } } = form
  const { submit, formError } = useFormSubmit(form, onSubmit)
  return (
    <form onSubmit={submit} noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Organization name" required error={errors.name?.message} className="sm:col-span-2"><input className="input" {...register('name')} /></Field>
        <Field label="Website"><input className="input" placeholder="https://" {...register('website')} /></Field>
        <Field label="Industry"><input className="input" {...register('industry')} /></Field>
        <Field label="Company size"><select className="input" {...register('company_size')}><Options list={COMPANY_SIZES} /></select></Field>
        <Field label="LinkedIn URL"><input className="input" {...register('linkedin_url')} /></Field>
        <Field label="Country"><input className="input" {...register('country')} /></Field>
        <Field label="State"><input className="input" {...register('state')} /></Field>
        <Field label="City"><input className="input" {...register('city')} /></Field>
        <Field label="Full address" className="sm:col-span-2"><input className="input" {...register('address')} /></Field>
        <Field label="Description" className="sm:col-span-2"><textarea rows={3} className="input" {...register('description')} /></Field>
      </div>
      <FormFooter busy={isSubmitting} onCancel={onCancel} label={initial?.id ? 'Save changes' : 'Add organization'} />
    </form>
  )
}
