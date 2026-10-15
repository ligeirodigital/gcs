import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { CalendarCheck, ChevronLeft, ChevronRight, Copy, ExternalLink, Plus, Settings2, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { db, friendlyError } from '../lib/db'
import { useTenant } from '../lib/tenant'
import { useAuth } from '../lib/auth'
import { can } from '../lib/roles'
import { formatDateTime, toLocalInput, zonedToUtc } from '../lib/format'
import { FORMATS, FORMAT_SPECS, type PostFormat } from '../studio/model'
import { STATUS_LABEL } from './Studio'
import { STATUS_FLOW, STATUS_TONE, WEEKDAY_SHORT, addMonths, canSetStatus, dateBR, dayLabel, monthGrid, monthLabel, monthStart, weekDays, weekStart, type PostStatus } from '../lib/calendar'
import { addDays } from '../lib/metrics'
import type { In, Out } from '../lib/schemas'
import { ErrorState, Field, FieldShell, LoadingState, PageHeader, SegmentedControl, SubmitButton } from '../components/ui-kit'

interface Post { id: string; title: string; format: PostFormat; objective: string | null; caption: string | null; status: PostStatus; planned_date: string | null; assignee_id: string | null; approver_id: string | null; notes: string | null; design: unknown; published_at: string | null; published_url: string | null; published_by: string | null }
interface Person { user_id: string; display_name: string }
const ALL = '__all__', NONE = '__none__'

const schema = z.object({
  title: z.string().trim().min(1, 'Informe o título').max(160), objective: z.string().trim().max(300).optional().or(z.literal('')), caption: z.string().trim().max(5000).optional().or(z.literal('')),
  planned_date: z.string().optional().or(z.literal('')), notes: z.string().trim().max(2000).optional().or(z.literal('')),
})

export default function Calendar() {
  const { active, reload } = useTenant()
  const { user } = useAuth()
  const g = active!.group
  const canEdit = can.manageGroup(active!.role) || active!.role === 'communicator'
  const isLeader = can.manageGroup(active!.role)
  const today = useMemo(() => new Intl.DateTimeFormat('en-CA', { timeZone: g.timezone }).format(new Date()), [g.timezone])
  const [view, setView] = useState<'month' | 'week'>('month')
  const [cursor, setCursor] = useState(today)
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [error, setError] = useState<string | null>(null)
  const [fStatus, setFStatus] = useState(ALL), [fFormat, setFFormat] = useState(ALL), [fOwner, setFOwner] = useState(ALL)
  const [edit, setEdit] = useState<Post | { new: true; date: string } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  const range = useMemo(() => {
    if (view === 'week') { const d = weekDays(cursor); return { from: d[0], to: d[6] } }
    const grid = monthGrid(cursor); return { from: grid[0][0], to: grid.at(-1)![6] }
  }, [view, cursor])
  useEffect(() => { void db.rpc('group_member_names', { p_group: g.id }).then(({ data }) => setPeople((data ?? []) as Person[])) }, [g.id])

  const load = useCallback(async () => {
    setError(null)
    let q = db.from('posts').select('id, title, format, objective, caption, status, planned_date, assignee_id, approver_id, notes, design, published_at, published_url, published_by').eq('group_id', g.id)
      .gte('planned_date', range.from).lte('planned_date', range.to).order('planned_date').order('created_at')
    if (fStatus !== ALL) q = q.eq('status', fStatus); if (fFormat !== ALL) q = q.eq('format', fFormat)
    if (fOwner === NONE) q = q.is('assignee_id', null); else if (fOwner !== ALL) q = q.eq('assignee_id', fOwner)
    const { data, error } = await q
    if (error) { setError(friendlyError(error)); return }
    setPosts((data ?? []) as Post[])
  }, [g.id, range.from, range.to, fStatus, fFormat, fOwner])
  useEffect(() => { void load() }, [load])

  const byDay = useMemo(() => { const m = new Map<string, Post[]>(); for (const p of posts ?? []) if (p.planned_date) m.set(p.planned_date, [...(m.get(p.planned_date) ?? []), p]); return m }, [posts])
  const nav = (n: number) => setCursor(c => (view === 'month' ? addMonths(c, n) : addDays(c, 7 * n)))
  const title = view === 'month' ? monthLabel(cursor) : `${dayLabel(weekStart(cursor))} a ${dayLabel(addDays(weekStart(cursor), 6))}`

  async function moveTo(id: string, date: string) {
    const p = posts?.find(x => x.id === id); if (!p || p.planned_date === date) return
    setPosts(ps => ps?.map(x => (x.id === id ? { ...x, planned_date: date } : x)) ?? null)
    const { error } = await db.from('posts').update({ planned_date: date }).eq('id', id)
    if (error) { toast.error(friendlyError(error)); void load() } else toast.success(`Movido para ${dateBR(date)}`)
  }

  const chip = (p: Post, tall = false) => (
    <button key={p.id} type="button" draggable={canEdit} onDragStart={e => { setDragId(p.id); e.dataTransfer.setData('text/plain', p.id) }} onDragEnd={() => setDragId(null)} onClick={() => setEdit(p)}
      className={`block w-full rounded px-1.5 py-1 text-left text-xs leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${STATUS_TONE[p.status]} ${dragId === p.id ? 'opacity-50' : ''}`}>
      <span className="block truncate font-medium">{p.title}</span>
      <span className="block truncate opacity-80">{STATUS_LABEL[p.status]} · {FORMAT_SPECS[p.format]?.label}{tall && p.assignee_id ? ` · ${people.find(x => x.user_id === p.assignee_id)?.display_name ?? ''}` : ''}</span>
    </button>)

  const dayCell = (d: string, month?: string) => {
    const items = byDay.get(d) ?? []
    return (
      <div key={d} onDragOver={e => canEdit && e.preventDefault()} onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) void moveTo(id, d) }}
        className={`min-h-[6.5rem] space-y-1 border-b border-r border-border p-1 ${month && d.slice(0, 7) !== month.slice(0, 7) ? 'bg-secondary/50' : 'bg-card'} ${view === 'week' ? 'min-h-[18rem]' : ''}`}>
        <div className="flex items-center justify-between"><span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs ${d === today ? 'bg-primary font-semibold' : 'text-muted-foreground'}`} aria-label={`Dia ${dateBR(d)}${d === today ? ' (hoje)' : ''}`}>{view === 'week' ? `${WEEKDAY_SHORT[new Date(d + 'T12:00:00Z').getUTCDay()]} ${dayLabel(d)}` : Number(d.slice(8))}</span>
          {canEdit && <button type="button" aria-label={`Novo conteúdo em ${dateBR(d)}`} onClick={() => setEdit({ new: true, date: d })} className="rounded p-0.5 text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Plus className="h-3.5 w-3.5" /></button>}</div>
        {items.map(p => chip(p, view === 'week'))}
      </div>)
  }

  return (
    <>
      <PageHeader title="Calendário editorial" description="Planeje, aprove e registre as publicações. Exportar uma arte não marca o conteúdo como publicado: a publicação é registrada por você."
        actions={<>{isLeader && <ApprovalSetting />}{canEdit && <Button onClick={() => setEdit({ new: true, date: cursor === today || view === 'week' ? today : monthStart(cursor) })}><Plus className="mr-2 h-4 w-4" /> Novo conteúdo</Button>}</>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="Navegação"><Button variant="outline" size="icon" aria-label="Anterior" onClick={() => nav(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" onClick={() => setCursor(today)}>Hoje</Button><Button variant="outline" size="icon" aria-label="Próximo" onClick={() => nav(1)}><ChevronRight className="h-4 w-4" /></Button></div>
        <h2 className="min-w-[10rem] text-lg font-semibold capitalize" aria-live="polite">{title}</h2>
        <SegmentedControl<'month' | 'week'> label="Visualização" value={view} onChange={setView} options={[['month', 'Mês'], ['week', 'Semana']]} />
        <div className="ml-auto flex flex-wrap gap-2">
          <Select value={fStatus} onValueChange={setFStatus}><SelectTrigger className="w-40" aria-label="Filtrar por situação"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todas as situações</SelectItem>{STATUS_FLOW.map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent></Select>
          <Select value={fFormat} onValueChange={setFFormat}><SelectTrigger className="w-40" aria-label="Filtrar por formato"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos os formatos</SelectItem>{FORMATS.map(f => <SelectItem key={f} value={f}>{FORMAT_SPECS[f].label}</SelectItem>)}</SelectContent></Select>
          <Select value={fOwner} onValueChange={setFOwner}><SelectTrigger className="w-44" aria-label="Filtrar por responsável"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos os responsáveis</SelectItem><SelectItem value={NONE}>Sem responsável</SelectItem>{people.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.display_name || 'Sem nome'}</SelectItem>)}</SelectContent></Select></div>
      </div>
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : posts === null ? <LoadingState /> : (
        <>
          <div className="overflow-x-auto"><div className="min-w-[44rem] overflow-hidden rounded-xl border-l border-t border-border">
            {view === 'month' && <div className="grid grid-cols-7 bg-secondary text-center text-xs font-medium text-muted-foreground" aria-hidden="true">{WEEKDAY_SHORT.map(w => <div key={w} className="border-b border-r border-border py-1.5">{w}</div>)}</div>}
            {view === 'month' ? monthGrid(cursor).map((w, i) => <div key={i} className="grid grid-cols-7">{w.map(d => dayCell(d, cursor))}</div>) : <div className="grid grid-cols-7">{weekDays(cursor).map(d => dayCell(d))}</div>}
          </div></div>
          {posts.length === 0 && <p role="status" className="mt-4 rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Nenhum conteúdo planejado neste período{fStatus !== ALL || fFormat !== ALL || fOwner !== ALL ? ' com estes filtros' : ''}. {canEdit && 'Use o botão + em um dia ou “Novo conteúdo”.'}</p>}
          <ul className="mt-4 flex flex-wrap gap-2 text-xs" aria-label="Legenda de situações">{STATUS_FLOW.map(s => <li key={s} className={`rounded px-2 py-0.5 ${STATUS_TONE[s]}`}>{STATUS_LABEL[s]}</li>)}</ul>
        </>)}
      <PostDialog target={edit} people={people} canEdit={canEdit} isLeader={isLeader} meId={user?.id ?? ''} requireApproval={!!g.require_approval} tz={g.timezone} groupId={g.id}
        onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void load() }} />
    </>
  )

  function ApprovalSetting() {
    const [busy, setBusy] = useState(false)
    return (
      <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"><Settings2 className="h-4 w-4 text-muted-foreground" aria-hidden /> Exigir aprovação
        <Switch checked={!!g.require_approval} disabled={busy} aria-label="Exigir aprovação para aprovar, agendar e publicar"
          onCheckedChange={async c => { setBusy(true); const { error } = await db.from('groups').update({ require_approval: c }).eq('id', g.id); setBusy(false); if (error) toast.error(friendlyError(error)); else { toast.success(c ? 'Fluxo de aprovação ativado' : 'Fluxo de aprovação desativado'); await reload() } }} /></label>)
  }
}

function PostDialog({ target, people, canEdit, isLeader, meId, requireApproval, tz, groupId, onClose, onSaved }: {
  target: Post | { new: true; date: string } | null; people: Person[]; canEdit: boolean; isLeader: boolean; meId: string; requireApproval: boolean; tz: string; groupId: string; onClose: () => void; onSaved: () => void
}) {
  const editing = target && !('new' in target) ? target : null
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<In<typeof schema>, unknown, Out<typeof schema>>({ resolver: zodResolver(schema) })
  const [format, setFormat] = useState<PostFormat>('feed_vertical'), [status, setStatus] = useState<PostStatus>('idea'), [assignee, setAssignee] = useState(''), [approver, setApprover] = useState('')
  const [del, setDel] = useState(false), [pub, setPub] = useState(false)
  useEffect(() => {
    if (!target) return
    if (editing) { reset({ title: editing.title, objective: editing.objective ?? '', caption: editing.caption ?? '', planned_date: editing.planned_date ?? '', notes: editing.notes ?? '' }); setFormat(editing.format); setStatus(editing.status); setAssignee(editing.assignee_id ?? ''); setApprover(editing.approver_id ?? '') }
    else { reset({ title: '', objective: '', caption: '', planned_date: (target as { date: string }).date, notes: '' }); setFormat('feed_vertical'); setStatus('idea'); setAssignee(''); setApprover('') }
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps
  const isApprover = approver === meId
  const ro = !canEdit || editing?.status === 'published'
  const statusOptions = STATUS_FLOW.filter(s => s !== 'published' || editing?.status === 'published')

  async function save(v: Out<typeof schema>) {
    const row = { title: v.title, format, objective: v.objective || null, caption: v.caption || null, planned_date: v.planned_date || null, status, assignee_id: assignee || null, approver_id: approver || null, notes: v.notes || null }
    const { error } = editing ? await db.from('posts').update(row).eq('id', editing.id) : await db.from('posts').insert({ ...row, group_id: groupId })
    if (error) { toast.error(friendlyError(error)); return }
    toast.success(editing ? 'Conteúdo atualizado' : 'Conteúdo criado'); onSaved()
  }
  async function duplicate() {
    if (!editing) return
    const { error } = await db.from('posts').insert({ group_id: groupId, title: `${editing.title} (cópia)`.slice(0, 160), format: editing.format, objective: editing.objective, caption: editing.caption, design: editing.design, planned_date: editing.planned_date, status: 'draft', notes: editing.notes })
    if (error) toast.error(friendlyError(error)); else { toast.success('Conteúdo duplicado como rascunho'); onSaved() }
  }
  async function remove() {
    if (!editing) return
    const { error } = await db.from('posts').delete().eq('id', editing.id); setDel(false)
    if (error) toast.error(friendlyError(error)); else { toast.success('Conteúdo excluído'); onSaved() }
  }
  async function undoPublication() {
    if (!editing) return
    const { error } = await db.from('posts').update({ status: 'approved', published_at: null, published_url: null }).eq('id', editing.id)
    if (error) toast.error(friendlyError(error)); else { toast.success('Registro de publicação desfeito'); onSaved() }
  }

  return (
    <Dialog open={!!target} onOpenChange={o => !o && onClose()}>
      <DialogContent className="gc-theme max-h-[92vh] overflow-y-auto bg-card text-foreground sm:max-w-xl">
        <DialogHeader><DialogTitle>{editing ? 'Conteúdo' : 'Novo conteúdo'}</DialogTitle><DialogDescription>{editing?.status === 'published' ? 'Publicação registrada. Para alterar, desfaça o registro.' : 'Planeje a publicação e acompanhe a aprovação.'}</DialogDescription></DialogHeader>
        <form noValidate className="space-y-3" onSubmit={handleSubmit(save)}>
          <fieldset disabled={ro} className="space-y-3">
            <Field label="Título" error={errors.title?.message} {...register('title')} />
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldShell label="Formato"><Select value={format} onValueChange={v => setFormat(v as PostFormat)}><SelectTrigger aria-label="Formato"><SelectValue /></SelectTrigger><SelectContent>{FORMATS.map(f => <SelectItem key={f} value={f}>{FORMAT_SPECS[f].label}</SelectItem>)}</SelectContent></Select></FieldShell>
              <Field label="Data planejada" type="date" error={errors.planned_date?.message} {...register('planned_date')} />
            </div>
            <Field label="Objetivo" error={errors.objective?.message} {...register('objective')} />
            <FieldShell label="Legenda" htmlFor="po-cap" error={errors.caption?.message}><Textarea id="po-cap" rows={4} {...register('caption')} /></FieldShell>
            <div className="grid gap-3 sm:grid-cols-3">
              <FieldShell label="Situação"><Select value={status} onValueChange={v => setStatus(v as PostStatus)}><SelectTrigger aria-label="Situação"><SelectValue /></SelectTrigger>
                <SelectContent>{statusOptions.map(s => <SelectItem key={s} value={s} disabled={s !== editing?.status && !canSetStatus(s, { requireApproval, isLeader, isApprover })}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent></Select></FieldShell>
              <FieldShell label="Responsável"><Select value={assignee || NONE} onValueChange={v => setAssignee(v === NONE ? '' : v)}><SelectTrigger aria-label="Responsável"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>Sem responsável</SelectItem>{people.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.display_name || 'Sem nome'}</SelectItem>)}</SelectContent></Select></FieldShell>
              <FieldShell label="Aprovador"><Select value={approver || NONE} onValueChange={v => setApprover(v === NONE ? '' : v)}><SelectTrigger aria-label="Aprovador"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>Sem aprovador</SelectItem>{people.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.display_name || 'Sem nome'}</SelectItem>)}</SelectContent></Select></FieldShell>
            </div>
            {requireApproval && <p className="text-xs text-muted-foreground">Este GC exige aprovação: somente líderes ou o aprovador designado podem marcar como aprovado ou agendado.</p>}
            <FieldShell label="Observações" htmlFor="po-notes" error={errors.notes?.message}><Textarea id="po-notes" rows={2} {...register('notes')} /></FieldShell>
          </fieldset>
          {editing?.design != null && <Button asChild variant="outline" size="sm"><Link to={`/app/estudio/${editing.id}`}><ExternalLink className="mr-1 h-4 w-4" /> Abrir arte no estúdio</Link></Button>}
          {editing?.status === 'published' && editing.published_at && <p role="status" className="rounded-lg bg-secondary p-3 text-sm">Publicado em {formatDateTime(editing.published_at, tz)}{editing.published_url ? <> · <a className="underline" href={editing.published_url} target="_blank" rel="noopener noreferrer">ver publicação</a></> : ''}.</p>}
          <DialogFooter className="flex-wrap gap-2 sm:gap-2">
            {editing && canEdit && <>
              <Button type="button" variant="ghost" size="icon" aria-label="Excluir conteúdo" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" /></Button>
              <Button type="button" variant="outline" onClick={() => void duplicate()}><Copy className="mr-1 h-4 w-4" /> Duplicar</Button>
              {editing.status !== 'published' && editing.status !== 'cancelled' && <Button type="button" variant="outline" onClick={() => setPub(true)}><CalendarCheck className="mr-1 h-4 w-4" /> Registrar publicação</Button>}
              {editing.status === 'published' && isLeader && <Button type="button" variant="outline" onClick={() => void undoPublication()}>Desfazer registro</Button>}</>}
            {!ro && <SubmitButton loading={isSubmitting}>{editing ? 'Salvar' : 'Criar'}</SubmitButton>}
          </DialogFooter>
        </form>
        <PublishDialog open={pub} post={editing} tz={tz} onClose={() => setPub(false)} onDone={() => { setPub(false); onSaved() }} />
        <AlertDialog open={del} onOpenChange={setDel}><AlertDialogContent className="gc-theme bg-card text-foreground">
          <AlertDialogHeader><AlertDialogTitle>Excluir conteúdo?</AlertDialogTitle><AlertDialogDescription>“{editing?.title}” e suas versões serão removidos.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => void remove()}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      </DialogContent>
    </Dialog>
  )
}

function PublishDialog({ open, post, tz, onClose, onDone }: { open: boolean; post: Post | null; tz: string; onClose: () => void; onDone: () => void }) {
  const [when, setWhen] = useState(''), [url, setUrl] = useState(''), [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setWhen(toLocalInput(new Date(), tz)); setUrl(''); setErr(null) } }, [open, tz])
  async function confirm() {
    if (!post) return
    if (!when) { setErr('Informe quando foi publicado.'); return }
    if (url && !/^https:\/\//i.test(url)) { setErr('O link deve começar com https://'); return }
    setBusy(true)
    const { error } = await db.from('posts').update({ status: 'published', published_at: zonedToUtc(when, tz).toISOString(), published_url: url || null }).eq('id', post.id)
    setBusy(false)
    if (error) { toast.error(friendlyError(error)); return }
    toast.success('Publicação registrada'); onDone()
  }
  return (
    <AlertDialog open={open} onOpenChange={o => !o && onClose()}>
      <AlertDialogContent className="gc-theme bg-card text-foreground">
        <AlertDialogHeader><AlertDialogTitle>Registrar publicação</AlertDialogTitle><AlertDialogDescription>Registre que o conteúdo foi publicado de fato (a publicação automática no Instagram ainda não está disponível). Este registro alimenta as métricas.</AlertDialogDescription></AlertDialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label htmlFor="pb-when">Data e hora da publicação</Label><Input id="pb-when" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="pb-url">Link da publicação (opcional)</Label><Input id="pb-url" placeholder="https://" value={url} onChange={e => setUrl(e.target.value)} /></div>
          {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        </div>
        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><Button disabled={busy} onClick={() => void confirm()}>{busy ? 'Registrando…' : 'Confirmar publicação'}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
