import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import Modal from '../common/Modal'
import { Field, FormError, FormFooter, Options } from '../forms/FormParts'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import { convertDealToProject, PRIORITY_OPTIONS } from '../../services/projects'

const schema = z.object({ name: z.string().trim().min(1, 'Enter a project name').max(160), priority: z.string().min(1), start_date: z.string().optional(), expected_end_date: z.string().optional() })

// Turns a deal into a client project: the deal's organization, team and service carry over, and the standard stages are added.
export default function ConvertDealModal({ deal, onClose }) {
  const navigate = useNavigate()
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { name: deal.title, priority: 'medium', start_date: '', expected_end_date: deal.expected_close_date || '' } })
  const { register, formState: { errors, isSubmitting } } = form
  const { submit, formError } = useFormSubmit(form, async (v) => {
    const id = await convertDealToProject(deal.id, { name: v.name, priority: v.priority, start_date: v.start_date || null, expected_end_date: v.expected_end_date || null })
    toast.success('Project created from this deal')
    onClose(); navigate(`/projects/${id}`)
  })
  return (
    <Modal open title="Convert deal to project" onClose={() => !isSubmitting && onClose()} size="sm">
      <p className="mb-4 text-sm text-ink-600">The client, the assigned person and the service carry over. The project starts with the standard stages.</p>
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={formError} />
        <Field label="Project name" required error={errors.name?.message}><input className="input" {...register('name')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date"><input type="date" className="input" {...register('start_date')} /></Field>
          <Field label="Expected completion"><input type="date" className="input" {...register('expected_end_date')} /></Field>
        </div>
        <Field label="Priority"><select className="input" {...register('priority')}><Options list={PRIORITY_OPTIONS} /></select></Field>
        <FormFooter busy={isSubmitting} onCancel={onClose} label="Create project" />
      </form>
    </Modal>)
}
