import { LayoutDashboard, UserPlus, Building2, Contact, Handshake, KanbanSquare, CheckSquare, Activity, Settings } from 'lucide-react'

export const NAV_ITEMS = [
  { perm: 'dashboard.view', to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { perm: 'leads.view', to: '/leads', label: 'Leads', icon: UserPlus },
  { perm: 'organizations.view', to: '/organizations', label: 'Organizations', icon: Building2 },
  { perm: 'contacts.view', to: '/contacts', label: 'Contacts', icon: Contact },
  { perm: 'deals.view', to: '/deals', label: 'Deals', icon: Handshake },
  { perm: 'deals.view', to: '/pipeline', label: 'Sales Pipeline', icon: KanbanSquare },
  { perm: 'tasks.view', to: '/tasks', label: 'Tasks & Follow-ups', icon: CheckSquare },
  { perm: 'activities.view', to: '/activities', label: 'Activities', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export const ROLE_LABELS = { super_admin: 'Super Admin', admin: 'Admin', sales_manager: 'Sales Manager', sales_executive: 'Sales Representative' }
