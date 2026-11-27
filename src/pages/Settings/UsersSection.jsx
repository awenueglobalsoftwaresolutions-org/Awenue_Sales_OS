import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Activity,
  Ban,
  Briefcase,
  Building2,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Contact,
  Copy,
  CreditCard,
  Crown,
  Eye,
  FileText,
  FolderKanban,
  Handshake,
  KeyRound,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  Lock,
  Mail,
  MessageSquare,
  Pencil,
  Plus,
  Receipt,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import { friendlyError } from '../../lib/errors'
import { fmtDate } from '../../lib/format'
import {
  createUser,
  listPermissions,
  listRolePermissions,
  listRoles,
  listUserPermissions,
  listUsers,
  removeUser,
  saveUserPermissions,
  updateUser,
  updateUserAccessControl,
} from '../../services/settings'
import { supabase } from '../../lib/supabase'
import { ALL_SYSTEM_MODULES, MODULE_LABELS } from '../../constants/permissions'
import { Field, FormError, FormFooter } from '../../components/forms/FormParts'
import Avatar from '../../components/common/Avatar'
import Badge from '../../components/common/Badge'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import ErrorState from '../../components/common/ErrorState'
import Modal from '../../components/common/Modal'
import Spinner from '../../components/common/Spinner'
import { Card } from './Sections'

const MODULE_ICONS = {
  dashboard: LayoutDashboard,
  leads: UserPlus,
  website_queries: MessageSquare,
  organizations: Building2,
  contacts: Contact,
  deals: Handshake,
  projects: FolderKanban,
  tickets: LifeBuoy,
  tasks: CheckSquare,
  activities: Activity,
  invoices: Receipt,
  reports: FileText,
  files: FileText,
  communications: Mail,
  users: Users,
  roles: Shield,
  settings: Sliders,
  integrations: KeyRound,
}

const addSchema = z.object({
  full_name: z.string().trim().min(1, 'Enter a name').max(100),
  email: z.string().trim().min(1, 'Enter an email').email('Enter a valid email'),
  role: z.string().min(1),
  manager_id: z.string().optional(),
  job_title: z.string().trim().optional(),
  department: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  password: z.string().refine((v) => v === '' || v.length >= 10, 'Use at least 10 characters, or leave empty to send an invitation email'),
})
const editSchema = z.object({
  full_name: z.string().trim().min(1, 'Enter a name').max(100),
  phone: z.string().trim().optional(),
  job_title: z.string().trim().optional(),
  department: z.string().trim().optional(),
})

function AddUserModal({ roles, users, canAssign, isSuperAdmin, onClose, onDone }) {
  const form = useForm({
    resolver: zodResolver(addSchema),
    defaultValues: { full_name: '', email: '', role: 'sales_executive', manager_id: '', job_title: '', department: '', phone: '', password: '' },
  })
  const { register, formState: { errors, isSubmitting } } = form
  const { submit, formError } = useFormSubmit(form, async (v) => {
    const r = await createUser({ ...v, manager_id: v.manager_id || undefined, password: v.password || undefined })
    toast.success(r.invited ? `Invitation sent to ${v.email}` : `Account created. Share the temporary password with ${v.full_name}.`)
    onDone()
  })
  return (
    <Modal open title="Add user" onClose={() => !isSubmitting && onClose()}>
      <form onSubmit={submit} noValidate>
        <FormError message={formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={errors.full_name?.message}><input className="input" {...register('full_name')} /></Field>
          <Field label="Email" required error={errors.email?.message}><input type="email" className="input" {...register('email')} /></Field>
          <Field label="Role"><select className="input" disabled={!canAssign} {...register('role')}>{roles.filter((r) => r.key !== 'super_admin' || isSuperAdmin).map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select></Field>
          <Field label="Team lead"><select className="input" disabled={!canAssign} {...register('manager_id')}><option value="">None</option>{users.filter((u) => u.is_active).map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}</select></Field>
          <Field label="Job title"><input className="input" {...register('job_title')} /></Field>
          <Field label="Department"><input className="input" {...register('department')} /></Field>
          <Field label="Phone"><input className="input" {...register('phone')} /></Field>
          <Field label="Temporary password (optional)" error={errors.password?.message}><input type="text" autoComplete="off" className="input" {...register('password')} /></Field>
        </div>
        <p className="mt-3 text-xs text-ink-500">Leave the password empty to email an invitation link (needs email set up in Supabase). With a password, the person must change it the first time they sign in.</p>
        <FormFooter busy={isSubmitting} onCancel={onClose} label="Add user" />
      </form>
    </Modal>
  )
}

function EditUserModal({ user, onClose, onDone }) {
  const form = useForm({
    resolver: zodResolver(editSchema),
    defaultValues: { full_name: user.full_name || '', phone: user.phone || '', job_title: user.job_title || '', department: user.department || '' },
  })
  const { register, formState: { errors, isSubmitting } } = form
  const { submit, formError } = useFormSubmit(form, async (v) => {
    await updateUser(user.id, { full_name: v.full_name.trim(), phone: v.phone?.trim() || null, job_title: v.job_title?.trim() || null, department: v.department?.trim() || null })
    toast.success('User updated')
    onDone()
  })
  return (
    <Modal open title={`Edit ${user.full_name || user.email}`} onClose={() => !isSubmitting && onClose()} size="sm">
      <form onSubmit={submit} noValidate>
        <FormError message={formError} />
        <div className="space-y-4">
          <Field label="Full name" required error={errors.full_name?.message}><input className="input" {...register('full_name')} /></Field>
          <Field label="Job title"><input className="input" {...register('job_title')} /></Field>
          <Field label="Department"><input className="input" {...register('department')} /></Field>
          <Field label="Phone"><input className="input" {...register('phone')} /></Field>
        </div>
        <FormFooter busy={isSubmitting} onCancel={onClose} />
      </form>
    </Modal>
  )
}

// ============ 1-CLICK ACCESS PRESETS FOR SUPER ADMIN ============
const ACCESS_PRESETS = [
  {
    id: 'full_admin',
    name: 'Full Workspace Admin',
    desc: 'Unrestricted access to all modules and features',
    icon: Crown,
    role: 'super_admin',
    scope: 'all',
    customModules: false,
    modules: ALL_SYSTEM_MODULES,
    exportAllowed: true,
  },
  {
    id: 'sales_rep',
    name: 'Sales Rep (Standard)',
    desc: 'Core CRM pipeline: own leads & deals only, export disabled',
    icon: Briefcase,
    role: 'sales_executive',
    scope: 'own',
    customModules: true,
    modules: ['dashboard', 'leads', 'website_queries', 'organizations', 'contacts', 'deals', 'tasks', 'activities'],
    exportAllowed: false,
  },
  {
    id: 'sales_mgr',
    name: 'Sales Manager',
    desc: 'Team leads, deals, performance reports, and data exports',
    icon: ShieldCheck,
    role: 'sales_manager',
    scope: 'team',
    customModules: true,
    modules: ['dashboard', 'leads', 'website_queries', 'organizations', 'contacts', 'deals', 'tasks', 'activities', 'reports'],
    exportAllowed: true,
  },
  {
    id: 'ops_delivery',
    name: 'Operations & Delivery',
    desc: 'Client projects, support tickets, tasks, and file storage',
    icon: Wrench,
    role: 'sales_executive',
    scope: 'all',
    customModules: true,
    modules: ['dashboard', 'projects', 'tickets', 'tasks', 'activities', 'files', 'organizations', 'contacts'],
    exportAllowed: true,
  },
  {
    id: 'finance',
    name: 'Finance & Invoicing',
    desc: 'Invoicing, financial reporting, and client accounts',
    icon: CreditCard,
    role: 'finance_controller',
    scope: 'all',
    customModules: true,
    modules: ['dashboard', 'invoices', 'reports', 'organizations', 'contacts'],
    exportAllowed: true,
  },
  {
    id: 'auditor',
    name: 'Read-Only Auditor',
    desc: 'Company-wide read visibility with export restrictions',
    icon: Eye,
    role: 'analyst',
    scope: 'all',
    customModules: false,
    modules: ALL_SYSTEM_MODULES,
    exportAllowed: false,
  },
]

// ============ SUPER ADMIN ACCESS CONTROL MODAL (RBAC + PBAC + ABAC) ============
function UserAccessControlModal({ user, roles, catalog, isSuperAdmin, onClose, onDone }) {
  const [role, setRole] = useState(user.role || 'sales_executive')
  const [recordScope, setRecordScope] = useState(user.record_scope || 'all')
  const [exportAllowed, setExportAllowed] = useState(user.export_allowed !== false)
  const [customModules, setCustomModules] = useState(() => Boolean(user.allowed_modules && user.allowed_modules.length > 0))
  const [allowedModules, setAllowedModules] = useState(() => new Set(user.allowed_modules || ALL_SYSTEM_MODULES))
  const [overrides, setOverrides] = useState(new Map())
  const [showOverrides, setShowOverrides] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState(null)

  const isProtected = Boolean(user.is_permanent)
  const currentRole = roles.find((r) => r.key === role)
  const [rolePerms, setRolePerms] = useState(new Set())

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const [userOverrides, roleP] = await Promise.all([
          listUserPermissions(user.id),
          currentRole ? listRolePermissions(currentRole.id) : Promise.resolve([]),
        ])
        if (!active) return
        const map = new Map()
        userOverrides.forEach((o) => map.set(o.permission, o.effect))
        setOverrides(map)
        setRolePerms(new Set(roleP))
      } catch (e) {
        console.error(e)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [user.id, currentRole?.id])

  const applyPreset = (preset) => {
    if (preset.role === 'super_admin' && !isSuperAdmin) {
      toast.error('Only a Super Admin can assign the Super Admin role.')
      return
    }
    setSelectedPreset(preset.id)
    setRole(preset.role)
    setRecordScope(preset.scope)
    setExportAllowed(preset.exportAllowed)
    setCustomModules(preset.customModules)
    setAllowedModules(new Set(preset.modules))
    setOverrides(new Map())
    toast.success(`Applied '${preset.name}' template!`)
  }

  const toggleModule = (mod) => {
    setSelectedPreset(null)
    setCustomModules(true)
    setAllowedModules((prev) => {
      const next = new Set(prev)
      if (next.has(mod)) next.delete(mod)
      else next.add(mod)
      return next
    })
  }

  const batchSetModules = (moduleList) => {
    setSelectedPreset(null)
    setCustomModules(true)
    setAllowedModules(new Set(moduleList))
  }

  const setOverride = (permKey, effect) => {
    setSelectedPreset(null)
    setOverrides((prev) => {
      const next = new Map(prev)
      if (!effect || effect === 'inherit') {
        next.delete(permKey)
      } else {
        next.set(permKey, effect)
      }
      return next
    })
  }

  const batchModuleOverride = (moduleKey, effect) => {
    setSelectedPreset(null)
    const perms = (catalog || []).filter((p) => p.module === moduleKey)
    setOverrides((prev) => {
      const next = new Map(prev)
      perms.forEach((p) => {
        if (!effect || effect === 'inherit') {
          next.delete(p.key)
        } else {
          next.set(p.key, effect)
        }
      })
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const overridesList = Array.from(overrides.entries()).map(([permission, effect]) => ({
        permission,
        effect,
      }))
      await updateUserAccessControl(user.id, {
        role,
        record_scope: recordScope,
        allowed_modules: customModules ? Array.from(allowedModules) : null,
        export_allowed: exportAllowed,
      })
      await saveUserPermissions(user.id, overridesList)
      toast.success(`Access policy saved for ${user.full_name || user.email}`)
      onDone()
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setSaving(false)
    }
  }

  // Group catalog permissions by module
  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (catalog || []).filter((p) => {
      if (!q) return true
      return p.key.toLowerCase().includes(q) || (MODULE_LABELS[p.module] || p.module).toLowerCase().includes(q)
    })
  }, [catalog, search])

  const modulesMap = useMemo(() => {
    const map = new Map()
    filteredCatalog.forEach((p) => {
      if (!map.has(p.module)) map.set(p.module, [])
      map.get(p.module).push(p)
    })
    return map
  }, [filteredCatalog])

  return (
    <Modal open title={`Access Control: ${user.full_name || user.email}`} size="xl" onClose={() => !saving && onClose()}>
      <div className="space-y-4 max-h-[82vh] overflow-y-auto pr-1 thin-scrollbar">
        {/* User Identity Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink-50 p-3 border border-ink-100">
          <div className="flex items-center gap-3">
            <Avatar person={user} size={42} />
            <div>
              <p className="text-sm font-bold text-ink-900">{user.full_name || '—'}</p>
              <p className="text-xs text-ink-500">{user.email} {user.job_title ? `· ${user.job_title}` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isProtected && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                <Crown className="h-3.5 w-3.5 text-amber-600" /> Protected Founder
              </span>
            )}
            <Badge tone="brand">{currentRole?.name || role}</Badge>
          </div>
        </div>

        {/* 1-Click Role & Security Presets */}
        <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-900">
              <Zap className="h-3.5 w-3.5 text-amber-500" /> Fast 1-Click Access Templates
            </span>
            <span className="text-[11px] text-brand-600 font-medium">Click to configure role, scope & modules instantly</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ACCESS_PRESETS.map((pst) => {
              const Icon = pst.icon
              const active = selectedPreset === pst.id
              return (
                <button
                  key={pst.id}
                  type="button"
                  onClick={() => applyPreset(pst)}
                  className={`flex items-start gap-2.5 rounded-lg border p-2 text-left transition ${
                    active
                      ? 'border-brand-600 bg-white ring-2 ring-brand-500/20 shadow-xs'
                      : 'border-ink-200/80 bg-white hover:border-brand-300 hover:bg-brand-50/50'
                  }`}
                >
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${active ? 'text-brand-600' : 'text-ink-500'}`} />
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold leading-tight truncate ${active ? 'text-brand-900' : 'text-ink-800'}`}>
                      {pst.name}
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink-500 line-clamp-1">{pst.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* SECTION 1: Baseline Role & Data Scope */}
        <div className="grid gap-3 rounded-xl border border-ink-100 p-3.5 sm:grid-cols-2">
          {/* Left: Role Selection & Export Toggle */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-500">1. Assigned Role (RBAC)</label>
              <select
                className="input mt-1.5 w-full font-medium"
                value={role}
                disabled={isProtected || (!isSuperAdmin && user.role === 'super_admin')}
                onChange={(e) => { setSelectedPreset(null); setRole(e.target.value) }}
              >
                {roles.filter((r) => r.key !== 'super_admin' || isSuperAdmin || user.role === 'super_admin').map((r) => (
                  <option key={r.key} value={r.key}>{r.name} {r.is_system ? '(Built-in)' : '(Custom)'}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-ink-400">Sets baseline capabilities across modules.</p>
            </div>

            <div className="rounded-lg border border-ink-200 p-2.5">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportAllowed}
                  onChange={(e) => { setSelectedPreset(null); setExportAllowed(e.target.checked) }}
                  className="h-4 w-4 rounded accent-[#4b4bc4]"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-ink-900">Allow Data Export</span>
                    <span className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${exportAllowed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                      {exportAllowed ? 'Allowed' : 'Blocked'}
                    </span>
                  </div>
                  <p className="text-[10px] text-ink-400">When blocked, downloading CSV, Excel or PDF is disabled.</p>
                </div>
              </label>
            </div>
          </div>

          {/* Right: Record Data Scope */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-500 mb-1.5">2. Record Visibility Scope (ABAC)</label>
            <div className="space-y-1.5">
              <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2 text-left transition ${recordScope === 'own' ? 'border-brand-600 bg-brand-50/50 ring-1 ring-brand-600/30' : 'border-ink-200 hover:bg-ink-50'}`}>
                <input type="radio" name="scope" value="own" checked={recordScope === 'own'} onChange={() => { setSelectedPreset(null); setRecordScope('own') }} className="mt-0.5 accent-[#4b4bc4]" />
                <div>
                  <span className="font-semibold text-xs text-ink-900">Strict Own Only</span>
                  <p className="text-[10px] text-ink-500">Only records created by or assigned to them.</p>
                </div>
              </label>

              <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2 text-left transition ${recordScope === 'team' ? 'border-brand-600 bg-brand-50/50 ring-1 ring-brand-600/30' : 'border-ink-200 hover:bg-ink-50'}`}>
                <input type="radio" name="scope" value="team" checked={recordScope === 'team'} onChange={() => { setSelectedPreset(null); setRecordScope('team') }} className="mt-0.5 accent-[#4b4bc4]" />
                <div>
                  <span className="font-semibold text-xs text-ink-900">Direct Team Scope</span>
                  <p className="text-[10px] text-ink-500">Own records plus direct reports reporting to them.</p>
                </div>
              </label>

              <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2 text-left transition ${recordScope === 'all' ? 'border-brand-600 bg-brand-50/50 ring-1 ring-brand-600/30' : 'border-ink-200 hover:bg-ink-50'}`}>
                <input type="radio" name="scope" value="all" checked={recordScope === 'all'} onChange={() => { setSelectedPreset(null); setRecordScope('all') }} className="mt-0.5 accent-[#4b4bc4]" />
                <div>
                  <span className="font-semibold text-xs text-ink-900">Entire Workspace</span>
                  <p className="text-[10px] text-ink-500">Company-wide records (subject to role permissions).</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* SECTION 2: Allowed Modules (Which screens can they open?) */}
        <div className="rounded-xl border border-ink-100 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-ink-500">3. Allowed Modules & Screens (ABAC)</label>
              <p className="text-[11px] text-ink-500">Unselected modules are completely hidden from sidebar, topbar, and database.</p>
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => { setSelectedPreset(null); setCustomModules(false); setAllowedModules(new Set(ALL_SYSTEM_MODULES)) }}
                className={`rounded px-2 py-0.5 text-xs font-medium transition ${!customModules ? 'bg-brand-600 text-white font-semibold' : 'border border-ink-200 text-ink-600 hover:bg-ink-50'}`}
              >
                All Modules
              </button>
              <button
                type="button"
                onClick={() => batchSetModules(['dashboard', 'leads', 'website_queries', 'organizations', 'contacts', 'deals', 'tasks', 'activities'])}
                className="rounded border border-ink-200 px-2 py-0.5 text-xs text-ink-600 hover:bg-ink-50"
              >
                CRM Only
              </button>
              <button
                type="button"
                onClick={() => batchSetModules(['dashboard', 'projects', 'tickets', 'tasks', 'activities', 'files'])}
                className="rounded border border-ink-200 px-2 py-0.5 text-xs text-ink-600 hover:bg-ink-50"
              >
                Ops Only
              </button>
              <button
                type="button"
                onClick={() => batchSetModules(['dashboard', 'invoices', 'reports', 'organizations', 'contacts'])}
                className="rounded border border-ink-200 px-2 py-0.5 text-xs text-ink-600 hover:bg-ink-50"
              >
                Finance Only
              </button>
              <button
                type="button"
                onClick={() => { setSelectedPreset(null); setCustomModules(true); setAllowedModules(new Set()) }}
                className="rounded border border-ink-200 px-2 py-0.5 text-xs text-rose-600 hover:bg-rose-50"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {ALL_SYSTEM_MODULES.map((mod) => {
              const checked = allowedModules.has(mod)
              const ModIcon = MODULE_ICONS[mod] || Layers
              return (
                <label
                  key={mod}
                  className={`flex cursor-pointer items-center justify-between rounded-lg border p-2 text-xs transition ${
                    checked
                      ? 'border-brand-500 bg-brand-50/50 font-semibold text-brand-900 shadow-2xs'
                      : 'border-ink-200 bg-white text-ink-400 hover:bg-ink-50/60'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <ModIcon className={`h-4 w-4 shrink-0 ${checked ? 'text-brand-600' : 'text-ink-400'}`} />
                    <span className="truncate">{MODULE_LABELS[mod] || mod}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleModule(mod)}
                    className="h-3.5 w-3.5 rounded accent-[#4b4bc4]"
                  />
                </label>
              )
            })}
          </div>
        </div>

        {/* SECTION 3: Advanced Granular Overrides (PBAC Accordion) */}
        <div className="rounded-xl border border-ink-100 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowOverrides((v) => !v)}
            className="w-full flex items-center justify-between bg-ink-50/70 px-3.5 py-2.5 text-xs font-bold text-ink-700 hover:bg-ink-100/70 transition"
          >
            <div className="flex items-center gap-2">
              <Sliders className="h-3.5 w-3.5 text-brand-600" />
              <span>4. Advanced Permission Overrides (PBAC - Optional)</span>
              {overrides.size > 0 && (
                <span className="rounded-full bg-violet-100 text-violet-800 px-2 py-0.5 text-[10px] font-bold">
                  {overrides.size} Custom Override{overrides.size > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {showOverrides ? <ChevronUp className="h-4 w-4 text-ink-400" /> : <ChevronDown className="h-4 w-4 text-ink-400" />}
          </button>

          {showOverrides && (
            <div className="p-3 space-y-3 bg-white">
              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
                  <input
                    className="input !py-1 !pl-8 text-xs"
                    placeholder="Search specific action (e.g. invoices.approve, leads.delete)..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {overrides.size > 0 && (
                  <button type="button" onClick={() => setOverrides(new Map())} className="text-xs text-rose-600 hover:underline">
                    Reset all overrides
                  </button>
                )}
              </div>

              {loading ? (
                <Spinner className="py-6" />
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-2.5 thin-scrollbar pr-1">
                  {[...modulesMap.entries()].map(([module, perms]) => (
                    <div key={module} className="rounded-lg border border-ink-100 overflow-hidden">
                      <div className="flex items-center justify-between bg-ink-50 px-3 py-1.5 text-xs font-semibold text-ink-700">
                        <span>{MODULE_LABELS[module] || module}</span>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <button
                            type="button"
                            onClick={() => batchModuleOverride(module, 'allow')}
                            className="text-emerald-700 hover:underline font-medium"
                          >
                            + Grant All
                          </button>
                          <span className="text-ink-300">·</span>
                          <button
                            type="button"
                            disabled={isProtected}
                            onClick={() => batchModuleOverride(module, 'deny')}
                            className={`text-rose-700 hover:underline font-medium ${isProtected ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >
                            - Block All
                          </button>
                          <span className="text-ink-300">·</span>
                          <button
                            type="button"
                            onClick={() => batchModuleOverride(module, 'inherit')}
                            className="text-ink-500 hover:underline"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                      <div className="divide-y divide-ink-100">
                        {perms.map((p) => {
                          const inRole = rolePerms.has(p.key) || rolePerms.has(`${module}.manage`) || role === 'super_admin'
                          const currentEffect = overrides.get(p.key)

                          return (
                            <div key={p.key} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                              <div>
                                <p className="font-mono text-ink-800 text-[11px] font-medium">{p.key}</p>
                                <p className="text-[10px] text-ink-400">
                                  Role: <span className={inRole ? 'text-emerald-600 font-semibold' : 'text-ink-400'}>{inRole ? 'Allowed' : 'Not Granted'}</span>
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setOverride(p.key, 'inherit')}
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${!currentEffect ? 'bg-ink-100 text-ink-900 font-semibold' : 'text-ink-400 hover:bg-ink-50'}`}
                                >
                                  Inherit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setOverride(p.key, 'allow')}
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${currentEffect === 'allow' ? 'bg-emerald-100 text-emerald-800 font-bold ring-1 ring-emerald-300' : 'text-ink-500 hover:bg-emerald-50'}`}
                                >
                                  + Grant
                                </button>
                                <button
                                  type="button"
                                  disabled={isProtected}
                                  onClick={() => setOverride(p.key, 'deny')}
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${currentEffect === 'deny' ? 'bg-rose-100 text-rose-800 font-bold ring-1 ring-rose-300' : 'text-ink-500 hover:bg-rose-50'} ${isProtected ? 'opacity-40 cursor-not-allowed' : ''}`}
                                >
                                  - Block
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Live Policy Summary Sticky Ribbon */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50/50 p-3 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold text-brand-900">Summary:</span>
            <span className="rounded bg-white px-2 py-0.5 font-semibold text-brand-700 shadow-2xs border border-brand-200">
              {roles.find((r) => r.key === role)?.name || role}
            </span>
            <span className="rounded bg-white px-2 py-0.5 font-medium text-ink-700 shadow-2xs border border-ink-200">
              Scope: {recordScope === 'all' ? 'All Workspace' : recordScope === 'team' ? 'Team Scope' : 'Strict Own'}
            </span>
            <span className="rounded bg-white px-2 py-0.5 font-medium text-ink-700 shadow-2xs border border-ink-200">
              {customModules ? `${allowedModules.size} Modules Allowed` : 'All Modules Allowed'}
            </span>
            <span className={`rounded px-2 py-0.5 font-medium border shadow-2xs ${exportAllowed ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'}`}>
              Export: {exportAllowed ? 'Allowed' : 'Blocked'}
            </span>
            {overrides.size > 0 && (
              <span className="rounded bg-violet-50 text-violet-800 px-2 py-0.5 font-medium border border-violet-200 shadow-2xs">
                {overrides.size} PBAC Overrides
              </span>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" className="btn-ghost" disabled={saving} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? 'Saving...' : 'Save access policy'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default function UsersSection() {
  const { profile, can, isSuperAdmin } = useAuth()
  const users = useFetch(listUsers, [])
  const roles = useFetch(listRoles, [])
  const catalog = useFetch(listPermissions, [])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [accessUser, setAccessUser] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [busy, setBusy] = useState(false)
  const [canCreate, canEdit, canAssign, canDelete] = [can('users.create'), can('users.edit'), can('users.assign'), can('users.delete')]
  const canManageAccess = isSuperAdmin || can('roles.manage') || can('users.manage')

  const roleName = (key) => roles.data?.find((r) => r.key === key)?.name || key
  const visible = useMemo(() => (users.data || []).filter((u) => {
    const t = search.trim().toLowerCase()
    return (!t || [u.full_name, u.email, u.job_title, u.department].some((x) => x?.toLowerCase().includes(t)))
      && (!roleFilter || u.role === roleFilter) && (!statusFilter || (statusFilter === 'active') === u.is_active)
  }), [users.data, search, roleFilter, statusFilter])

  const change = async (id, patch, msg) => {
    setBusy(true)
    try {
      await updateUser(id, patch)
      toast.success(msg)
      users.reload()
    } catch (e) {
      toast.error(friendlyError(e))
      users.reload()
    } finally {
      setBusy(false)
    }
  }

  const sendReset = async (u) => {
    const { error } = await supabase.auth.resetPasswordForEmail(u.email, { redirectTo: `${window.location.origin}/reset-password` })
    if (error) toast.error(friendlyError(error))
    else toast.success(`Password reset email sent to ${u.email}`)
  }

  const pending = (users.data || []).filter((u) => !u.is_active).length

  return (
    <Card title="Users & Access Control" description="Manage accounts, team roles, data scopes, and granular permissions (RBAC · PBAC · ABAC). Only features authorized by Super Admin will be accessible.">
      {users.loading && !users.data ? <Spinner /> : users.error ? <ErrorState message={users.error} onRetry={users.reload} /> : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" aria-hidden />
              <input className="input !pl-9" placeholder="Search name, email, title" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search users" />
            </div>
            <select className="input !w-auto" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
              <option value="">Any role</option>
              {(roles.data || []).map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
            <select className="input !w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            {canCreate && (
              <button className="btn-primary ml-auto" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" /> Add user
              </button>
            )}
          </div>

          {pending > 0 && canEdit && (
            <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              {pending} {pending === 1 ? 'person is' : 'people are'} inactive. Activate anyone who should have access.
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border border-ink-100">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-ink-50 text-xs font-semibold text-ink-500">
                <tr>
                  <th className="px-4 py-2.5">User</th>
                  <th className="px-4 py-2.5">Role & Scope</th>
                  <th className="px-4 py-2.5">Team lead</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Joined</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {visible.map((u) => {
                  const me = u.id === profile.id
                  const isFounder = Boolean(u.is_permanent)
                  const locked = (u.role === 'super_admin' && !isSuperAdmin) || isFounder

                  return (
                    <tr key={u.id} className={isFounder ? 'bg-amber-50/20' : undefined}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <Avatar person={u} size={32} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="truncate font-semibold text-ink-900">{u.full_name || '—'}</p>
                              {me && <span className="text-xs font-normal text-ink-500">(you)</span>}
                              {isFounder && (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-300">
                                  <Crown className="h-3 w-3 text-amber-600" /> Protected
                                </span>
                              )}
                            </div>
                            <p className="truncate text-xs text-ink-500">{[u.job_title, u.email].filter(Boolean).join(' · ')}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            {isFounder ? (
                              <Badge tone="violet">Super Admin</Badge>
                            ) : canAssign && !me && !locked ? (
                              <select
                                className="input !w-auto !py-1 text-xs"
                                value={u.role}
                                disabled={busy}
                                aria-label={`Role for ${u.full_name || u.email}`}
                                onChange={(e) => change(u.id, { role: e.target.value }, 'Role updated')}
                              >
                                {(roles.data || []).filter((r) => r.key !== 'super_admin' || isSuperAdmin || u.role === 'super_admin').map((r) => (
                                  <option key={r.key} value={r.key}>{r.name}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="font-medium">{roleName(u.role)}</span>
                            )}
                          </div>
                          {/* ABAC Scope Badges */}
                          <div className="flex flex-wrap gap-1 text-[10px]">
                            {u.record_scope && u.record_scope !== 'all' && (
                              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700 font-semibold">
                                Scope: {u.record_scope}
                              </span>
                            )}
                            {u.allowed_modules && (
                              <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-700 font-semibold">
                                {u.allowed_modules.length} modules
                              </span>
                            )}
                            {u.export_allowed === false && (
                              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700 font-semibold">
                                No export
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {isFounder ? (
                          <span className="text-xs font-semibold text-ink-500">Root Organization</span>
                        ) : canAssign && !locked ? (
                          <select
                            className="input !w-auto !py-1 text-xs"
                            value={u.manager_id || ''}
                            disabled={busy}
                            aria-label={`Team lead for ${u.full_name || u.email}`}
                            onChange={(e) => change(u.id, { manager_id: e.target.value || null }, 'Team updated')}
                          >
                            <option value="">None</option>
                            {(users.data || []).filter((m) => m.id !== u.id && m.is_active).map((m) => (
                              <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                            ))}
                          </select>
                        ) : (
                          users.data?.find((m) => m.id === u.manager_id)?.full_name || '—'
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {isFounder ? (
                          <Badge tone="green">Permanent Active</Badge>
                        ) : canEdit && !me && !locked ? (
                          <button
                            className="btn-ghost !py-1 text-xs"
                            disabled={busy}
                            onClick={() => change(u.id, { is_active: !u.is_active }, u.is_active ? 'User deactivated' : 'User activated')}
                          >
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        ) : (
                          <Badge tone={u.is_active ? 'green' : 'amber'}>{u.is_active ? 'Active' : 'Inactive'}</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-500 text-xs">{fmtDate(u.created_at)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          {canManageAccess && (
                            <button
                              className="btn-ghost !p-1.5 text-brand-600 hover:!bg-brand-50"
                              title="Access Control (RBAC · PBAC · ABAC)"
                              aria-label={`Configure access for ${u.full_name || u.email}`}
                              onClick={() => setAccessUser(u)}
                            >
                              <ShieldCheck className="h-4 w-4" />
                            </button>
                          )}
                          {canEdit && (!locked || me) && (
                            <button
                              className="btn-ghost !p-1.5"
                              title="Edit user details"
                              aria-label={`Edit ${u.full_name || u.email}`}
                              onClick={() => setEditing(u)}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          {canEdit && (
                            <button
                              className="btn-ghost !p-1.5"
                              title="Send password reset"
                              aria-label={`Send password reset to ${u.email}`}
                              onClick={() => sendReset(u)}
                            >
                              <KeyRound className="h-4 w-4" />
                            </button>
                          )}
                          {canDelete && !me && !locked && !isFounder && (
                            <button
                              className="btn-ghost !p-1.5 hover:!bg-red-50 hover:!text-red-600"
                              title="Remove user"
                              aria-label={`Remove ${u.full_name || u.email}`}
                              onClick={() => setRemoving(u)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!visible.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-500">No users match.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-500">{visible.length} of {users.data.length} users</p>
        </>
      )}

      {adding && roles.data && (
        <AddUserModal
          roles={roles.data}
          users={users.data || []}
          canAssign={canAssign}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setAdding(false)}
          onDone={() => { setAdding(false); users.reload() }}
        />
      )}

      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); users.reload() }}
        />
      )}

      {accessUser && roles.data && catalog.data && (
        <UserAccessControlModal
          user={accessUser}
          roles={roles.data}
          catalog={catalog.data}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setAccessUser(null)}
          onDone={() => { setAccessUser(null); users.reload() }}
        />
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove user?"
        confirmLabel="Remove"
        message={`${removing?.full_name || removing?.email} will lose access permanently and their account will be deleted. Records they created or owned stay in the CRM. To keep their account but stop access, deactivate them instead.`}
        onConfirm={async () => {
          if (removing?.is_permanent) {
            toast.error('This account is permanently protected and cannot be removed.')
            setRemoving(null)
            return
          }
          await removeUser(removing.id)
          toast.success('User removed')
          setRemoving(null)
          users.reload()
        }}
        onClose={() => setRemoving(null)}
      />
    </Card>
  )
}
