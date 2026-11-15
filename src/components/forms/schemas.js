import { z } from 'zod'

const text = z.string().trim().optional()
const email = z.string().trim().email('Enter a valid email address').optional().or(z.literal(''))
const required = (msg) => z.string().trim().min(1, msg)

export const organizationSchema = z.object({
  name: required('Enter the organization name'), website: text, industry: text, company_size: text,
  country: text, state: text, city: text, address: text, linkedin_url: text, description: text,
})

export const contactSchema = z.object({
  first_name: required('Enter a first name'), last_name: text, designation: text, email, phone: text,
  linkedin_url: text, organization_id: text, country: text, notes: text,
})

export const leadSchema = z.object({
  first_name: required('Enter a first name'), last_name: text, job_title: text, email, phone: text,
  organization_id: text, website: text, industry: text, country: text, state: text, city: text,
  source: text, interested_service: text, status: required('Choose a status'), priority: required('Choose a priority'),
  assigned_to: text,
  estimated_budget: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number({ invalid_type_error: 'Enter a number' }).min(0, 'Budget cannot be negative').optional()),
  notes: text,
})

const optionalNumber = (msg) => z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number({ invalid_type_error: 'Enter a number' }).min(0, msg).optional())

export const dealSchema = z.object({
  title: required('Enter a deal title'), organization_id: text, contact_id: text, lead_id: text, interested_service: text,
  value: optionalNumber('Value cannot be negative'), currency: z.string().length(3),
  expected_close_date: text, stage: required('Choose a stage'), assigned_to: text,
  probability: z.coerce.number({ invalid_type_error: 'Enter a number' }).int('Use a whole number').min(0, 'Use 0–100').max(100, 'Use 0–100'),
  description: text, notes: text, lost_reason: text,
}).refine((v) => v.stage !== 'lost' || (v.lost_reason || '').trim().length > 0, { path: ['lost_reason'], message: 'Tell us why the deal was lost' })

export const taskSchema = z.object({
  title: required('Enter a task title'), description: text, task_type: required('Choose a type'), priority: required('Choose a priority'), status: required('Choose a status'),
  due_date: text, due_time: text, assigned_to: text, lead_id: text, organization_id: text, contact_id: text, deal_id: text,
})
