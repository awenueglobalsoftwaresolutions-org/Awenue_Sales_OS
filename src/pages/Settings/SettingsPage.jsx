import { useSearchParams } from 'react-router-dom'
import { Briefcase, Building2, FileText, GitBranch, KeyRound, Mail, MailCheck, Receipt, Settings, Shield, UserRound, Users } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import PageHeader from '../../components/common/PageHeader'
import { AccountSection, OrganizationSection, ProfileSection, ReferenceSection, ServicesSection } from './Sections'
import UsersSection from './UsersSection'
import RolesSection from './RolesSection'
import InvoiceSettingsSection from './InvoiceSettingsSection'
import { EmailAccountSection, EmailTemplatesSection } from './EmailSections'
import EmailNotificationsSection from './EmailNotificationsSection'

const TABS = [
  { key: 'profile', label: 'Profile', icon: UserRound, Section: ProfileSection },
  { key: 'account', label: 'Account', icon: KeyRound, Section: AccountSection },
  { key: 'organization', label: 'Organization', icon: Building2, Section: OrganizationSection, perm: 'settings.view' },
  { key: 'services', label: 'Services', icon: Briefcase, Section: ServicesSection, perm: 'settings.view' },
  { key: 'pipeline', label: 'Pipeline & sources', icon: GitBranch, Section: ReferenceSection, perm: 'settings.view' },
  { key: 'users', label: 'Users', icon: Users, Section: UsersSection, perm: 'users.view' },
  { key: 'roles', label: 'Roles & permissions', icon: Shield, Section: RolesSection, perm: 'roles.view' },
  { key: 'invoices', label: 'Invoice settings', icon: Receipt, Section: InvoiceSettingsSection, perm: 'invoices.view' },
  { key: 'email', label: 'Email account', icon: Mail, Section: EmailAccountSection, perm: 'communications.view' },
  { key: 'templates', label: 'Email templates', icon: FileText, Section: EmailTemplatesSection, perm: 'communications.view' },
  { key: 'email-notifications', label: 'Email notifications', icon: MailCheck, Section: EmailNotificationsSection, perm: 'communications.view' },
]

export default function SettingsPage() {
  const { can } = useAuth()
  const [sp, setSp] = useSearchParams()
  const tabs = TABS.filter((t) => !t.perm || can(t.perm))
  const current = tabs.find((t) => t.key === sp.get('tab')) || tabs[0]
  const Section = current.Section
  return (
    <div className="w-full space-y-5 animate-fade-up">
      <PageHeader title="Settings" subtitle="Manage your profile, workspace, team and preferences" icon={Settings} />
      <div className="flex flex-col items-start gap-5 md:flex-row">
        <nav role="tablist" aria-label="Settings sections" className="surface-card thin-scrollbar flex w-full shrink-0 gap-1 overflow-x-auto p-1.5 md:sticky md:top-0 md:w-56 md:flex-col">
          {tabs.map((t) => {
            const Icon = t.icon
            const active = current.key === t.key
            return (
              <button key={t.key} role="tab" aria-selected={active} onClick={() => setSp({ tab: t.key }, { replace: true })}
                className={`flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm font-medium transition ${active ? 'bg-brand-50 font-semibold text-brand-700' : 'text-ink-700 hover:bg-ink-50'}`}>
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-brand-600' : 'text-ink-400'}`} aria-hidden />
                {t.label}
              </button>
            )
          })}
        </nav>
        <div className="w-full min-w-0 flex-1"><Section /></div>
      </div>
    </div>
  )
}
