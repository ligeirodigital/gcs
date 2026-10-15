import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, ImagePlus, Loader2, PenSquare, RefreshCw, Search, Trash2, UploadCloud, X, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { db, friendlyError } from '../lib/db'
import { useTenant } from '../lib/tenant'
import { can } from '../lib/roles'
import { formatDate, formatDateTime } from '../lib/format'
import { deleteMedia, uploadMedia, validateMediaFile, type MediaMeta, type MediaRow } from '../lib/media'
import { signedUrls } from '../studio/assets'
import { NewProjectDialog } from '../components/NewProjectDialog'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui-kit'

const PAGE = 24
const ALL = '__all__'
interface Upload { key: string; file: File; status: 'queued' | 'uploading' | 'done' | 'error'; progress: number; error?: string }
interface EventOpt { id: string; name: string }
const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

export default function Gallery() {
  const { active } = useTenant()
  const g = active!.group
  const canEdit = can.manageGroup(active!.role) || active!.role === 'communicator'
  const [rows, setRows] = useState<MediaRow[] | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [album, setAlbum] = useState(ALL)
  const [category, setCategory] = useState(ALL)
  const [kind, setKind] = useState(ALL)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [albums, setAlbums] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [events, setEvents] = useState<EventOpt[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<MediaRow | null>(null)
  const [edit, setEdit] = useState<MediaRow[] | null>(null)
  const [del, setDel] = useState<MediaRow[] | null>(null)
  const [art, setArt] = useState<string | null>(null)
  const [queue, setQueue] = useState<Upload[]>([])
  const [meta, setMeta] = useState<{ album: string; category: string; taken_on: string; event_id: string }>({ album: '', category: '', taken_on: '', event_id: '' })
  const fileInput = useRef<HTMLInputElement>(null)

  const loadFacets = useCallback(async () => {
    const [m, e, n] = await Promise.all([
      db.from('media_assets').select('album, category').eq('group_id', g.id).limit(1000),
      db.from('events').select('id, name').eq('group_id', g.id).order('starts_at', { ascending: false }).limit(100),
      db.rpc('group_member_names', { p_group: g.id }),
    ])
    const ms = (m.data ?? []) as { album: string | null; category: string | null }[]
    setAlbums([...new Set(ms.map(r => r.album).filter(Boolean) as string[])].sort())
    setCategories([...new Set(ms.map(r => r.category).filter(Boolean) as string[])].sort())
    setEvents((e.data ?? []) as EventOpt[])
    setNames(Object.fromEntries(((n.data ?? []) as { user_id: string; display_name: string }[]).map(r => [r.user_id, r.display_name])))
  }, [g.id])
  useEffect(() => { void loadFacets() }, [loadFacets])

  const load = useCallback(async () => {
    setError(null)
    let query = db.from('media_assets').select('*', { count: 'exact' }).eq('group_id', g.id).order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)
    const term = q.trim().replace(/[%_,()]/g, '')
    if (term) query = query.or(`title.ilike.%${term}%,album.ilike.%${term}%,category.ilike.%${term}%`)
    if (album !== ALL) query = query.eq('album', album)
    if (category !== ALL) query = query.eq('category', category)
    if (kind !== ALL) query = query.eq('kind', kind)
    if (from) query = query.gte('taken_on', from)
    if (to) query = query.lte('taken_on', to)
    const { data, error, count } = await query
    if (error) { setError(friendlyError(error)); return }
    const list = (data ?? []) as MediaRow[]
    setRows(list); setTotal(count ?? 0)
    try { setUrls(await signedUrls(list.map(r => r.storage_path))) } catch (e) { setError(friendlyError(e)) }
  }, [g.id, page, q, album, category, kind, from, to])
  useEffect(() => { const h = setTimeout(() => void load(), 250); return () => clearTimeout(h) }, [load])
  useEffect(() => { setPage(0); setSel(new Set()) }, [q, album, category, kind, from, to, g.id])

  // ---- envio múltiplo com progresso e nova tentativa ----
  function enqueue(files: File[]) {
    const items: Upload[] = files.map(f => {
      const problem = validateMediaFile(f)
      return { key: crypto.randomUUID(), file: f, status: problem ? 'error' : 'queued', progress: 0, error: problem ?? undefined }
    })
    setQueue(q => [...q, ...items])
    void runUploads(items.filter(i => i.status === 'queued'))
  }
  const patchUpload = (key: string, p: Partial<Upload>) => setQueue(q => q.map(u => (u.key === key ? { ...u, ...p } : u)))
  async function runUploads(items: Upload[]) {
    const metaPayload: MediaMeta = { album: meta.album.trim() || null, category: meta.category.trim() || null, taken_on: meta.taken_on || null, event_id: meta.event_id || null }
    let next = 0
    const worker = async () => {
      while (next < items.length) {
        const it = items[next++]
        patchUpload(it.key, { status: 'uploading', progress: 0, error: undefined })
        try { await uploadMedia(g.id, it.file, metaPayload, f => patchUpload(it.key, { progress: f })); patchUpload(it.key, { status: 'done', progress: 1 }) }
        catch (e) { patchUpload(it.key, { status: 'error', error: (e as Error).message }) }
      }
    }
    await Promise.all([worker(), worker(), worker()])   // até 3 envios simultâneos
    void load(); void loadFacets()
  }
  const retry = (u: Upload) => { const fresh = { ...u, status: 'queued' as const, error: undefined, progress: 0 }; patchUpload(u.key, fresh); void runUploads([fresh]) }
  const active_ = queue.filter(u => u.status === 'uploading' || u.status === 'queued')
  const overall = queue.length ? (queue.reduce((s, u) => s + (u.status === 'done' ? 1 : u.status === 'error' ? 1 : u.progress), 0) / queue.length) * 100 : 0

  const toggle = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const selected = useMemo(() => (rows ?? []).filter(r => sel.has(r.id)), [rows, sel])
  const eventName = (id: string | null) => events.find(e => e.id === id)?.name

  async function confirmDelete() {
    if (!del) return
    try { await deleteMedia(del); toast.success(`${del.length} arquivo(s) excluído(s)`); setSel(new Set()); setPreview(null); void load(); void loadFacets() }
    catch (e) { toast.error((e as Error).message) }
    setDel(null)
  }

  return (
    <>
      <PageHeader title="Galeria de fotos" description="Biblioteca privada do GC: só membros autorizados veem os arquivos, que são entregues por links temporários."
        actions={canEdit ? <Button onClick={() => fileInput.current?.click()}><UploadCloud className="mr-2 h-4 w-4" /> Enviar fotos</Button> : undefined} />
      <input ref={fileInput} type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Selecionar fotos para enviar"
        onChange={e => { enqueue(Array.from(e.target.files ?? [])); e.target.value = '' }} />

      {canEdit && (
        <section className="mb-6 rounded-xl border border-dashed border-border bg-card p-4"
          onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); enqueue(Array.from(e.dataTransfer.files)) }}>
          <p className="mb-3 text-sm font-medium">Organização dos próximos envios <span className="font-normal text-muted-foreground">(opcional — arraste fotos para cá ou use “Enviar fotos”)</span></p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1"><Label htmlFor="up-album" className="text-xs">Álbum</Label><Input id="up-album" list="albums" maxLength={80} value={meta.album} onChange={e => setMeta({ ...meta, album: e.target.value })} /><datalist id="albums">{albums.map(a => <option key={a} value={a} />)}</datalist></div>
            <div className="space-y-1"><Label htmlFor="up-cat" className="text-xs">Categoria</Label><Input id="up-cat" list="cats" maxLength={60} value={meta.category} onChange={e => setMeta({ ...meta, category: e.target.value })} /><datalist id="cats">{categories.map(a => <option key={a} value={a} />)}</datalist></div>
            <div className="space-y-1"><Label htmlFor="up-date" className="text-xs">Data da foto</Label><Input id="up-date" type="date" value={meta.taken_on} onChange={e => setMeta({ ...meta, taken_on: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Evento</Label>
              <Select value={meta.event_id || ALL} onValueChange={v => setMeta({ ...meta, event_id: v === ALL ? '' : v })}><SelectTrigger aria-label="Evento"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={ALL}>Sem evento</SelectItem>{events.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          {queue.length > 0 && (
            <div className="mt-4 space-y-2" aria-live="polite">
              {active_.length > 0 && <div className="space-y-1"><p className="text-sm">Enviando {queue.filter(u => u.status === 'done').length} de {queue.length}…</p><Progress value={overall} /></div>}
              <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                {queue.map(u => (
                  <li key={u.key} className="flex items-center gap-2">
                    {u.status === 'done' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label="Enviado" /> : u.status === 'error' ? <X className="h-4 w-4 shrink-0 text-destructive" aria-label="Erro" /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-label="Enviando" />}
                    <span className="min-w-0 flex-1 truncate">{u.file.name}</span>
                    {u.status === 'uploading' && <span className="text-xs text-muted-foreground">{Math.round(u.progress * 100)}%</span>}
                    {u.status === 'error' && <><span className="max-w-[16rem] truncate text-xs text-destructive" title={u.error}>{u.error}</span>
                      {validateMediaFile(u.file) === null && <Button size="sm" variant="outline" onClick={() => retry(u)}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Tentar novamente</Button>}</>}
                  </li>))}
              </ul>
              {active_.length === 0 && <Button size="sm" variant="ghost" onClick={() => setQueue([])}>Limpar lista</Button>}
            </div>)}
        </section>)}

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative lg:col-span-2"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden /><Input className="pl-9" placeholder="Buscar por título, álbum ou categoria" aria-label="Buscar" value={q} onChange={e => setQ(e.target.value)} /></div>
        <Select value={album} onValueChange={setAlbum}><SelectTrigger aria-label="Filtrar por álbum"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos os álbuns</SelectItem>{albums.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select>
        <Select value={category} onValueChange={setCategory}><SelectTrigger aria-label="Filtrar por categoria"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todas as categorias</SelectItem>{categories.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select>
        <Select value={kind} onValueChange={setKind}><SelectTrigger aria-label="Filtrar por tipo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Fotos e artes</SelectItem><SelectItem value="photo">Somente fotos</SelectItem><SelectItem value="export">Somente artes exportadas</SelectItem></SelectContent></Select>
        <div className="flex gap-1"><Input type="date" aria-label="Data inicial" value={from} onChange={e => setFrom(e.target.value)} /><Input type="date" aria-label="Data final" value={to} onChange={e => setTo(e.target.value)} /></div>
      </div>

      {selected.length > 0 && (
        <div role="status" className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2 text-sm shadow-sm">
          <span className="px-2 font-medium">{selected.length} selecionada(s)</span>
          {canEdit && <Button size="sm" variant="outline" onClick={() => setEdit(selected)}><Pencil className="mr-1 h-4 w-4" /> Editar informações</Button>}
          {canEdit && selected.length === 1 && <Button size="sm" variant="outline" onClick={() => setArt(selected[0].id)}><PenSquare className="mr-1 h-4 w-4" /> Criar arte</Button>}
          {canEdit && <Button size="sm" variant="outline" onClick={() => setDel(selected)}><Trash2 className="mr-1 h-4 w-4" /> Excluir</Button>}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSel(new Set())}>Limpar seleção</Button>
        </div>)}

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : rows === null ? <LoadingState /> : rows.length === 0 ? (
        <EmptyState icon={ImagePlus} title={q || album !== ALL || category !== ALL || kind !== ALL || from || to ? 'Nenhuma foto encontrada' : 'A galeria está vazia'}
          description={q || album !== ALL || category !== ALL || kind !== ALL || from || to ? 'Ajuste a busca ou os filtros.' : 'Envie as fotos dos encontros para usá-las nas artes.'}
          action={canEdit ? <Button onClick={() => fileInput.current?.click()}>Enviar primeiras fotos</Button> : undefined} />
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {rows.map(r => (
              <li key={r.id} className="group relative overflow-hidden rounded-lg border border-border bg-secondary">
                <button type="button" onClick={() => setPreview(r)} className="block aspect-square w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {urls[r.storage_path] ? <img src={urls[r.storage_path]} alt={r.title ?? 'Foto da galeria'} loading="lazy" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center"><Loader2 className="h-4 w-4 animate-spin" /></span>}
                  <span className="sr-only">Abrir {r.title ?? 'foto'}</span></button>
                <label className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded bg-white/90 shadow"><Checkbox checked={sel.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={`Selecionar ${r.title ?? 'foto'}`} /></label>
                {r.kind === 'export' && <span className="absolute right-2 top-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold">ARTE</span>}
                <div className="truncate px-2 py-1 text-xs">{r.title ?? 'Sem título'}</div>
              </li>))}
          </ul>
          <div className="mt-4 flex items-center justify-between text-sm"><span className="text-muted-foreground">{total} arquivo(s)</span>
            <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button><Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(p => p + 1)}>Próxima</Button></div></div>
        </>)}

      {/* pré-visualização */}
      <Dialog open={!!preview} onOpenChange={o => !o && setPreview(null)}>
        <DialogContent className="gc-theme max-h-[92vh] max-w-4xl overflow-y-auto bg-card text-foreground">
          {preview && <>
            <DialogHeader><DialogTitle>{preview.title ?? 'Sem título'}</DialogTitle><DialogDescription>{preview.kind === 'export' ? 'Arte exportada do estúdio' : 'Foto'}</DialogDescription></DialogHeader>
            <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
              <img src={urls[preview.storage_path]} alt={preview.title ?? 'Foto'} className="max-h-[65vh] w-full rounded-lg bg-secondary object-contain" />
              <dl className="space-y-2 text-sm">
                {([['Enviado por', preview.uploaded_by ? names[preview.uploaded_by] ?? 'Ex-membro da equipe' : '—'], ['Enviado em', formatDateTime(preview.created_at, g.timezone)],
                  ['Data da foto', preview.taken_on ? formatDate(preview.taken_on + 'T12:00:00', g.timezone) : '—'], ['Álbum', preview.album ?? '—'], ['Categoria', preview.category ?? '—'],
                  ['Evento', eventName(preview.event_id) ?? '—'], ['Tamanho', `${fmtSize(preview.size_bytes)}${preview.width ? ` · ${preview.width}×${preview.height}` : ''}`]] as const).map(([k, v]) =>
                  <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}
              </dl></div>
            <DialogFooter className="gap-2 sm:gap-2">
              {canEdit && <><Button variant="outline" onClick={() => { setEdit([preview]); setPreview(null) }}><Pencil className="mr-1 h-4 w-4" /> Editar</Button>
                <Button variant="outline" onClick={() => { setArt(preview.id); setPreview(null) }}><PenSquare className="mr-1 h-4 w-4" /> Criar arte</Button>
                <Button variant="outline" onClick={() => { setDel([preview]); setPreview(null) }}><Trash2 className="mr-1 h-4 w-4" /> Excluir</Button></>}
            </DialogFooter></>}
        </DialogContent>
      </Dialog>

      <EditDialog rows={edit} events={events} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void load(); void loadFacets() }} />
      <NewProjectDialog open={!!art} onOpenChange={o => !o && setArt(null)} initial="b:meeting_photo" photoMediaId={art ?? undefined} />
      <AlertDialog open={!!del} onOpenChange={o => !o && setDel(null)}>
        <AlertDialogContent className="gc-theme bg-card text-foreground">
          <AlertDialogHeader><AlertDialogTitle>Excluir {del?.length === 1 ? 'arquivo' : `${del?.length} arquivos`}?</AlertDialogTitle>
            <AlertDialogDescription>Os arquivos serão apagados definitivamente. Projetos que os usam passarão a mostrar um espaço reservado no lugar da foto.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => void confirmDelete()}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function EditDialog({ rows, events, onClose, onSaved }: { rows: MediaRow[] | null; events: EventOpt[]; onClose: () => void; onSaved: () => void }) {
  const single = rows?.length === 1 ? rows[0] : null
  const [f, setF] = useState({ title: '', album: '', category: '', taken_on: '', event_id: '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (rows) setF({ title: single?.title ?? '', album: single?.album ?? '', category: single?.category ?? '', taken_on: single?.taken_on ?? '', event_id: single?.event_id ?? '' }) }, [rows, single])
  async function save() {
    if (!rows) return
    setBusy(true)
    const patch: Record<string, unknown> = {}
    if (single) patch.title = f.title.trim() || null
    // em edição em lote, campos vazios não sobrescrevem os valores existentes
    const put = (k: string, v: string) => { if (single || v) patch[k] = v || null }
    put('album', f.album.trim()); put('category', f.category.trim()); put('taken_on', f.taken_on); put('event_id', f.event_id)
    const { error } = await db.from('media_assets').update(patch).in('id', rows.map(r => r.id))
    setBusy(false)
    if (error) { toast.error(friendlyError(error)); return }
    toast.success('Informações atualizadas'); onSaved()
  }
  return (
    <Dialog open={!!rows} onOpenChange={o => !o && onClose()}>
      <DialogContent className="gc-theme bg-card text-foreground">
        <DialogHeader><DialogTitle>Editar informações</DialogTitle><DialogDescription>{single ? 'Dados da foto.' : `Aplicar a ${rows?.length} fotos. Campos em branco não alteram o valor atual.`}</DialogDescription></DialogHeader>
        {single && <div className="space-y-1"><Label htmlFor="ed-title">Título</Label><Input id="ed-title" maxLength={160} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="ed-album">Álbum</Label><Input id="ed-album" maxLength={80} value={f.album} onChange={e => setF({ ...f, album: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="ed-cat">Categoria</Label><Input id="ed-cat" maxLength={60} value={f.category} onChange={e => setF({ ...f, category: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="ed-date">Data da foto</Label><Input id="ed-date" type="date" value={f.taken_on} onChange={e => setF({ ...f, taken_on: e.target.value })} /></div>
          <div className="space-y-1"><Label>Evento</Label><Select value={f.event_id || ALL} onValueChange={v => setF({ ...f, event_id: v === ALL ? '' : v })}><SelectTrigger aria-label="Evento"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>{single ? 'Sem evento' : 'Não alterar'}</SelectItem>{events.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <DialogFooter><Button disabled={busy} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
