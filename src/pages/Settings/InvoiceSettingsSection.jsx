import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import { getInvoiceSettings, upsertInvoiceSettings } from '../../services/invoices'
import { supabase } from '../../lib/supabase'
import { friendlyError } from '../../lib/errors'
import { CURRENCIES } from '../../constants/options'
import { Field, FormError } from '../../components/forms/FormParts'
import Spinner from '../../components/common/Spinner'
import { Card } from './Sections'

const schema = z.object({
  company_name: z.string().trim().optional(), address: z.string().trim().optional(), email: z.string().trim().optional(), phone: z.string().trim().optional(), website: z.string().trim().optional(), tax_id: z.string().trim().optional(),
  default_currency: z.string().length(3), default_tax_rate: z.coerce.number().min(0).max(100), default_due_days: z.coerce.number().int().min(0).max(365),
  number_prefix: z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9-]+$/, 'Letters, digits and hyphens only').default('INV'),
  payment_instructions: z.string().trim().optional(), terms: z.string().trim().optional(),
})

export default function InvoiceSettingsSection() {
  const { profile, can } = useAuth()
  const editable = can('settings.manage')
  const settings = useFetch(getInvoiceSettings, [])
  const fileInput = useRef(null)
  const [logoBusy, setLogoBusy] = useState(false)
  const uploadLogo = async (file) => {
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file.type]
    if (!ext) return toast.error('Use a PNG, JPEG or WebP image.')
    if (file.size > 1048576) return toast.error('The logo can be at most 1 MB.')
    setLogoBusy(true)
    try {
      const path = `${profile.workspace_id}/logo-${Date.now()}.${ext}`
      const up = await supabase.storage.from('branding').upload(path, file, { contentType: file.type, cacheControl: '31536000' })
      if (up.error) throw up.error
      await upsertInvoiceSettings({ logo_url: supabase.storage.from('branding').getPublicUrl(path).data.publicUrl }, profile.workspace_id)
      toast.success('Logo updated'); settings.reload()
    } catch (e) { toast.error(friendlyError(e)) } finally { setLogoBusy(false) }
  }
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { company_name: '', address: '', email: '', phone: '', website: '', tax_id: '', default_currency: 'USD', default_tax_rate: 0, default_due_days: 14, number_prefix: 'INV', payment_instructions: '', terms: '' } })
  useEffect(() => { if (settings.data) form.reset(settings.data) }, [settings.data])
  const { submit, formError } = useFormSubmit(form, async (v) => {
    await upsertInvoiceSettings(v, profile.workspace_id); toast.success('Invoice settings saved')
  })
  if (settings.loading) return <Spinner />
  return (
    <Card title="Invoice settings" description="Company details that appear on every invoice, the default currency and due date, and your invoice number prefix.">
      {!editable && <p className="mb-3 rounded-lg bg-ink-50 p-3 text-sm text-ink-700">You can view these but not change them.</p>}
      <form onSubmit={submit} noValidate>
        <FormError message={formError} />
        <div className="mb-4 flex items-center gap-4">
          {settings.data?.logo_url ? <img src={settings.data.logo_url} alt="Company logo" className="h-14 max-w-[160px] rounded border border-ink-100 object-contain p-1" /> : <div className="grid h-14 w-28 place-items-center rounded border border-dashed border-ink-300 text-xs text-ink-500">No logo</div>}
          {editable && <><button type="button" className="btn-ghost border border-ink-300" disabled={logoBusy} onClick={() => fileInput.current?.click()}>{logoBusy ? 'Uploading…' : 'Upload logo'}</button><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) uploadLogo(f) }} /></>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" className="sm:col-span-2"><input className="input" disabled={!editable} {...form.register('company_name')} /></Field>
          <Field label="Address" className="sm:col-span-2"><textarea rows={2} className="input" disabled={!editable} {...form.register('address')} /></Field>
          <Field label="Email"><input type="email" className="input" disabled={!editable} {...form.register('email')} /></Field>
          <Field label="Phone"><input className="input" disabled={!editable} {...form.register('phone')} /></Field>
          <Field label="Website"><input className="input" disabled={!editable} {...form.register('website')} /></Field>
          <Field label="Tax ID / VAT number"><input className="input" disabled={!editable} {...form.register('tax_id')} /></Field>
          <Field label="Default currency" error={form.formState.errors.default_currency?.message}><select className="input" disabled={!editable} {...form.register('default_currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Default tax rate (%)" error={form.formState.errors.default_tax_rate?.message}><input type="number" step="0.01" min="0" max="100" className="input" disabled={!editable} {...form.register('default_tax_rate')} /></Field>
          <Field label="Default payment terms (days)" error={form.formState.errors.default_due_days?.message}><input type="number" min="0" max="365" className="input" disabled={!editable} {...form.register('default_due_days')} /></Field>
          <Field label="Invoice number prefix" error={form.formState.errors.number_prefix?.message}><input className="input" disabled={!editable} {...form.register('number_prefix')} placeholder="INV" /></Field>
          <Field label="Default payment instructions" className="sm:col-span-2"><textarea rows={3} className="input" disabled={!editable} {...form.register('payment_instructions')} /></Field>
          <Field label="Default terms & conditions" className="sm:col-span-2"><textarea rows={3} className="input" disabled={!editable} {...form.register('terms')} /></Field>
        </div>
        {editable && <button type="submit" className="btn-primary mt-4" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? 'Saving…' : 'Save settings'}</button>}
      </form>
    </Card>
  )
}
