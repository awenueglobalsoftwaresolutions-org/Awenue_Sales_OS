import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { createTask, listTasksByRecord, setTaskStatus } from '../../services/tasks'
import { OPEN_TASK_STATUSES, TASK_TYPES, labelOf } from '../../constants/options'
import { friendlyError } from '../../lib/errors'
import { fmtDay, fmtTime, isTaskOverdue } from '../../lib/format'
import Modal from './Modal'
import Spinner from './Spinner'
import ErrorState from './ErrorState'
import Badge from './Badge'
import TaskForm from '../forms/TaskForm'

// Tasks linked to one record. column: 'lead_id' | 'deal_id' | 'contact_id' | 'organization_id'
export default function RecordTasks({ column, id }) {
  const { profile, can } = useAuth()
  const list = useFetch(() => listTasksByRecord(column, id), [column, id])
  const [adding, setAdding] = useState(false)

  const toggle = async (t) => {
    try { await setTaskStatus(t.id, t.status === 'completed' ? 'pending' : 'completed'); toast.success(t.status === 'completed' ? 'Task reopened' : 'Task completed'); list.reload() }
    catch (e) { toast.error(friendlyError(e)) }
  }
  const add = async (values) => { await createTask(values, profile); toast.success('Task added'); setAdding(false); list.reload() }

  return (
    <section className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Tasks{list.data && <span className="ml-1 font-normal text-ink-500">({list.data.length})</span>}</h2>
        <div className="flex items-center gap-2">
          <Link to="/tasks" className="text-xs font-medium text-brand-600 hover:underline">All tasks</Link>
          {can('tasks.create') && <button className="btn-ghost !py-1.5" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add task</button>}
        </div>
      </div>
      {list.loading && !list.data ? <Spinner className="py-4" />
        : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : !list.data?.length ? <p className="text-sm text-ink-500">No tasks yet. Add a follow-up so nothing slips.</p>
        : (
          <ul className="divide-y divide-ink-100">
            {list.data.map((t) => {
              const done = t.status === 'completed'
              const open = OPEN_TASK_STATUSES.includes(t.status)
              const overdue = isTaskOverdue(t)
              return (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <button onClick={() => toggle(t)} aria-label={done ? `Reopen ${t.title}` : `Complete ${t.title}`}
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-ink-300 hover:border-brand-500'}`}>{done && <Check className="h-3 w-3" />}</button>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-medium ${open ? '' : 'text-ink-500 line-through'}`}>{t.title}</p>
                    <p className="text-xs text-ink-500">{labelOf(TASK_TYPES, t.task_type)} · {t.assignee?.full_name || 'Unassigned'}</p>
                  </div>
                  {open && t.due_date && <span className={`whitespace-nowrap text-xs ${overdue ? 'font-semibold text-red-600' : 'text-ink-500'}`}>{fmtDay(t.due_date)} {fmtTime(t.due_time)}</span>}
                  {overdue && <Badge tone="red">Overdue</Badge>}
                </li>
              )
            })}
          </ul>
        )}
      <Modal open={adding} title="Add task" onClose={() => setAdding(false)} size="lg">
        {adding && <TaskForm initial={{ [column]: id }} onSubmit={add} onCancel={() => setAdding(false)} />}
      </Modal>
    </section>
  )
}
