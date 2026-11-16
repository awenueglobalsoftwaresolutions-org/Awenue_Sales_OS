import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import PageHeader from '../../components/common/PageHeader'
import { AccountSection, OrganizationSection, ProfileSection, ReferenceSection, ServicesSection } from './Sections'
import UsersSection from './UsersSection'
import RolesSection from './RolesSection'
import InvoiceSettingsSection from './InvoiceSettingsSection'

const TABS = [
  { key: 'profile', label: 'Profile', Section: ProfileSection },
  { key: 'account', label: 'Account', Section: AccountSection },
  { key: 'organization', label: 'Organization', Section: OrganizationSection, perm: 'settings.view' },
  { key: 'services', label: 'Services', Section: ServicesSection, perm: 'settings.view' },
  { key: 'pipeline', label: 'Pipeline & sources', Section: ReferenceSection, perm: 'settings.view' },
  { key: 'users', label: 'Users', Section: UsersSection, perm: 'users.view' },
  { key: 'roles', label: 'Roles & permissions', Section: RolesSection, perm: 'roles.view' },
  { key: 'invoices', label: 'Invoice settings', Section: InvoiceSettingsSection, perm: 'invoices.view' },
]

export default function SettingsPage() {
  const { can } = useAuth()
  const [sp, setSp] = useSearchParams()
  const tabs = TABS.filter((t) => !t.perm || can(t.perm))
  const current = tabs.find((t) => t.key === sp.get('tab')) || tabs[0]
  const Section = current.Section
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-5 md:flex-row">
        <nav role="tablist" aria-label="Settings sections" className="flex shrink-0 gap-1 overflow-x-auto md:w-52 md:flex-col">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={current.key === t.key} onClick={() => setSp({ tab: t.key }, { replace: true })}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium ${current.key === t.key ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-ink-100'}`}>{t.label}</button>
          ))}
        </nav>
        <div className="min-w-0 flex-1"><Section /></div>
      </div>
    </div>
  )
}
