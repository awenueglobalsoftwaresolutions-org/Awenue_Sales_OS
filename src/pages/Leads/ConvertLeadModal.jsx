import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import Modal from '../../components/common/Modal'
import { Field, FormError, FormFooter } from '../../components/forms/FormParts'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import { convertLead } from '../../services/leads'
import { CURRENCIES } from '../../constants/options'
import { fullName } from '../../lib/format'

const schema = z.object({
  title: z.string().trim().min(1, 'Enter a deal title'),
  value: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number({ invalid_type_error: 'Enter a number' }).min(0, 'Value cannot be negative').optional()),
  currency: z.string().length(3),
})

export default function ConvertLeadModal({ lead, onClose, onDone }) {
  const name = fullName(lead)
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { title: [lead.organization?.name || name, lead.interested_service].filter(Boolean).join(' – '), value: lead.estimated_budget ?? '', currency: 'USD' },
  })
  const { register, formState: { errors, isSubmitting } } = form
  const { submit, formError } = useFormSubmit(form, async (v) => {
    await convertLead({ leadId: lead.id, title: v.title, value: v.value ?? '', currency: v.currency })
    toast.success('Lead converted to a deal')
    onDone()
  })
  return (
    <Modal open title="Convert lead to deal" onClose={() => !isSubmitting && onClose()} size="sm">
      <p className="mb-4 text-sm text-ink-700">This creates a deal{lead.email ? ' and links the contact with this email (an existing one is reused)' : ' and a new contact'} for {name}. The lead is marked Converted.</p>
      <form onSubmit={submit} noValidate>
        <FormError message={formError} />
        <div className="space-y-4">
          <Field label="Deal title" required error={errors.title?.message}><input className="input" {...register('title')} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Deal value" error={errors.value?.message} className="col-span-2"><input type="number" step="any" min="0" className="input" {...register('value')} /></Field>
            <Field label="Currency"><select className="input" {...register('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          </div>
        </div>
        <FormFooter busy={isSubmitting} onCancel={onClose} label="Convert lead" />
      </form>
    </Modal>
  )
}
