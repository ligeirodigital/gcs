import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Copy, ExternalLink, Link2, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { can } from '../lib/roles'
import { EXTERNAL_TYPES, LINK_TYPES, LINK_TYPE_LABEL, FORM_TYPES, customUrlSchema, normalizeSocial, type LinkType, type PublicData } from '../lib/public'
import type { In, Out } from '../lib/schemas'
import { PublicPage } from '../components/PublicPage'
import { ErrorState, Field, FieldShell, LoadingState, PageHeader, SubmitButton } from '../components/ui-kit'

interface BioRow { id: string; group_id: string; is_published: boolean; headline: string | null; bio: string | null; socials: Record<string, string>; contact: { email?: string; phone?: string }; show_address: boolean; show_meeting: boolean; show_events: boolean }
interface LinkRow { id: string; type: LinkType; label: string; url: string | null; position: number; is_active: boolean }

const pageSchema = z.object({
  headline: z.string().trim().max(120).optional().or(z.literal('')),
  bio: z.string().trim().max(600, 'Máximo de 600 caracteres').optional().or(z.literal('')),
  instagram: z.string().trim().max(200).optional().or(z.literal('')),
  whatsapp: z.string().trim().max(40).optional().or(z.literal('')),
  youtube: z.string().trim().max(200).optional().or(z.literal('')),
  email: z.string().trim().email('E-mail inválido').max(160).optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
}).superRefine((v, ctx) => {
  for (const k of ['instagram', 'whatsapp', 'youtube'] as const) if (v[k] && !normalizeSocial(k, v[k]!)) ctx.addIssue({ code: 'custom', path: [k], message: k === 'whatsapp' ? 'Informe o número com DDD.' : k === 'instagram' ? 'Use @usuario ou o link do Instagram.' : 'Use o link do canal ou @canal.' })
})

export default function BioPage() {
  const { active } = useTenant()
  const g = active!.group
  const canEdit = can.manageGroup(active!.role) || active!.role === 'communicator'
  const [bio, setBio] = useState<BioRow | null>(null)
  const [links, setLinks] = useState<LinkRow[]>([])
  const [events, setEvents] = useState<PublicData['events']>([])
  const [error, setError] = useState<string | null>(null)
  const [dlg, setDlg] = useState<LinkRow | 'new' | null>(null)
  const [del, setDel] = useState<LinkRow | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const first = await db.from('bio_pages').select('*').eq('group_id', g.id).maybeSingle()
    if (first.error) { setError(friendlyError(first.error)); return }
    let data = first.data
    if (!data && canEdit) {
      const ins = await db.from('bio_pages').insert({ group_id: g.id, headline: 'Comunidade para viver a fé em grupo' }).select().single()
      if (ins.error) { setError(friendlyError(ins.error)); return }
      data = ins.data
    }
    if (!data) { setBio(null); setLinks([]); return }
    const [l, e] = await Promise.all([
      db.from('bio_links').select('id, type, label, url, position, is_active').eq('bio_page_id', data.id).order('position').order('created_at'),
      db.from('events').select('id, name, description, starts_at, ends_at, address, registration_url, show_address_publicly').eq('group_id', g.id).eq('status', 'published').gte('starts_at', new Date(Date.now() - 3 * 3600_000).toISOString()).order('starts_at').limit(6),
    ])
    if (l.error) { setError(friendlyError(l.error)); return }
    setBio(data as BioRow); setLinks((l.data ?? []) as LinkRow[])
    setEvents(((e.data ?? []) as (PublicData['events'][number] & { show_address_publicly: boolean })[]).map(x => ({ ...x, address: x.show_address_publicly ? x.address : null })))
  }, [g.id, canEdit])
  useEffect(() => { setBio(null); void load() }, [load])

  const publicUrl = `${window.location.origin}/gc/${g.slug}`

  const preview: PublicData | null = useMemo(() => bio && ({
    group: { name: g.name, slug: g.slug, description: g.description, logo_path: g.logo_path, cover_path: g.cover_path, primary_color: g.primary_color, secondary_color: g.secondary_color, timezone: g.timezone },
    page: { headline: bio.headline, bio: bio.bio, socials: bio.socials ?? {}, contact: bio.contact ?? {} },
    meeting: bio.show_meeting || bio.show_address ? { weekday: bio.show_meeting ? g.meeting_weekday : null, time: bio.show_meeting ? g.meeting_time : null, address: bio.show_address ? g.address : null } : null,
    links: links.filter(l => l.is_active).map(l => ({ id: l.id, type: l.type, label: l.label, url: EXTERNAL_TYPES.includes(l.type) ? l.url : null })),
    events: bio.show_events ? events : [],
  }), [bio, links, events, g])

  async function patchBio(p: Partial<BioRow>) {
    if (!bio) return
    const { data, error } = await db.from('bio_pages').update(p).eq('id', bio.id).select().single()
    if (error) { toast.error(friendlyError(error)); return false }
    setBio(data as BioRow); return true
  }
  async function move(i: number, dir: -1 | 1) {
    const a = links[i], b = links[i + dir]
    if (!a || !b) return
    const next = [...links]; [next[i], next[i + dir]] = [next[i + dir], next[i]]
    // normaliza posições sequenciais para evitar empates
    const updates = next.map((l, idx) => ({ id: l.id, position: idx })).filter((u, idx) => next[idx].position !== u.position || idx === i || idx === i + dir)
    setLinks(next.map((l, idx) => ({ ...l, position: idx })))
    const results = await Promise.all(updates.map(u => db.from('bio_links').update({ position: u.position }).eq('id', u.id)))
    if (results.some(r => r.error)) { toast.error('Não foi possível reordenar. Recarregando.'); void load() }
  }
  async function toggle(l: LinkRow, on: boolean) {
    setLinks(ls => ls.map(x => (x.id === l.id ? { ...x, is_active: on } : x)))
    const { error } = await db.from('bio_links').update({ is_active: on }).eq('id', l.id)
    if (error) { toast.error(friendlyError(error)); void load() }
  }
  async function remove(l: LinkRow) {
    const { error } = await db.from('bio_links').delete().eq('id', l.id)
    setDel(null)
    if (error) toast.error(friendlyError(error)); else { toast.success('Botão excluído'); void load() }
  }

  if (error) return <ErrorState message={error} onRetry={() => void load()} />
  if (!bio) return canEdit ? <LoadingState /> : <p className="text-sm text-muted-foreground">A página pública ainda não foi configurada.</p>

  return (
    <>
      <PageHeader title="Link na bio" description="Página pública do seu GC, para o Instagram e outros canais. Só aparece o que você liberar aqui."
        actions={<>
          <Button variant="outline" onClick={() => navigator.clipboard.writeText(publicUrl).then(() => toast.success('Endereço copiado'), () => toast.error('Não foi possível copiar'))}><Copy className="mr-2 h-4 w-4" /> Copiar endereço</Button>
          <Button variant="outline" asChild><a href={publicUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Abrir página</a></Button></>} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="font-medium">Publicação</h2>
                <p className="text-sm text-muted-foreground break-all">{publicUrl}</p></div>
              <label className="flex items-center gap-2 text-sm"><Switch disabled={!canEdit} checked={bio.is_published} aria-label="Página publicada"
                onCheckedChange={async c => { if (await patchBio({ is_published: c })) toast.success(c ? 'Página publicada' : 'Página ocultada') }} />
                <Badge variant={bio.is_published ? 'default' : 'secondary'}>{bio.is_published ? 'Publicada' : 'Oculta'}</Badge></label>
            </div>
            {!bio.is_published && <p className="mt-2 text-sm text-muted-foreground">Enquanto estiver oculta, o endereço público mostra “página não encontrada”.</p>}
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-medium">Botões</h2>
              {canEdit && <Button size="sm" onClick={() => setDlg('new')}><Plus className="mr-1 h-4 w-4" /> Adicionar botão</Button>}</div>
            {links.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Nenhum botão ainda. Adicione “Participar do GC”, “Pedir oração”, WhatsApp e outros.</p> : (
              <ol className="divide-y divide-border">
                {links.map((l, i) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 py-2">
                    <div className="min-w-0 flex-1"><p className={`truncate text-sm font-medium ${l.is_active ? '' : 'text-muted-foreground line-through'}`}>{l.label}</p>
                      <p className="truncate text-xs text-muted-foreground">{LINK_TYPE_LABEL[l.type]}{l.url ? ` · ${l.url}` : ''}</p></div>
                    {canEdit && <>
                      <Switch checked={l.is_active} onCheckedChange={c => void toggle(l, c)} aria-label={`${l.is_active ? 'Desativar' : 'Ativar'} ${l.label}`} />
                      <Button size="icon" variant="ghost" aria-label={`Subir ${l.label}`} disabled={i === 0} onClick={() => void move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label={`Descer ${l.label}`} disabled={i === links.length - 1} onClick={() => void move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label={`Editar ${l.label}`} onClick={() => setDlg(l)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label={`Excluir ${l.label}`} onClick={() => setDel(l)}><Trash2 className="h-4 w-4" /></Button></>}
                  </li>))}
              </ol>)}
            {links.some(l => l.type === 'directions' && l.is_active) && !bio.show_address && <p role="status" className="mt-3 rounded-lg bg-accent p-3 text-sm">“Como chegar” só aparece para o público se você liberar o endereço abaixo.</p>}
          </section>

          <PageSettings bio={bio} canEdit={canEdit} onSave={patchBio} />
        </div>

        <aside aria-label="Prévia da página" className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-sm font-medium">Prévia (celular)</p>
          <div className="mx-auto h-[640px] w-[330px] max-w-full overflow-y-auto rounded-[2rem] border-[10px] border-[#232323] bg-[#FAFAF8] shadow-lg">
            {preview && <PublicPage data={preview} preview />}
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">Na prévia, cliques e formulários não são registrados.</p>
        </aside>
      </div>

      <LinkDialog target={dlg} count={links.length} bioId={bio.id} groupId={g.id} onClose={() => setDlg(null)} onSaved={() => { setDlg(null); void load() }} />
      <AlertDialog open={!!del} onOpenChange={o => !o && setDel(null)}>
        <AlertDialogContent className="gc-theme bg-card text-foreground">
          <AlertDialogHeader><AlertDialogTitle>Excluir botão?</AlertDialogTitle><AlertDialogDescription>“{del?.label}” deixará de aparecer na página pública. Para apenas esconder, use o interruptor de ativação.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => del && void remove(del)}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function PageSettings({ bio, canEdit, onSave }: { bio: BioRow; canEdit: boolean; onSave: (p: Partial<BioRow>) => Promise<boolean | undefined> }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<In<typeof pageSchema>, unknown, Out<typeof pageSchema>>({ resolver: zodResolver(pageSchema) })
  useEffect(() => {
    reset({ headline: bio.headline ?? '', bio: bio.bio ?? '', instagram: bio.socials?.instagram ?? '', whatsapp: bio.socials?.whatsapp ?? '', youtube: bio.socials?.youtube ?? '', email: bio.contact?.email ?? '', phone: bio.contact?.phone ?? '' })
  }, [bio.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form noValidate className="space-y-4 rounded-xl border border-border bg-card p-5" onSubmit={handleSubmit(async v => {
      const socials: Record<string, string> = {}
      for (const k of ['instagram', 'whatsapp', 'youtube'] as const) { const n = v[k] ? normalizeSocial(k, v[k]!) : null; if (n) socials[k] = n }
      const contact: Record<string, string> = {}; if (v.email) contact.email = v.email; if (v.phone) contact.phone = v.phone
      if (await onSave({ headline: v.headline || null, bio: v.bio || null, socials, contact })) { toast.success('Página atualizada'); reset(v) }
    })}>
      <h2 className="font-medium">Conteúdo e contato</h2>
      <fieldset disabled={!canEdit} className="space-y-4">
        <Field label="Frase de apresentação" error={errors.headline?.message} {...register('headline')} />
        <FieldShell label="Sobre o GC" htmlFor="bio" error={errors.bio?.message}><Textarea id="bio" rows={3} {...register('bio')} /></FieldShell>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Instagram" placeholder="@usuario" error={errors.instagram?.message} {...register('instagram')} />
          <Field label="WhatsApp" placeholder="(85) 99999-0000" error={errors.whatsapp?.message} {...register('whatsapp')} />
          <Field label="YouTube" placeholder="@canal" error={errors.youtube?.message} {...register('youtube')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="E-mail de contato" type="email" error={errors.email?.message} {...register('email')} />
          <Field label="Telefone de contato" type="tel" error={errors.phone?.message} {...register('phone')} />
        </div>
      </fieldset>
      <div className="space-y-3 border-t border-border pt-4">
        <h3 className="text-sm font-medium">O que aparece para o público</h3>
        {([['show_meeting', 'Dia e horário do encontro'], ['show_address', 'Endereço do encontro (e botão “Como chegar”)'], ['show_events', 'Próximos eventos publicados']] as const).map(([k, label]) => (
          <label key={k} className="flex items-center justify-between gap-3 text-sm">{label}
            <Switch disabled={!canEdit} checked={bio[k]} onCheckedChange={c => void onSave({ [k]: c } as Partial<BioRow>)} aria-label={label} /></label>))}
        <p className="text-xs text-muted-foreground">Endereços e horários são cadastrados em Configurações. Nada é exibido sem a sua liberação.</p>
      </div>
      {canEdit && <SubmitButton loading={isSubmitting} disabled={!isDirty}>Salvar conteúdo</SubmitButton>}
    </form>
  )
}

function LinkDialog({ target, count, bioId, groupId, onClose, onSaved }: { target: LinkRow | 'new' | null; count: number; bioId: string; groupId: string; onClose: () => void; onSaved: () => void }) {
  const editing = target && target !== 'new' ? target : null
  const [type, setType] = useState<LinkType>('join_gc')
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [err, setErr] = useState<{ label?: string; url?: string }>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!target) return
    setErr({})
    if (target === 'new') { setType('join_gc'); setLabel(LINK_TYPE_LABEL.join_gc); setUrl('') }
    else { setType(target.type); setLabel(target.label); setUrl(target.url ?? '') }
  }, [target])
  const needsUrl = EXTERNAL_TYPES.includes(type)

  async function save() {
    const e: typeof err = {}
    if (!label.trim()) e.label = 'Informe o texto do botão.'
    let finalUrl: string | null = null
    if (needsUrl) {
      if (type === 'custom') { const r = customUrlSchema.safeParse(url); if (r.success) finalUrl = r.data; else e.url = r.error.issues[0].message }
      else { finalUrl = normalizeSocial(type as 'instagram' | 'whatsapp' | 'youtube', url); if (!finalUrl) e.url = type === 'whatsapp' ? 'Informe o número com DDD.' : type === 'instagram' ? 'Use @usuario ou o link do Instagram.' : 'Use o link do canal ou @canal.' }
    }
    setErr(e); if (e.label || e.url) return
    setBusy(true)
    const row = { type, label: label.trim(), url: finalUrl, ...(editing ? {} : { is_active: true }) }
    const { error } = editing ? await db.from('bio_links').update(row).eq('id', editing.id) : await db.from('bio_links').insert({ ...row, group_id: groupId, bio_page_id: bioId, position: count })
    setBusy(false)
    if (error) { toast.error(friendlyError(error)); return }
    toast.success(editing ? 'Botão atualizado' : 'Botão adicionado'); onSaved()
  }
  return (
    <Dialog open={!!target} onOpenChange={o => !o && onClose()}>
      <DialogContent className="gc-theme bg-card text-foreground">
        <DialogHeader><DialogTitle>{editing ? 'Editar botão' : 'Novo botão'}</DialogTitle><DialogDescription>{FORM_TYPES.includes(type) ? 'Este botão abre um formulário na própria página, com consentimento.' : needsUrl ? 'Este botão abre um endereço externo.' : 'Este botão mostra informações do GC.'}</DialogDescription></DialogHeader>
        <div className="space-y-1"><Label>Tipo</Label>
          <Select value={type} onValueChange={v => { const wasDefault = label === LINK_TYPE_LABEL[type] || !label; setType(v as LinkType); if (wasDefault) setLabel(LINK_TYPE_LABEL[v as LinkType]) }}>
            <SelectTrigger aria-label="Tipo de botão"><SelectValue /></SelectTrigger><SelectContent>{LINK_TYPES.map(t => <SelectItem key={t} value={t}>{LINK_TYPE_LABEL[t]}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label htmlFor="lk-label">Texto do botão</Label><Input id="lk-label" maxLength={80} value={label} onChange={e => setLabel(e.target.value)} aria-invalid={!!err.label} />{err.label && <p role="alert" className="text-xs text-destructive">{err.label}</p>}</div>
        {needsUrl && <div className="space-y-1"><Label htmlFor="lk-url">{type === 'whatsapp' ? 'Número do WhatsApp' : type === 'instagram' ? 'Perfil do Instagram' : type === 'youtube' ? 'Canal do YouTube' : 'Endereço (https://…)'}</Label>
          <Input id="lk-url" value={url} onChange={e => setUrl(e.target.value)} aria-invalid={!!err.url} placeholder={type === 'whatsapp' ? '(85) 99999-0000' : type === 'instagram' ? '@usuario' : 'https://'} />{err.url && <p role="alert" className="text-xs text-destructive">{err.url}</p>}</div>}
        <DialogFooter><Button disabled={busy} onClick={() => void save()}><Link2 className="mr-1 h-4 w-4" />{busy ? 'Salvando…' : 'Salvar botão'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
