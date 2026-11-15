// Labels only. The list of permissions itself lives in the database (the `permissions` table) and is the single source of truth.
export const MODULE_LABELS = {
  dashboard: 'Dashboard', leads: 'Leads', organizations: 'Organizations', contacts: 'Contacts', deals: 'Deals & pipeline', tasks: 'Tasks & follow-ups',
  files: 'Files', activities: 'Activities', reports: 'Reports & audits', invoices: 'Invoices', communications: 'Email & WhatsApp',
  users: 'Users', roles: 'Roles & permissions', settings: 'Settings', integrations: 'Integrations',
}
// Modules whose screens are built in later phases (the permissions already exist so roles can be prepared).
export const UPCOMING_MODULES = ['reports', 'invoices', 'communications', 'integrations']
export const ACTION_ORDER = ['view', 'create', 'edit', 'delete', 'manage', 'export', 'assign', 'approve']
export const ACTION_LABELS = { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', manage: 'Manage', export: 'Export', assign: 'Assign', approve: 'Approve' }
