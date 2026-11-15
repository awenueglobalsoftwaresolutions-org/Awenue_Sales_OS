import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Modal from '../../components/common/Modal'
import { Field, FormError, FormFooter } from '../../components/forms/FormParts'
import { useFormSubmit } from '../../hooks/useFormSubmit'

const schema = z.object({ reason: z.string().trim().min(1, 'Tell us why the deal was lost') })

export default function LostReasonModal({ deal, onSubmit, onClose }) {
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { reason: '' } })
  const { submit, formError } = useFormSubmit(form, (v) => onSubmit(v.reason))
  return (
    <Modal open title="Mark deal as lost" onClose={() => !form.formState.isSubmitting && onClose()} size="sm">
      <p className="mb-4 text-sm text-ink-700">“{deal.title}” will move to Lost. A reason helps you learn from it later.</p>
      <form onSubmit={submit} noValidate>
        <FormError message={formError} />
        <Field label="Reason" required error={form.formState.errors.reason?.message}><textarea autoFocus rows={3} className="input" {...form.register('reason')} /></Field>
        <FormFooter busy={form.formState.isSubmitting} onCancel={onClose} label="Mark as lost" />
      </form>
    </Modal>
  )
}
