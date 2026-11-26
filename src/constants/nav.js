import { FolderKanban, LifeBuoy, LayoutDashboard, UserPlus, MessageSquare, Building2, Contact, Handshake, KanbanSquare, CheckSquare, Activity, FileText, Receipt, Settings } from 'lucide-react'

export const NAV_GROUPS = [
  {
    title: null,
    items: [
      { perm: 'dashboard.view', to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    ],
  },
  {
    title: 'CRM & Pipeline',
    items: [
      { perm: 'leads.view', to: '/leads', label: 'Leads', icon: UserPlus },
      { perm: 'leads.view', to: '/website-queries', label: 'Website Queries', icon: MessageSquare },
      { perm: 'organizations.view', to: '/organizations', label: 'Organizations', icon: Building2 },
      { perm: 'contacts.view', to: '/contacts', label: 'Contacts', icon: Contact },
      { perm: 'deals.view', to: '/deals', label: 'Deals', icon: Handshake },
      { perm: 'deals.view', to: '/pipeline', label: 'Sales Pipeline', icon: KanbanSquare },
    ],
  },
  {
    title: 'Delivery',
    items: [
      { perm: 'projects.view', to: '/projects', label: 'Projects', icon: FolderKanban },
      { perm: 'tickets.view', to: '/tickets', label: 'Support tickets', icon: LifeBuoy },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { perm: 'tasks.view', to: '/tasks', label: 'Tasks & Follow-ups', icon: CheckSquare },
      { perm: 'activities.view', to: '/activities', label: 'Activities', icon: Activity },
      { perm: 'invoices.view', to: '/invoices', label: 'Invoices', icon: Receipt },
    ],
  },
  {
    title: 'System',
    items: [
      { perm: 'reports.view', to: '/reports', label: 'Reports & Audits', icon: FileText },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items)

export const ROLE_LABELS = { super_admin: 'Super Admin', admin: 'Admin', sales_manager: 'Sales Manager', sales_executive: 'Sales Representative' }
