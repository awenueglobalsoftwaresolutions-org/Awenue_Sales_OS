import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Building2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useListQuery } from '../../hooks/useListQuery'
import { createOrganization, deleteOrganization, listOrganizations, updateOrganization } from '../../services/organizations'
import { COMPANY_SIZES } from '../../constants/options'
import { fmtDate, location } from '../../lib/format'
import PageHeader from '../../components/common/PageHeader'
import CsvTools from '../../components/csv/CsvTools'
import { FilterBar, FilterSelect } from '../../components/common/FilterBar'
import DataTable from '../../components/tables/DataTable'
import Pagination from '../../components/common/Pagination'
import EmptyState from '../../components/common/EmptyState'
import ErrorState from '../../components/common/ErrorState'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import RowActions from '../../components/common/RowActions'
import OrganizationForm from '../../components/forms/OrganizationForm'

const INITIAL_SORT = { key: 'created_at', dir: 'desc' }

export default function OrganizationsPage() {
  const { profile, can } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const list = useListQuery(listOrganizations, { initialSort: INITIAL_SORT })
  const [editing, setEditing] = useState(null) // null | {} (new) | organization
  const [deleting, setDeleting] = useState(null)

  useEffect(() => { if (params.get('new')) { setEditing({}); setParams({}, { replace: true }) } }, [params, setParams])

  const save = async (values) => {
    if (editing?.id) await updateOrganization(editing.id, values)
    else await createOrganization(values, profile)
    toast.success(editing?.id ? 'Organization updated' : 'Organization added')
    setEditing(null); list.reload()
  }
  const remove = async () => {
    await deleteOrganization(deleting.id)
    toast.success('Organization deleted'); setDeleting(null); list.reload()
  }

  const columns = [
    { key: 'name', header: 'Organization', sortKey: 'name', render: (o) => <span className="font-medium">{o.name}</span> },
    { key: 'industry', header: 'Industry' },
    { key: 'location', header: 'Location', render: location },
    { key: 'company_size', header: 'Size' },
    { key: 'created_at', header: 'Added', sortKey: 'created_at', render: (o) => fmtDate(o.created_at) },
    { key: 'actions', header: '', className: 'w-24', render: (o) => <RowActions canEdit={can('organizations.edit')} canDelete={can('organizations.delete')} label={o.name} onEdit={() => setEditing(o)} onDelete={() => setDeleting(o)} /> },
  ]
  const addButton = !can('organizations.create') ? null : <button className="btn-primary" onClick={() => setEditing({})}><Plus className="h-4 w-4" />Add organization</button>

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Organizations" subtitle="Companies you sell to" actions={<><CsvTools entity="organizations" list={list} />{addButton}</>} />
      <FilterBar search={list.search} onSearch={list.setSearch} placeholder="Search name, industry, city" isFiltered={list.isFiltered} onClear={list.clearFilters}>
        <FilterSelect label="Any size" value={list.filters.company_size} onChange={(v) => list.setFilter('company_size', v)} options={COMPANY_SIZES} />
        <input className="input !w-40" placeholder="Country" value={list.filters.country || ''} onChange={(e) => list.setFilter('country', e.target.value)} aria-label="Filter by country" />
      </FilterBar>

      {list.error && !list.rows.length ? <ErrorState message={list.error} onRetry={list.reload} /> : (
        <>
          <DataTable columns={columns} rows={list.rows} loading={list.loading} sort={list.sort} onSort={list.toggleSort}
            onRowClick={(o) => navigate(`/organizations/${o.id}`)}
            empty={list.isFiltered
              ? <EmptyState icon={Building2} title="No organizations match" description="Try a different search or clear the filters." />
              : <EmptyState icon={Building2} title="No organizations yet" description="Add the companies you work with. Contacts, leads and deals link back to them." action={addButton} />} />
          <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
        </>
      )}

      <Modal open={Boolean(editing)} title={editing?.id ? 'Edit organization' : 'Add organization'} onClose={() => setEditing(null)}>
        {editing && <OrganizationForm key={editing.id || 'new'} initial={editing} onSubmit={save} onCancel={() => setEditing(null)} />}
      </Modal>
      <ConfirmDialog open={Boolean(deleting)} title="Delete organization?" message={`“${deleting?.name}” will be permanently deleted. Organizations that still have contacts, leads or deals can't be deleted.`}
        onConfirm={remove} onClose={() => setDeleting(null)} />
    </div>
  )
}
