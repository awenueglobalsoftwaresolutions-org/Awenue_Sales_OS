// Labels only. The list of permissions itself lives in the database (the `permissions` table) and is the single source of truth.
export const MODULE_LABELS = {
  dashboard: 'Dashboard',
  leads: 'Leads',
  website_queries: 'Website Queries',
  organizations: 'Organizations',
  contacts: 'Contacts',
  deals: 'Deals & pipeline',
  tasks: 'Tasks & follow-ups',
  projects: 'Projects',
  tickets: 'Support tickets',
  files: 'Files',
  activities: 'Activities',
  invoices: 'Invoices',
  reports: 'Reports & audits',
  communications: 'Email & WhatsApp',
  users: 'Users',
  roles: 'Roles & permissions',
  settings: 'Settings',
  integrations: 'Integrations',
}

// Available system modules for ABAC configuration
export const ALL_SYSTEM_MODULES = [
  'dashboard',
  'leads',
  'website_queries',
  'organizations',
  'contacts',
  'deals',
  'projects',
  'tickets',
  'tasks',
  'activities',
  'invoices',
  'reports',
  'files',
  'communications',
  'users',
  'roles',
  'settings',
  'integrations',
]

// Modules whose screens are planned for later phases
export const UPCOMING_MODULES = ['communications', 'integrations']
export const ACTION_ORDER = ['view', 'create', 'edit', 'delete', 'manage', 'export', 'assign', 'approve']
export const ACTION_LABELS = { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', manage: 'Manage', export: 'Export', assign: 'Assign', approve: 'Approve' }
