import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Modal from '../common/Modal'
import { Field, FormError, FormFooter } from '../forms/FormParts'
import { useFormSubmit } from '../../hooks/useFormSubmit'

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(200, 'Use 200 characters or fewer').refine((v) => !/[\\/]/.test(v), 'Names can’t contain / or \\'),
})

function NameForm({ initial, label, onSubmit, onClose }) {
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { name: initial || '' } })
  const { submit, formError } = useFormSubmit(form, (v) => onSubmit(v.name))
  return (
    <form onSubmit={submit} noValidate>
      <FormError message={formError} />
      <Field label={label} error={form.formState.errors.name?.message}><input autoFocus className="input" {...form.register('name')} /></Field>
      <FormFooter busy={form.formState.isSubmitting} onCancel={onClose} label="Save" />
    </form>
  )
}

export default function NameDialog({ open, title, label = 'Name', initial, onSubmit, onClose }) {
  return <Modal open={open} title={title} onClose={onClose} size="sm">{open && <NameForm initial={initial} label={label} onSubmit={onSubmit} onClose={onClose} />}</Modal>
}
