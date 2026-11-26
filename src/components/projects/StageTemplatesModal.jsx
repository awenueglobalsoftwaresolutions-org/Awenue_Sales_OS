import { useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import Modal from '../common/Modal'
import Spinner from '../common/Spinner'
import ErrorState from '../common/ErrorState'
import { useFetch } from '../../hooks/useFetch'
import { useAuth } from '../../contexts/AuthContext'
import { addStageTemplate, listStageTemplates, setStageTemplateActive } from '../../services/projects'
import { friendlyError } from '../../lib/errors'

// The stages every new project starts with. Changing these doesn't alter existing projects.
export default function StageTemplatesModal({ onClose }) {
  const { profile, can } = useAuth()
  const list = useFetch(listStageTemplates, [])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (fn, msg) => { setBusy(true); try { await fn(); toast.success(msg); list.reload() } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) } }
  return (
    <Modal open title="Project stages" onClose={onClose} size="md">
      <p className="mb-4 text-sm text-ink-500">New projects start with these stages, in order. Turn one off to leave it out of new projects, or add a stage. Existing projects keep their stages.</p>
      {list.loading && !list.data ? <Spinner /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : (
        <ol className="space-y-2">
          {list.data.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-xl border border-ink-100 px-3 py-2">
              <span className={`text-sm ${s.is_active ? 'text-ink-900' : 'text-ink-400 line-through'}`}><span className="mr-2 font-mono text-xs text-ink-400">{s.position}.</span>{s.name}</span>
              {can('projects.manage') && <button className="btn-ghost !py-1 text-xs" disabled={busy} onClick={() => run(() => setStageTemplateActive(s.id, !s.is_active), s.is_active ? 'Stage turned off' : 'Stage turned on')}>{s.is_active ? 'Turn off' : 'Turn on'}</button>}
            </li>))}
        </ol>)}
      {can('projects.manage') && (
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) run(async () => { await addStageTemplate(name, profile.workspace_id, list.data || []); setName('') }, 'Stage added') }}>
          <input className="input" placeholder="New stage name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="New stage name" />
          <button className="btn-primary shrink-0" disabled={busy || !name.trim()}><Plus className="h-4 w-4" />Add stage</button>
        </form>)}
    </Modal>)
}
