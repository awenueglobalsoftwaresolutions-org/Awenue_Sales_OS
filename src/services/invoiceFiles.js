import { supabase } from '../lib/supabase'
import { invoiceFileName, invoicePdfBlob } from '../lib/invoicePdf'
import { createFolder, uploadFile } from './files'

const FOLDER = 'Invoices'

// Puts a copy of the invoice PDF into the organization's Files, in an "Invoices" folder (created the first time).
export async function saveInvoicePdfToFiles(invoice, items, profile) {
  if (!invoice.organization_id) throw new Error('Link the invoice to an organization first.')
  const find = async () => {
    const { data, error } = await supabase.from('org_items').select('id').eq('organization_id', invoice.organization_id).is('parent_id', null).eq('kind', 'folder').ilike('name', FOLDER).limit(1)
    if (error) throw error
    return data?.[0]?.id
  }
  let parentId = await find()
  if (!parentId) { await createFolder({ orgId: invoice.organization_id, parentId: null, name: FOLDER }, profile); parentId = await find() }
  const file = new File([await invoicePdfBlob(invoice, invoice.items || [])], invoiceFileName(invoice), { type: 'application/pdf' })
  return uploadFile(file, { orgId: invoice.organization_id, parentId })
}
