import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckSquare, Copy, Plus, Shield, Sparkles, Trash2, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import { friendlyError } from '../../lib/errors'
import { ACTION_LABELS, ACTION_ORDER, MODULE_LABELS, UPCOMING_MODULES } from '../../constants/permissions'
import { createRole, deleteRole, listPermissions, listRolePermissions, listRoles, listUsers, saveRolePermissions } from '../../services/settings'
import { Field, FormError, FormFooter } from '../../components/forms/FormParts'
import Badge from '../../components/common/Badge'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import ErrorState from '../../components/common/ErrorState'
import Modal from '../../components/common/Modal'
import Spinner from '../../components/common/Spinner'
import { Card } from './Sections'

const schema = z.object({ name: z.string().trim().min(1, 'Enter a role name').max(60), description: z.string().trim().max(200).optional() })

function NewRoleModal({ onClose, onDone }) {
  const { profile } = useAuth()
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { name: '', description: '' } })
  const { submit, formError } = useFormSubmit(form, async (v) => { const r = await createRole(v, profile); toast.success('Role created. Now choose its permissions.'); onDone(r.id) })
  return (
    <Modal open title="New role" onClose={() => !form.formState.isSubmitting && onClose()} size="sm">
      <form onSubmit={submit} noValidate>
        <FormError message={formError} />
        <div className="space-y-4">
          <Field label="Role name" required error={form.formState.errors.name?.message}><input autoFocus className="input" placeholder="e.g. Support Agent" {...form.register('name')} /></Field>
          <Field label="Description"><input className="input" {...form.register('description')} /></Field>
        </div>
        <FormFooter busy={form.formState.isSubmitting} onCancel={onClose} label="Create role" />
      </form>
    </Modal>
  )
}

export default function RolesSection() {
  const { can } = useAuth()
  const editable = can('roles.manage')
  const roles = useFetch(listRoles, [])
  const users = useFetch(listUsers, [])
  const catalog = useFetch(listPermissions, [])
  const [selectedId, setSelectedId] = useState(null)
  const roleId = selectedId || roles.data?.[0]?.id
  const role = roles.data?.find((r) => r.id === roleId)
  const saved = useFetch(() => (roleId ? listRolePermissions(roleId) : Promise.resolve([])), [roleId])
  const [draft, setDraft] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [cloningRole, setCloningRole] = useState(false)

  useEffect(() => { if (saved.data) setDraft(new Set(saved.data)) }, [saved.data])
  const modules = useMemo(() => { const m = new Map(); (catalog.data || []).forEach((p) => { if (!m.has(p.module)) m.set(p.module, new Map()); m.get(p.module).set(p.action, p.key) }); return m }, [catalog.data])
  const userCount = (key) => (users.data || []).filter((u) => u.role === key).length

  const base = new Set(saved.data || [])
  const add = [...draft].filter((k) => !base.has(k)); const remove = [...base].filter((k) => !draft.has(k))
  const dirty = add.length + remove.length > 0
  const locked = !editable || role?.key === 'super_admin'
  const toggle = (key) => setDraft((d) => { const n = new Set(d); n.has(key) ? n.delete(key) : n.add(key); return n })

  // Quick module row actions: 'view' | 'full' | 'none'
  const setModuleRow = (moduleKey, mode) => {
    if (locked) return
    const actionsMap = modules.get(moduleKey)
    if (!actionsMap) return

    setDraft((prev) => {
      const next = new Set(prev)
      const allRowKeys = Array.from(actionsMap.values())

      if (mode === 'none') {
        allRowKeys.forEach((k) => next.delete(k))
      } else if (mode === 'view') {
        allRowKeys.forEach((k) => next.delete(k))
        const viewKey = actionsMap.get('view')
        if (viewKey) next.add(viewKey)
      } else if (mode === 'full') {
        allRowKeys.forEach((k) => next.add(k))
      }
      return next
    })
  }

  // Clone/copy permissions from another role
  const handleCopyFromRole = async (sourceRoleId) => {
    if (!sourceRoleId || locked) return
    setCloningRole(true)
    try {
      const sourcePerms = await listRolePermissions(sourceRoleId)
      setDraft(new Set(sourcePerms))
      const sourceRole = roles.data?.find((r) => r.id === sourceRoleId)
      toast.success(`Copied permissions from "${sourceRole?.name || 'role'}"! Remember to save.`)
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setCloningRole(false)
    }
  }

  const save = async () => {
    setSaving(true)
    try { await saveRolePermissions(roleId, add, remove); toast.success('Permissions saved'); saved.reload() } catch (e) { toast.error(friendlyError(e)) } finally { setSaving(false) }
  }

  if ((roles.loading && !roles.data) || (catalog.loading && !catalog.data)) return <Spinner className="py-16" />
  if (roles.error || catalog.error) return <ErrorState message={roles.error || catalog.error} onRetry={() => { roles.reload(); catalog.reload() }} />

  return (
    <Card title="Roles & permissions" description="Choose what each role can do in every module. Changes apply to everyone with that role the next time they open the app. The database enforces these rules, not just the screens.">
      {!editable && <p className="mb-3 rounded-lg bg-ink-50 p-3 text-sm text-ink-700">You can view roles but not change them.</p>}
      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="shrink-0 lg:w-56">
          <ul className="space-y-1" aria-label="Roles">
            {roles.data.map((r) => (
              <li key={r.id}><button onClick={() => setSelectedId(r.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${r.id === roleId ? 'bg-brand-50 font-semibold text-brand-700' : 'hover:bg-ink-100'}`}>
                <span className="block truncate">{r.name}</span><span className="text-xs font-normal text-ink-500">{userCount(r.key)} {userCount(r.key) === 1 ? 'user' : 'users'}{r.is_system ? ' · built-in' : ''}</span></button></li>))}
          </ul>
          {editable && <button className="btn-ghost mt-3 w-full border border-ink-300" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New role</button>}
        </div>

        <div className="min-w-0 flex-1">
          {role && (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-ink-900">{role.name}</h3>
                  <p className="text-xs text-ink-500">{role.description || 'Configurable role permissions across all system modules.'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {editable && !role.is_system && <button className="btn-ghost !text-red-600" onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4" />Delete role</button>}
                  {!locked && (
                    <>
                      <button className="btn-ghost" disabled={!dirty || saving} onClick={() => setDraft(new Set(saved.data))}>Reset</button>
                      <button className="btn-primary" disabled={!dirty || saving} onClick={save}>
                        {saving ? 'Saving…' : dirty ? `Save changes (${add.length + remove.length})` : 'Save permissions'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Fast Clone / Copy Toolbar */}
              {!locked && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-100 bg-brand-50/50 p-2.5 text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-brand-900">
                    <Sparkles className="h-3.5 w-3.5 text-brand-600" />
                    <span>Quick Template Helper:</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-ink-500">Copy setup from:</span>
                    <select
                      className="rounded border border-ink-200 bg-white px-2 py-1 text-xs text-ink-800 shadow-2xs"
                      defaultValue=""
                      disabled={cloningRole || saving}
                      onChange={(e) => {
                        if (e.target.value) {
                          handleCopyFromRole(e.target.value)
                          e.target.value = ''
                        }
                      }}
                    >
                      <option value="" disabled>Select existing role...</option>
                      {roles.data.filter((r) => r.id !== role.id && r.key !== 'super_admin').map((r) => (
                        <option key={r.id} value={r.id}>{r.name} ({r.is_system ? 'Built-in' : 'Custom'})</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {role.key === 'super_admin' && <p className="mb-3 rounded-lg bg-ink-50 p-3 text-sm text-ink-700">Super Admin always has every permission and cannot be modified.</p>}

              {saved.loading && !saved.data ? <Spinner /> : (
                <div className="overflow-x-auto rounded-lg border border-ink-100">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-ink-50 text-xs font-semibold text-ink-500">
                      <tr>
                        <th className="px-4 py-2.5 text-left">Module</th>
                        <th className="px-2 py-2.5 text-center text-[11px] font-normal text-ink-400">Quick Row</th>
                        {ACTION_ORDER.map((a) => <th key={a} className="px-2 py-2.5 text-center">{ACTION_LABELS[a]}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {[...modules.entries()].map(([module, actions]) => (
                        <tr key={module} className="hover:bg-ink-50/30 transition-colors">
                          <td className="px-4 py-2 font-medium">
                            {MODULE_LABELS[module] || module}
                            {UPCOMING_MODULES.includes(module) && <span className="ml-2"><Badge>Coming soon</Badge></span>}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {!locked && (
                              <div className="inline-flex items-center gap-1 rounded bg-ink-100/70 p-0.5 text-[10px]">
                                <button
                                  type="button"
                                  title="Grant View Only"
                                  onClick={() => setModuleRow(module, 'view')}
                                  className="rounded px-1.5 py-0.5 hover:bg-white text-ink-700 font-medium transition"
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  title="Grant Full Actions"
                                  onClick={() => setModuleRow(module, 'full')}
                                  className="rounded px-1.5 py-0.5 hover:bg-white text-brand-700 font-semibold transition"
                                >
                                  Full
                                </button>
                                <button
                                  type="button"
                                  title="Clear All in Row"
                                  onClick={() => setModuleRow(module, 'none')}
                                  className="rounded px-1.5 py-0.5 hover:bg-white text-rose-600 transition"
                                >
                                  Clear
                                </button>
                              </div>
                            )}
                          </td>
                          {ACTION_ORDER.map((a) => {
                            const key = actions.get(a)
                            return (
                              <td key={a} className="px-2 py-2 text-center">
                                {key ? (
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded accent-[#4b4bc4] cursor-pointer"
                                    disabled={locked || saving}
                                    checked={draft.has(key)}
                                    onChange={() => toggle(key)}
                                    aria-label={`${role.name}: ${ACTION_LABELS[a]} ${MODULE_LABELS[module] || module}`}
                                  />
                                ) : (
                                  <span className="text-ink-300">–</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <ul className="mt-3 space-y-1 text-xs text-ink-500">
                <li><strong>Manage</strong> includes every other action in that module and covers all records, not just your own.</li>
                <li>Without Manage, View, Edit and Delete apply to records a person owns, created, or that belong to their team.</li>
                <li><strong>Assign</strong> controls who can reassign leads, deals and tasks to other people.</li>
              </ul>
            </>
          )}
        </div>
      </div>
      {creating && <NewRoleModal onClose={() => setCreating(false)} onDone={(id) => { setCreating(false); setSelectedId(id); roles.reload() }} />}
      <ConfirmDialog open={deleting} title="Delete role?" message={role && userCount(role.key) > 0 ? `${userCount(role.key)} user(s) still have this role. Move them to another role first.` : `The “${role?.name}” role will be deleted.`}
        onConfirm={async () => { await deleteRole(roleId); toast.success('Role deleted'); setDeleting(false); setSelectedId(null); roles.reload() }} onClose={() => setDeleting(false)} />
    </Card>
  )
}

