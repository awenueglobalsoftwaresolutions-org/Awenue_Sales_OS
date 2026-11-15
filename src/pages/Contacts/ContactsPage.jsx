import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Contact, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { useListQuery } from '../../hooks/useListQuery'
import { createContact, deleteContact, listContacts, updateContact } from '../../services/contacts'
import { listOrganizationOptions } from '../../services/lookups'
import { fmtDate, fullName } from '../../lib/format'
import PageHeader from '../../components/common/PageHeader'
import CsvTools from '../../components/csv/CsvTools'
import { FilterBar } from '../../components/common/FilterBar'
import DataTable from '../../components/tables/DataTable'
import Pagination from '../../components/common/Pagination'
import EmptyState from '../../components/common/EmptyState'
import ErrorState from '../../components/common/ErrorState'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import RowActions from '../../components/common/RowActions'
import ContactForm from '../../components/forms/ContactForm'

const INITIAL_SORT = { key: 'created_at', dir: 'desc' }

export default function ContactsPage() {
  const { profile, can } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const list = useListQuery(listContacts, { initialSort: INITIAL_SORT })
  const orgs = useFetch(listOrganizationOptions, [])
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => { if (params.get('new')) { setEditing({}); setParams({}, { replace: true }) } }, [params, setParams])

  const save = async (values) => {
    if (editing?.id) await updateContact(editing.id, values)
    else await createContact(values, profile)
    toast.success(editing?.id ? 'Contact updated' : 'Contact added')
    setEditing(null); list.reload()
  }
  const remove = async () => { await deleteContact(deleting.id); toast.success('Contact deleted'); setDeleting(null); list.reload() }

  const columns = [
    { key: 'name', header: 'Name', sortKey: 'first_name', render: (c) => <span className="font-medium">{fullName(c)}</span> },
    { key: 'designation', header: 'Designation' },
    { key: 'organization', header: 'Organization', render: (c) => c.organization ? <Link className="text-brand-600 hover:underline" to={`/organizations/${c.organization.id}`} onClick={(e) => e.stopPropagation()}>{c.organization.name}</Link> : '—' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone' },
    { key: 'created_at', header: 'Added', sortKey: 'created_at', render: (c) => fmtDate(c.created_at) },
    { key: 'actions', header: '', className: 'w-24', render: (c) => <RowActions canEdit={can('contacts.edit')} canDelete={can('contacts.delete')} label={fullName(c)} onEdit={() => setEditing(c)} onDelete={() => setDeleting(c)} /> },
  ]
  const addButton = !can('contacts.create') ? null : <button className="btn-primary" onClick={() => setEditing({})}><Plus className="h-4 w-4" />Add contact</button>

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Contacts" subtitle="People at the organizations you sell to" actions={<><CsvTools entity="contacts" list={list} />{addButton}</>} />
      <FilterBar search={list.search} onSearch={list.setSearch} placeholder="Search name, email, phone" isFiltered={list.isFiltered} onClear={list.clearFilters}>
        <select className="input !w-auto max-w-[220px]" value={list.filters.organization_id || ''} onChange={(e) => list.setFilter('organization_id', e.target.value)} aria-label="Filter by organization">
          <option value="">Any organization</option>
          {(orgs.data || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </FilterBar>

      {list.error && !list.rows.length ? <ErrorState message={list.error} onRetry={list.reload} /> : (
        <>
          <DataTable columns={columns} rows={list.rows} loading={list.loading} sort={list.sort} onSort={list.toggleSort}
            onRowClick={(c) => navigate(`/contacts/${c.id}`)}
            empty={list.isFiltered
              ? <EmptyState icon={Contact} title="No contacts match" description="Try a different search or clear the filters." />
              : <EmptyState icon={Contact} title="No contacts yet" description="Add the people you talk to. Converting a lead also creates a contact." action={addButton} />} />
          <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
        </>
      )}

      <Modal open={Boolean(editing)} title={editing?.id ? 'Edit contact' : 'Add contact'} onClose={() => setEditing(null)}>
        {editing && <ContactForm key={editing.id || 'new'} initial={editing} onSubmit={save} onCancel={() => setEditing(null)} />}
      </Modal>
      <ConfirmDialog open={Boolean(deleting)} title="Delete contact?" message={`${deleting ? fullName(deleting) : ''} and their activity history will be permanently deleted.`} onConfirm={remove} onClose={() => setDeleting(null)} />
    </div>
  )
}
