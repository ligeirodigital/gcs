import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Calendar, Copy, ImagePlus, MapPin, Pencil, Plus, Search, Share2, Trash2, PenSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { db, friendlyError } from '../lib/db'
import { useTenant } from '../lib/tenant'
import { can } from '../lib/roles'
import { formatEventWhen, toLocalInput, zonedToUtc } from '../lib/format'
import type { In, Out } from '../lib/schemas'
import type { MediaRow } from '../lib/media'
import { signedUrls } from '../studio/assets'
import { MediaPicker } from '../components/MediaPicker'
import { NewProjectDialog } from '../components/NewProjectDialog'
import { EmptyState, ErrorState, Field, FieldShell, LoadingState, PageHeader, SegmentedControl, SubmitButton } from '../components/ui-kit'

type Status = 'draft' | 'published' | 'cancelled' | 'done'
const STATUS_LABEL: Record<Status, string> = { draft: 'Rascunho', published: 'Publicado', cancelled: 'Cancelado', done: 'Realizado' }
interface EventRow { id: string; name: string; description: string | null; starts_at: string; ends_at: string | null; address: string | null; responsible_id: string | null; image_media_id: string | null; registration_url: string | null; status: Status; show_address_publicly: boolean }
const PAGE = 10

const schema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do encontro').max(160),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  starts: z.string().min(1, 'Informe data e horário'),
  ends: z.string().optional().or(z.literal('')),
  address: z.string().trim().max(300).optional().or(z.literal('')),
  registration_url: z.string().trim().url('Use um endereço https://…').refine(u => /^https:\/\//i.test(u), 'Use https://').optional().or(z.literal('')),
  status: z.enum(['draft', 'published', 'cancelled', 'done']),
}).refine(v => !v.ends || !v.starts || v.ends >= v.starts, { path: ['ends'], message: 'O término deve ser depois do início' })

export default function Events() {
  const { active } = useTenant()
  const g = active!.group
  const canEdit = can.manageGroup(active!.role) || active!.role === 'communicator'
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [rows, setRows] = useState<EventRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [edit, setEdit] = useState<EventRow | 'new' | null>(null)
  const [del, setDel] = useState<EventRow | null>(null)
  const [share, setShare] = useState<EventRow | null>(null)
  const [art, setArt] = useState<EventRow | null>(null)
  const [people, setPeople] = useState<{ user_id: string; display_name: string }[]>([])
  const [thumbs, setThumbs] = useState<Record<string, string>>({})

  useEffect(() => { void db.rpc('group_member_names', { p_group: g.id }).then(({ data }) => setPeople((data ?? []) as typeof people)) }, [g.id])

  const load = useCallback(async () => {
    setError(null)
    const now = new Date().toISOString()
    let query = db.from('events').select('*', { count: 'exact' }).eq('group_id', g.id)
      .order('starts_at', { ascending: tab === 'upcoming' }).range(page * PAGE, page * PAGE + PAGE - 1)
    query = tab === 'upcoming' ? query.gte('starts_at', now) : query.lt('starts_at', now)
    if (q.trim()) query = query.ilike('name', `%${q.trim().replace(/[%_,()]/g, '')}%`)
    const { data, error, count } = await query
    if (error) { setError(friendlyError(error)); return }
    const list = (data ?? []) as EventRow[]
    setRows(list); setTotal(count ?? 0)
    const ids = list.map(e => e.image_media_id).filter(Boolean) as string[]
    if (ids.length) {
      const m = await db.from('media_assets').select('id, storage_path').in('id', ids)
      const paths = ((m.data ?? []) as { id: string; storage_path: string }[])
      try { const u = await signedUrls(paths.map(p => p.storage_path)); setThumbs(Object.fromEntries(paths.map(p => [p.id, u[p.storage_path]]))) } catch { /* miniaturas opcionais */ }
    }
  }, [g.id, tab, page, q])
  useEffect(() => { const h = setTimeout(() => void load(), 250); return () => clearTimeout(h) }, [load])
  useEffect(() => { setPage(0) }, [tab, q, g.id])

  async function duplicate(e: EventRow) {
    const { id: _id, ...rest } = e
    const { error } = await db.from('events').insert({ ...rest, group_id: g.id, name: `${e.name} (cópia)`.slice(0, 160), status: 'draft' })
    if (error) toast.error(friendlyError(error)); else { toast.success('Evento duplicado como rascunho'); void load() }
  }
  async function remove(e: EventRow) {
    const { error } = await db.from('events').delete().eq('id', e.id)
    setDel(null)
    if (error) toast.error(friendlyError(error)); else { toast.success('Evento excluído'); void load() }
  }
  const publicUrl = `${window.location.origin}/gc/${g.slug}`
  const shareText = (e: EventRow) => `${e.name}\n${formatEventWhen(e.starts_at, g.timezone)}${e.address ? `\n${e.address}` : ''}\n${publicUrl}`

  return (
    <>
      <PageHeader title="Encontros e eventos" description="Divulgue os próximos encontros. Só eventos publicados aparecem na página pública, e o endereço só aparece se você liberar."
        actions={canEdit ? <Button onClick={() => setEdit('new')}><Plus className="mr-2 h-4 w-4" /> Novo evento</Button> : undefined} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SegmentedControl<'upcoming' | 'past'> label="Período dos eventos" value={tab} onChange={setTab} options={[['upcoming', 'Próximos'], ['past', 'Anteriores']]} />
        <div className="relative min-w-[12rem] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden /><Input className="pl-9" placeholder="Buscar evento" aria-label="Buscar evento" value={q} onChange={e => setQ(e.target.value)} /></div>
      </div>
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : rows === null ? <LoadingState /> : rows.length === 0 ? (
        <EmptyState icon={Calendar} title={q ? 'Nenhum evento encontrado' : tab === 'upcoming' ? 'Nenhum evento programado' : 'Nenhum evento anterior'}
          description={q ? 'Ajuste a busca.' : 'Cadastre o próximo encontro para divulgá-lo na página pública e nas redes.'}
          action={canEdit && !q && tab === 'upcoming' ? <Button onClick={() => setEdit('new')}>Cadastrar evento</Button> : undefined} />
      ) : (
        <>
          <ul className="grid gap-4 md:grid-cols-2">
            {rows.map(e => (
              <li key={e.id} className="flex gap-3 overflow-hidden rounded-xl border border-border bg-card p-3">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary">
                  {e.image_media_id && thumbs[e.image_media_id] ? <img src={thumbs[e.image_media_id]} alt="" className="h-full w-full object-cover" /> : <Calendar className="h-6 w-6 text-muted-foreground" aria-hidden />}</div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-1"><h2 className="truncate font-medium">{e.name}</h2><Badge variant={e.status === 'published' ? 'default' : 'secondary'}>{STATUS_LABEL[e.status]}</Badge></div>
                  <p className="text-sm text-muted-foreground">{formatEventWhen(e.starts_at, g.timezone)}</p>
                  {e.address && <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" aria-hidden /> {e.address}{e.status === 'published' && !e.show_address_publicly ? ' (oculto no público)' : ''}</p>}
                  <div className="mt-auto flex flex-wrap gap-1 pt-1">
                    <Button size="sm" variant="outline" onClick={() => setShare(e)}><Share2 className="mr-1 h-3.5 w-3.5" /> Divulgar</Button>
                    {canEdit && <><Button size="icon" variant="ghost" aria-label={`Editar ${e.name}`} onClick={() => setEdit(e)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label={`Duplicar ${e.name}`} onClick={() => void duplicate(e)}><Copy className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label={`Excluir ${e.name}`} onClick={() => setDel(e)}><Trash2 className="h-4 w-4" /></Button></>}
                  </div></div>
              </li>))}
          </ul>
          <div className="mt-4 flex items-center justify-between text-sm"><span className="text-muted-foreground">{total} evento(s)</span>
            <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button><Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(p => p + 1)}>Próxima</Button></div></div>
        </>)}

      <EventDialog target={edit} groupId={g.id} tz={g.timezone} defaultAddress={g.address} people={people} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void load() }} />

      <Dialog open={!!share} onOpenChange={o => !o && setShare(null)}>
        <DialogContent className="gc-theme bg-card text-foreground">
          {share && <>
            <DialogHeader><DialogTitle>Divulgar “{share.name}”</DialogTitle><DialogDescription>{share.status !== 'published' ? 'Atenção: este evento ainda não está publicado, então não aparece na página pública.' : 'Compartilhe o evento ou gere uma arte de convite.'}</DialogDescription></DialogHeader>
            <Textarea readOnly rows={5} value={shareText(share)} aria-label="Texto para compartilhar" onFocus={e => e.currentTarget.select()} />
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => navigator.clipboard.writeText(shareText(share)).then(() => toast.success('Texto copiado'), () => toast.error('Não foi possível copiar'))}><Copy className="mr-1 h-4 w-4" /> Copiar texto</Button>
              {'share' in navigator && <Button variant="outline" onClick={() => void navigator.share({ title: share.name, text: shareText(share) }).catch(() => undefined)}><Share2 className="mr-1 h-4 w-4" /> Compartilhar…</Button>}
              {canEdit && <Button onClick={() => { setArt(share); setShare(null) }}><PenSquare className="mr-1 h-4 w-4" /> Gerar arte de convite</Button>}
            </DialogFooter></>}
        </DialogContent>
      </Dialog>
      <NewProjectDialog open={!!art} onOpenChange={o => !o && setArt(null)} initial="b:event" photoMediaId={art?.image_media_id ?? undefined}
        event={art ? { name: art.name, when: formatEventWhen(art.starts_at, g.timezone), where: art.address } : undefined} />
      <AlertDialog open={!!del} onOpenChange={o => !o && setDel(null)}>
        <AlertDialogContent className="gc-theme bg-card text-foreground">
          <AlertDialogHeader><AlertDialogTitle>Excluir evento?</AlertDialogTitle><AlertDialogDescription>“{del?.name}” será removido, inclusive da página pública. Para apenas escondê-lo, mude o status para rascunho ou cancelado.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => del && void remove(del)}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function EventDialog({ target, groupId, tz, defaultAddress, people, onClose, onSaved }: {
  target: EventRow | 'new' | null; groupId: string; tz: string; defaultAddress: string | null; people: { user_id: string; display_name: string }[]
  onClose: () => void; onSaved: () => void
}) {
  const editing = target && target !== 'new' ? target : null
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<In<typeof schema>, unknown, Out<typeof schema>>({ resolver: zodResolver(schema) })
  const [responsible, setResponsible] = useState('')
  const [imageId, setImageId] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [showAddr, setShowAddr] = useState(false)
  const [picker, setPicker] = useState(false)
  useEffect(() => {
    if (!target) return
    if (editing) {
      reset({ name: editing.name, description: editing.description ?? '', starts: toLocalInput(editing.starts_at, tz), ends: editing.ends_at ? toLocalInput(editing.ends_at, tz) : '', address: editing.address ?? '', registration_url: editing.registration_url ?? '', status: editing.status })
      setResponsible(editing.responsible_id ?? ''); setImageId(editing.image_media_id); setShowAddr(editing.show_address_publicly)
    } else {
      reset({ name: '', description: '', starts: '', ends: '', address: defaultAddress ?? '', registration_url: '', status: 'draft' })
      setResponsible(''); setImageId(null); setShowAddr(false)
    }
    setImageUrl(null)
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!imageId) { setImageUrl(null); return }
    void db.from('media_assets').select('storage_path').eq('id', imageId).maybeSingle().then(async ({ data }) => {
      if (data) { try { const u = await signedUrls([(data as { storage_path: string }).storage_path]); setImageUrl(Object.values(u)[0] ?? null) } catch { setImageUrl(null) } }
    })
  }, [imageId])
  const status = watch('status')

  return (
    <Dialog open={!!target} onOpenChange={o => !o && onClose()}>
      <DialogContent className="gc-theme max-h-[92vh] overflow-y-auto bg-card text-foreground sm:max-w-xl">
        <DialogHeader><DialogTitle>{editing ? 'Editar evento' : 'Novo evento'}</DialogTitle><DialogDescription>Horários no fuso {tz}.</DialogDescription></DialogHeader>
        <form noValidate className="space-y-4" onSubmit={handleSubmit(async v => {
          const row = {
            name: v.name, description: v.description || null, starts_at: zonedToUtc(v.starts, tz).toISOString(), ends_at: v.ends ? zonedToUtc(v.ends, tz).toISOString() : null,
            address: v.address || null, responsible_id: responsible || null, image_media_id: imageId, registration_url: v.registration_url || null, status: v.status, show_address_publicly: showAddr,
          }
          const { error } = editing ? await db.from('events').update(row).eq('id', editing.id) : await db.from('events').insert({ ...row, group_id: groupId })
          if (error) { toast.error(friendlyError(error)); return }
          toast.success(editing ? 'Evento atualizado' : 'Evento criado'); onSaved()
        })}>
          <Field label="Nome do encontro" error={errors.name?.message} {...register('name')} />
          <FieldShell label="Descrição (opcional)" htmlFor="ev-desc" error={errors.description?.message}><Textarea id="ev-desc" rows={3} {...register('description')} /></FieldShell>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Início" type="datetime-local" error={errors.starts?.message} {...register('starts')} />
            <Field label="Término (opcional)" type="datetime-local" error={errors.ends?.message} {...register('ends')} />
          </div>
          <Field label="Endereço" error={errors.address?.message} {...register('address')} />
          <label className="flex items-center justify-between gap-3 text-sm">Mostrar o endereço na página pública
            <Switch checked={showAddr} onCheckedChange={setShowAddr} aria-label="Mostrar endereço na página pública" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldShell label="Responsável"><Select value={responsible || '__none__'} onValueChange={v => setResponsible(v === '__none__' ? '' : v)}>
              <SelectTrigger aria-label="Responsável"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="__none__">Sem responsável</SelectItem>{people.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.display_name || 'Sem nome'}</SelectItem>)}</SelectContent></Select></FieldShell>
            <FieldShell label="Situação"><Select value={status} onValueChange={v => setValue('status', v as Status)}>
              <SelectTrigger aria-label="Situação"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(STATUS_LABEL) as Status[]).map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent></Select></FieldShell>
          </div>
          <Field label="Link de inscrição (opcional)" placeholder="https://" error={errors.registration_url?.message} {...register('registration_url')} />
          <div className="space-y-1.5"><p className="text-sm font-medium">Imagem de divulgação</p>
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-secondary">{imageUrl ? <img src={imageUrl} alt="Imagem do evento" className="h-full w-full object-cover" /> : <ImagePlus className="h-5 w-5 text-muted-foreground" aria-hidden />}</div>
              <Button type="button" variant="outline" size="sm" onClick={() => setPicker(true)}>{imageId ? 'Trocar' : 'Escolher da galeria'}</Button>
              {imageId && <Button type="button" variant="ghost" size="sm" onClick={() => setImageId(null)}>Remover</Button>}</div>
            <p className="text-xs text-muted-foreground">Imagens da galeria são privadas e não são exibidas na página pública; servem para as artes e a organização interna.</p></div>
          <DialogFooter><SubmitButton loading={isSubmitting}>{editing ? 'Salvar evento' : 'Criar evento'}</SubmitButton></DialogFooter>
        </form>
        <MediaPicker open={picker} onOpenChange={setPicker} groupId={groupId} canUpload onPick={(m: MediaRow) => setImageId(m.id)} />
      </DialogContent>
    </Dialog>
  )
}
