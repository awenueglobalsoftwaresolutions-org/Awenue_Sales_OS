import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Building2, Mail, MessageSquare, Phone, Plus, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../common/Modal'
import { Field, FormError, FormFooter } from '../forms/FormParts'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import { createWebsiteQueryDirectly } from '../../services/websiteSync'
import { CONTACT_SUBJECTS } from '../../services/website'

const schema = z.object({
  type: z.enum(['contacts', 'enquiries']),
  fullName: z.string().trim().min(1, 'Enter full name').max(100),
  email: z.string().trim().min(1, 'Enter email').email('Enter valid email'),
  phone: z.string().trim().optional(),
  countryCode: z.string().trim().default('+91'),
  companyName: z.string().trim().optional(),
  websiteUrl: z.string().trim().optional(),
  subject: z.string().trim().optional(),
  message: z.string().trim().optional(),
  selectedServices: z.string().trim().optional(),
  budgetRange: z.string().trim().optional(),
  timeline: z.string().trim().optional(),
  projectScope: z.string().trim().optional(),
})

export default function AddWebsiteQueryModal({ open, defaultType = 'enquiries', onClose, onCreated }) {
  const { profile } = useAuth()
  const [activeType, setActiveType] = useState(defaultType)

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      type: defaultType,
      fullName: '',
      email: '',
      phone: '',
      countryCode: '+91',
      companyName: '',
      websiteUrl: '',
      subject: 'General Enquiry',
      message: '',
      selectedServices: '',
      budgetRange: '',
      timeline: '',
      projectScope: '',
    },
  })

  const { register, setValue, formState: { errors, isSubmitting } } = form

  const handleTypeChange = (type) => {
    setActiveType(type)
    setValue('type', type)
  }

  const { submit, formError } = useFormSubmit(form, async (values) => {
    const servicesList = values.selectedServices
      ? values.selectedServices.split(',').map((s) => s.trim()).filter(Boolean)
      : []

    const res = await createWebsiteQueryDirectly({
      type: values.type,
      data: {
        ...values,
        selectedServices: servicesList,
      },
    }, profile)

    toast.success(`${values.type === 'contacts' ? 'Contact query' : 'Project enquiry'} saved directly in Database & Leads!`)
    onCreated?.(res)
    onClose()
  })

  return (
    <Modal open={open} onClose={() => !isSubmitting && onClose()} size="lg" title="Create Website Query / Lead">
      <div className="mb-4 flex items-center gap-2 rounded-xl bg-ink-100/70 p-1">
        <button
          type="button"
          onClick={() => handleTypeChange('enquiries')}
          className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg py-1.5 text-xs font-semibold transition ${
            activeType === 'enquiries' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-600 hover:text-ink-900'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5 text-sky-600" />
          Project Enquiry
        </button>
        <button
          type="button"
          onClick={() => handleTypeChange('contacts')}
          className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg py-1.5 text-xs font-semibold transition ${
            activeType === 'contacts' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-600 hover:text-ink-900'
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5 text-indigo-600" />
          Contact Us Query
        </button>
      </div>

      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={formError} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full Name" required error={errors.fullName?.message}>
            <input className="input" placeholder="Prospect or client name" {...register('fullName')} />
          </Field>
          <Field label="Email" required error={errors.email?.message}>
            <input type="email" className="input" placeholder="client@example.com" {...register('email')} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Country Code">
            <input className="input" placeholder="+91" {...register('countryCode')} />
          </Field>
          <Field label="Phone Number" className="sm:col-span-2" error={errors.phone?.message}>
            <input className="input" placeholder="9876543210" {...register('phone')} />
          </Field>
        </div>

        {activeType === 'enquiries' ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Company / Organization">
                <input className="input" placeholder="Acme Corp" {...register('companyName')} />
              </Field>
              <Field label="Website URL">
                <input className="input" placeholder="https://example.com" {...register('websiteUrl')} />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Interested Services (comma-separated)">
                <input className="input" placeholder="Web Dev, AI, SaaS" {...register('selectedServices')} />
              </Field>
              <Field label="Budget Range">
                <input className="input" placeholder="₹1L - ₹2.5L" {...register('budgetRange')} />
              </Field>
              <Field label="Timeline">
                <input className="input" placeholder="1-2 Months" {...register('timeline')} />
              </Field>
            </div>

            <Field label="Project Scope / Requirement">
              <textarea
                rows={3}
                className="input"
                placeholder="Details of the project requirements or client brief…"
                {...register('projectScope')}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Subject">
              <select className="input" {...register('subject')}>
                {CONTACT_SUBJECTS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>

            <Field label="Message">
              <textarea
                rows={3}
                className="input"
                placeholder="Full message or inquiry content…"
                {...register('message')}
              />
            </Field>
          </>
        )}

        <FormFooter busy={isSubmitting} onCancel={onClose} label="Save to Database & CRM" />
      </form>
    </Modal>
  )
}
