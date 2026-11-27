import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Ban,
  Briefcase,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Crown,
  Eye,
  FileText,
  KeyRound,
  Layers,
  Lock,
  Pencil,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
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
  const [activeTab, setActiveTab] = useState('scope') // 'scope' | 'modules' | 'pbac'
  const [role, setRole] = useState(user.role || 'sales_executive')
  const [recordScope, setRecordScope] = useState(user.record_scope || 'all')
  const [exportAllowed, setExportAllowed] = useState(user.export_allowed !== false)
  const [customModules, setCustomModules] = useState(() => Boolean(user.allowed_modules && user.allowed_modules.length > 0))
  const [allowedModules, setAllowedModules] = useState(() => new Set(user.allowed_modules || ALL_SYSTEM_MODULES))
  const [overrides, setOverrides] = useState(new Map())
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
      toast.success(`Access policy updated for ${user.full_name || user.email}`)
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
    <Modal open title={`Access Control: ${user.full_name || user.email}`} size="lg" onClose={() => !saving && onClose()}>
      <div className="space-y-4">
        {/* User Summary Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink-50 p-3">
          <div className="flex items-center gap-3">
            <Avatar person={user} size={38} />
            <div>
              <p className="text-sm font-bold text-ink-900">{user.full_name || '—'}</p>
              <p className="text-xs text-ink-500">{user.email} {user.job_title ? `· ${user.job_title}` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isProtected && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                <Crown className="h-3 w-3 text-amber-600" /> Protected Founder
              </span>
            )}
            <Badge tone="brand">{currentRole?.name || role}</Badge>
          </div>
        </div>

        {/* 1-Click Fast Presets Bar */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-ink-400">
              <Zap className="h-3 w-3 text-amber-500" /> 1-Click Role & Security Presets
            </span>
            <span className="text-[10px] text-ink-400">Click to apply instantly</span>
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
                  className={`flex items-start gap-2 rounded-lg border p-2 text-left transition ${
                    active
                      ? 'border-brand-600 bg-brand-50/60 ring-2 ring-brand-500/20 shadow-xs'
                      : 'border-ink-200 bg-white hover:border-brand-300 hover:bg-ink-50/50'
                  }`}
                >
                  <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${active ? 'text-brand-600' : 'text-ink-500'}`} />
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold leading-tight truncate ${active ? 'text-brand-900' : 'text-ink-800'}`}>
                      {pst.name}
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink-400 line-clamp-1">{pst.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Live Policy Snapshot Banner */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-xs">
          <span className="font-semibold text-ink-700">Active Policy:</span>
          <span className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 font-medium text-brand-700 shadow-2xs border border-brand-200">
            <Shield className="h-3 w-3" /> {roles.find((r) => r.key === role)?.name || role}
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 font-medium text-ink-700 shadow-2xs border border-ink-200">
            Scope: {recordScope === 'all' ? 'All Workspace' : recordScope === 'team' ? 'Direct Team' : 'Strict Own'}
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 font-medium text-ink-700 shadow-2xs border border-ink-200">
            Modules: {customModules ? `${allowedModules.size} of ${ALL_SYSTEM_MODULES.length}` : 'All (Role Default)'}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium border shadow-2xs ${
              exportAllowed
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
          >
            Export: {exportAllowed ? 'Enabled' : 'Blocked'}
          </span>
          {overrides.size > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-violet-50 text-violet-800 border border-violet-200 px-2 py-0.5 font-medium shadow-2xs">
              {overrides.size} PBAC Override{overrides.size > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-ink-100 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('scope')}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2 transition ${activeTab === 'scope' ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-900'}`}
          >
            <Shield className="h-3.5 w-3.5" /> 1. Role & Scope
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('modules')}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2 transition ${activeTab === 'modules' ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-900'}`}
          >
            <Layers className="h-3.5 w-3.5" /> 2. Allowed Modules
            {customModules && <span className="rounded-full bg-brand-100 px-1.5 text-[10px] text-brand-700">{allowedModules.size}</span>}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pbac')}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2 transition ${activeTab === 'pbac' ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-900'}`}
          >
            <Sliders className="h-3.5 w-3.5" /> 3. Advanced Overrides
            {overrides.size > 0 && <span className="rounded-full bg-violet-100 px-1.5 text-[10px] text-violet-700">{overrides.size}</span>}
          </button>
        </div>

        {/* TAB 1: RBAC & Data Scope */}
        {activeTab === 'scope' && (
          <div className="space-y-4 pt-1">
            <div>
              <label className="block text-xs font-semibold text-ink-700">Assigned Role (RBAC)</label>
              <select
                className="input mt-1 w-full"
                value={role}
                disabled={isProtected || (!isSuperAdmin && user.role === 'super_admin')}
                onChange={(e) => { setSelectedPreset(null); setRole(e.target.value) }}
              >
                {roles.filter((r) => r.key !== 'super_admin' || isSuperAdmin || user.role === 'super_admin').map((r) => (
                  <option key={r.key} value={r.key}>{r.name} {r.is_system ? '(Built-in)' : '(Custom)'}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-ink-500">The role sets baseline permissions across modules for this account.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-700">Record Data Scope (ABAC)</label>
              <p className="mb-2 text-[11px] text-ink-500">Controls which records (leads, deals, tasks, projects) this user is allowed to view and edit.</p>
              <div className="grid gap-2.5 sm:grid-cols-3">
                <label className={`flex cursor-pointer flex-col rounded-xl border p-3 text-left transition ${recordScope === 'all' ? 'border-brand-600 bg-brand-50/50 ring-1 ring-brand-600/30' : 'border-ink-200 hover:bg-ink-50'}`}>
                  <input type="radio" name="scope" value="all" checked={recordScope === 'all'} onChange={() => { setSelectedPreset(null); setRecordScope('all') }} className="sr-only" />
                  <span className="font-semibold text-xs text-ink-900">Workspace-wide</span>
                  <span className="mt-1 text-[11px] text-ink-500">Subject to role view/manage permissions.</span>
                </label>
                <label className={`flex cursor-pointer flex-col rounded-xl border p-3 text-left transition ${recordScope === 'team' ? 'border-brand-600 bg-brand-50/50 ring-1 ring-brand-600/30' : 'border-ink-200 hover:bg-ink-50'}`}>
                  <input type="radio" name="scope" value="team" checked={recordScope === 'team'} onChange={() => { setSelectedPreset(null); setRecordScope('team') }} className="sr-only" />
                  <span className="font-semibold text-xs text-ink-900">Team Scope</span>
                  <span className="mt-1 text-[11px] text-ink-500">Own records plus records of direct reports.</span>
                </label>
                <label className={`flex cursor-pointer flex-col rounded-xl border p-3 text-left transition ${recordScope === 'own' ? 'border-brand-600 bg-brand-50/50 ring-1 ring-brand-600/30' : 'border-ink-200 hover:bg-ink-50'}`}>
                  <input type="radio" name="scope" value="own" checked={recordScope === 'own'} onChange={() => { setSelectedPreset(null); setRecordScope('own') }} className="sr-only" />
                  <span className="font-semibold text-xs text-ink-900">Strict Own Only</span>
                  <span className="mt-1 text-[11px] text-ink-500">Isolated strictly to records assigned to or created by them.</span>
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportAllowed}
                  onChange={(e) => { setSelectedPreset(null); setExportAllowed(e.target.checked) }}
                  className="h-4 w-4 rounded accent-[#4b4bc4]"
                />
                <div>
                  <p className="text-xs font-semibold text-ink-900">Allow Data Export (ABAC Policy)</p>
                  <p className="text-[11px] text-ink-500">When disabled, this user cannot download or export CSV, Excel, or PDF data anywhere in the app.</p>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* TAB 2: Allowed Modules (ABAC) */}
        {activeTab === 'modules' && (
          <div className="space-y-3 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-ink-900">Module Access Restrictions</p>
                <p className="text-[11px] text-ink-500">Whitelist specific modules. Non-whitelisted modules won't appear in sidebar or topbar.</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => { setSelectedPreset(null); setCustomModules(false); setAllowedModules(new Set(ALL_SYSTEM_MODULES)) }}
                  className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${!customModules ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-300' : 'text-ink-600 hover:bg-ink-100'}`}
                >
                  All (Role Default)
                </button>
                <button
                  type="button"
                  onClick={() => batchSetModules(['dashboard', 'leads', 'website_queries', 'organizations', 'contacts', 'deals', 'tasks', 'activities'])}
                  className="rounded-lg border border-ink-200 px-2 py-1 text-xs text-ink-600 hover:bg-ink-50"
                >
                  CRM Only
                </button>
                <button
                  type="button"
                  onClick={() => batchSetModules(['dashboard', 'projects', 'tickets', 'tasks', 'activities', 'files'])}
                  className="rounded-lg border border-ink-200 px-2 py-1 text-xs text-ink-600 hover:bg-ink-50"
                >
                  Ops Only
                </button>
                <button
                  type="button"
                  onClick={() => batchSetModules(['dashboard', 'invoices', 'reports', 'organizations', 'contacts'])}
                  className="rounded-lg border border-ink-200 px-2 py-1 text-xs text-ink-600 hover:bg-ink-50"
                >
                  Finance Only
                </button>
                <button
                  type="button"
                  onClick={() => { setSelectedPreset(null); setCustomModules(true); setAllowedModules(new Set()) }}
                  className="rounded-lg border border-ink-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                >
                  Clear All
                </button>
              </div>
            </div>

            {customModules ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ALL_SYSTEM_MODULES.map((mod) => {
                  const checked = allowedModules.has(mod)
                  return (
                    <label
                      key={mod}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-xs transition ${
                        checked ? 'border-brand-300 bg-brand-50/40 font-semibold text-ink-900' : 'border-ink-200 text-ink-500 hover:bg-ink-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleModule(mod)}
                        className="h-3.5 w-3.5 rounded accent-[#4b4bc4]"
                      />
                      <span>{MODULE_LABELS[mod] || mod}</span>
                    </label>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-ink-200 bg-ink-50/50 p-4 text-center">
                <p className="text-xs font-semibold text-ink-800">All Modules Enabled by Role</p>
                <p className="mt-1 text-[11px] text-ink-500">
                  User will see all modules permitted by their role. Click any quick category above or customize below.
                </p>
                <button
                  type="button"
                  onClick={() => setCustomModules(true)}
                  className="btn-ghost mt-2 border border-ink-300 text-xs"
                >
                  Customize Whitelist
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Granular Permission Overrides (PBAC) */}
        {activeTab === 'pbac' && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
                <input
                  className="input !py-1 !pl-8 text-xs"
                  placeholder="Filter permissions or module..."
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
              <Spinner className="py-8" />
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-3 thin-scrollbar pr-1">
                {[...modulesMap.entries()].map(([module, perms]) => (
                  <div key={module} className="rounded-xl border border-ink-100 overflow-hidden">
                    <div className="flex items-center justify-between bg-ink-50 px-3 py-1.5 text-xs font-semibold text-ink-700">
                      <span>{MODULE_LABELS[module] || module}</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => batchModuleOverride(module, 'allow')}
                          className="text-[10px] text-emerald-700 hover:underline"
                        >
                          + Grant All
                        </button>
                        <span className="text-ink-300">·</span>
                        <button
                          type="button"
                          disabled={isProtected}
                          onClick={() => batchModuleOverride(module, 'deny')}
                          className={`text-[10px] text-rose-700 hover:underline ${isProtected ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          - Block All
                        </button>
                        <span className="text-ink-300">·</span>
                        <button
                          type="button"
                          onClick={() => batchModuleOverride(module, 'inherit')}
                          className="text-[10px] text-ink-500 hover:underline"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                    <div className="divide-y divide-ink-100">
                      {perms.map((p) => {
                        const inRole = rolePerms.has(p.key) || rolePerms.has(`${module}.manage`) || role === 'super_admin'
                        const currentEffect = overrides.get(p.key) // 'allow' | 'deny' | undefined

                        return (
                          <div key={p.key} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                            <div>
                              <p className="font-mono text-ink-800 font-medium">{p.key}</p>
                              <p className="text-[10px] text-ink-400">
                                Role Default: <span className={inRole ? 'text-emerald-600 font-semibold' : 'text-ink-400'}>{inRole ? 'Allowed' : 'Not Granted'}</span>
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setOverride(p.key, 'inherit')}
                                className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${!currentEffect ? 'bg-ink-100 text-ink-900 font-semibold' : 'text-ink-500 hover:bg-ink-50'}`}
                              >
                                Inherit
                              </button>
                              <button
                                type="button"
                                onClick={() => setOverride(p.key, 'allow')}
                                className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${currentEffect === 'allow' ? 'bg-emerald-100 text-emerald-800 font-bold ring-1 ring-emerald-300' : 'text-ink-500 hover:bg-emerald-50 hover:text-emerald-700'}`}
                              >
                                + Grant
                              </button>
                              <button
                                type="button"
                                disabled={isProtected}
                                onClick={() => setOverride(p.key, 'deny')}
                                className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${currentEffect === 'deny' ? 'bg-rose-100 text-rose-800 font-bold ring-1 ring-rose-300' : 'text-ink-500 hover:bg-rose-50 hover:text-rose-700'} ${isProtected ? 'opacity-40 cursor-not-allowed' : ''}`}
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

        <div className="flex items-center justify-between border-t border-ink-100 pt-3">
          <p className="text-[11px] text-ink-500">
            Changes apply to {user.full_name || user.email} immediately upon save.
          </p>
          <div className="flex gap-2">
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
