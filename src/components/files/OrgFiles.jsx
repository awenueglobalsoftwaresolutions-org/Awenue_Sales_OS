import { useRef, useState } from 'react'
import { AlertCircle, ChevronRight, Download, File, FileArchive, FileSpreadsheet, FileText, Folder, FolderPlus, Image as ImageIcon, Loader2, Pencil, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { createFolder, deleteItem, filesConfigured, getFileUrl, listItems, MAX_UPLOAD_MB, renameItem, uploadFile } from '../../services/files'
import { friendlyError } from '../../lib/errors'
import { fmtBytes, fmtDate } from '../../lib/format'
import Spinner from '../common/Spinner'
import ErrorState from '../common/ErrorState'
import EmptyState from '../common/EmptyState'
import ConfirmDialog from '../common/ConfirmDialog'
import NameDialog from './NameDialog'

const PREVIEWABLE = /^(image\/(png|jpe?g|gif|webp|avif)|application\/pdf)$/i

function iconFor(item) {
  if (item.kind === 'folder') return Folder
  const t = item.mime_type || ''
  if (t.startsWith('image/')) return ImageIcon
  if (/spreadsheet|excel|csv/.test(t)) return FileSpreadsheet
  if (/zip|compressed|tar|rar/.test(t)) return FileArchive
  if (/pdf|text|word|document|presentation/.test(t)) return FileText
  return File
}

export default function OrgFiles({ orgId }) {
  const { profile, can } = useAuth()
  const [path, setPath] = useState([])          // [{id, name}] from the top level down
  const parentId = path.length ? path[path.length - 1].id : null
  const list = useFetch(() => listItems(orgId, parentId), [orgId, parentId])
  const [uploads, setUploads] = useState([])    // {key, name, progress, error}
  const [dragging, setDragging] = useState(false)
  const [newFolder, setNewFolder] = useState(false)
  const [renaming, setRenaming] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const fileInput = useRef(null)

  if (!filesConfigured) {
    return (
      <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="font-semibold">File storage isn't connected yet</p>
        <p className="mt-1">Deploy the Cloudflare Worker in the <code>worker/</code> folder and set <code>VITE_FILES_API_URL</code> in your <code>.env</code>, then restart the dev server. The README has the steps.</p>
      </div>
    )
  }

  const startUploads = async (fileList) => {
    const files = [...fileList]
    if (!files.length) return
    const batch = files.map((f, i) => ({ key: `${Date.now()}-${i}`, name: f.name, progress: 0, error: '' }))
    setUploads((u) => [...batch, ...u])
    const patch = (key, p) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...p } : x)))
    for (let i = 0; i < files.length; i++) {
      const { key } = batch[i]
      try {
        await uploadFile(files[i], { orgId, parentId }, (progress) => patch(key, { progress }))
        setUploads((u) => u.filter((x) => x.key !== key))
        list.reload()
      } catch (e) { patch(key, { error: friendlyError(e) }) }
    }
  }

  const openItem = async (item, download) => {
    // Open the tab right away (inside the click) so pop-up blockers allow it, then point it at the signed link.
    const tab = !download ? window.open('', '_blank') : null
    try {
      const url = await getFileUrl(item.id, download)
      if (tab) tab.location.href = url
      else window.location.href = url
    } catch (e) { tab?.close(); toast.error(friendlyError(e)) }
  }
  const clickFile = (item) => (PREVIEWABLE.test(item.mime_type || '') ? openItem(item, false) : openItem(item, true))

  const saveFolder = async (name) => { await createFolder({ orgId, parentId, name }, profile); toast.success('Folder created'); setNewFolder(false); list.reload() }
  const saveRename = async (name) => { await renameItem(renaming.id, name); toast.success('Renamed'); setRenaming(null); list.reload() }
  const confirmDelete = async () => { await deleteItem(deleting.id); toast.success(deleting.kind === 'folder' ? 'Folder deleted' : 'File deleted'); setDeleting(null); list.reload() }

  const onDrop = (e) => { e.preventDefault(); setDragging(false); startUploads(e.dataTransfer.files) }
  const items = list.data || []

  return (
    <section className="rounded-xl border border-ink-100 bg-white shadow-card"
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }} onDrop={can('files.create') ? onDrop : (e) => e.preventDefault()}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 p-4">
        <nav aria-label="Folder path" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
          <button className={`rounded px-1.5 py-0.5 hover:bg-ink-100 ${path.length ? 'text-ink-500' : 'font-semibold'}`} onClick={() => setPath([])}>Files</button>
          {path.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1">
              <ChevronRight className="h-4 w-4 text-ink-300" aria-hidden />
              <button className={`rounded px-1.5 py-0.5 hover:bg-ink-100 ${i === path.length - 1 ? 'font-semibold' : 'text-ink-500'}`} onClick={() => setPath(path.slice(0, i + 1))}>{p.name}</button>
            </span>
          ))}
        </nav>
        <div className="flex gap-2">
          {can('files.create') && <button className="btn-ghost border border-ink-300" onClick={() => setNewFolder(true)}><FolderPlus className="h-4 w-4" />New folder</button>}
          {can('files.create') && <button className="btn-primary" onClick={() => fileInput.current?.click()}><Upload className="h-4 w-4" />Upload</button>}
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => { startUploads(e.target.files); e.target.value = '' }} />
        </div>
      </div>

      {uploads.length > 0 && (
        <ul className="space-y-2 border-b border-ink-100 bg-ink-50 p-4">
          {uploads.map((u) => (
            <li key={u.key} className="flex items-center gap-3 text-sm">
              {u.error ? <AlertCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-600" aria-hidden />}
              <div className="min-w-0 flex-1">
                <p className="truncate">{u.name}</p>
                {u.error ? <p className="text-xs text-red-600">{u.error}</p>
                  : <div className="mt-1 h-1.5 overflow-hidden rounded bg-ink-100" role="progressbar" aria-valuenow={u.progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-brand-600 transition-all" style={{ width: `${u.progress}%` }} /></div>}
              </div>
              {u.error && <button className="btn-ghost !py-1 text-xs" onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))}>Dismiss</button>}
            </li>
          ))}
        </ul>
      )}

      <div className={`relative ${dragging ? 'bg-brand-50' : ''}`}>
        {dragging && <p className="pointer-events-none absolute inset-0 z-10 grid place-items-center border-2 border-dashed border-brand-500 text-sm font-semibold text-brand-700">Drop files to upload here</p>}
        {list.loading && !list.data ? <Spinner className="py-12" />
          : list.error ? <div className="p-4"><ErrorState message={list.error} onRetry={list.reload} /></div>
          : !items.length ? <EmptyState icon={Folder} title={path.length ? 'This folder is empty' : 'No files yet'} description={`Create folders to organize what the client sends you, then drag files here or use Upload. Up to ${MAX_UPLOAD_MB} MB per file.`} />
          : (
            <ul className="divide-y divide-ink-100">
              {items.map((it) => {
                const Icon = iconFor(it)
                const isFolder = it.kind === 'folder'
                return (
                  <li key={it.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-ink-50">
                    <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => (isFolder ? setPath([...path, { id: it.id, name: it.name }]) : clickFile(it))}>
                      <Icon className={`h-5 w-5 shrink-0 ${isFolder ? 'text-amber-500' : 'text-ink-500'}`} aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{it.name}</span>
                        <span className="block truncate text-xs text-ink-500">{isFolder ? 'Folder' : fmtBytes(it.size_bytes)} · {it.uploader?.full_name || 'Someone'} · {fmtDate(it.created_at)}</span>
                      </span>
                    </button>
                    <div className="flex shrink-0 gap-0.5">
                      {!isFolder && <button className="btn-ghost !p-1.5" aria-label={`Download ${it.name}`} onClick={() => openItem(it, true)}><Download className="h-4 w-4" /></button>}
                      {can('files.edit') && <button className="btn-ghost !p-1.5" aria-label={`Rename ${it.name}`} onClick={() => setRenaming(it)}><Pencil className="h-4 w-4" /></button>}
                      {can('files.delete') && <button className="btn-ghost !p-1.5 hover:!bg-red-50 hover:!text-red-600" aria-label={`Delete ${it.name}`} onClick={() => setDeleting(it)}><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
      </div>

      <NameDialog open={newFolder} title="New folder" label="Folder name" onSubmit={saveFolder} onClose={() => setNewFolder(false)} />
      <NameDialog open={Boolean(renaming)} title={`Rename ${renaming?.kind || ''}`} initial={renaming?.name} onSubmit={saveRename} onClose={() => setRenaming(null)} />
      <ConfirmDialog open={Boolean(deleting)} title={deleting?.kind === 'folder' ? 'Delete folder?' : 'Delete file?'}
        message={deleting?.kind === 'folder' ? `“${deleting?.name}” and everything inside it will be permanently deleted.` : `“${deleting?.name}” will be permanently deleted.`}
        onConfirm={confirmDelete} onClose={() => setDeleting(null)} />
    </section>
  )
}
