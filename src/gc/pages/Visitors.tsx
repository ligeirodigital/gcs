import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Handshake, LayoutGrid, Lock, Plus, Search, Table as TableIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { db, friendlyError } from '../lib/db'
import { useTenant } from '../lib/tenant'
import { can } from '../lib/roles'
import { formatDate, formatDateTime } from '../lib/format'
import { SOURCES, SOURCE_LABEL, STATUS_LABEL, STATUS_ORDER, groupByStatus, isDueSoon, type VisitorSource, type VisitorStatus } from '../lib/visitors'
import type { In, Out } from '../lib/schemas'
import { VisitorSheet, type Person, type Visitor } from '../components/VisitorSheet'
import { FollowUpTasks } from '../components/FollowUpTasks'
import { FormInbox } from '../components/FormInbox'
import { EmptyState, ErrorState, Field, FieldShell, LoadingState, PageHeader, SubmitButton } from '../components/ui-kit'

const ALL = '__all__', NONE = '__none__', PAGE = 20, KANBAN_LIMIT = 300
type View = 'table' | 'board'
type Sort = 'recent' | 'oldest' | 'name' | 'next'
interface Filters { q: string; owner: string; source: string; status: string; from: string; to: string; sort: Sort }

export default function Visitors() {
  const { active } = useTenant()
  if (!can.welcome(active!.role)) {
    return (<><PageHeader title="Visitantes e acolhimento" /><EmptyState icon={Lock} title="Acesso restrito à equipe de acolhimento"
      description="Os contatos de visitantes são dados pessoais e só podem ser vistos pela liderança e pela equipe de acolhimento do GC. Peça acesso a um líder, se necessário." /></>)
  }
  return <VisitorsInner />
}

function VisitorsInner() {
  const { active } = useTenant()
  const g = active!.group
  const [view, setView] = useState<View>(() => { try { return (localStorage.getItem('gc.visitors.view') as View) || 'table' } catch { return 'table' } })
  const [f, setF] = useState<Filters>({ q: '', owner: ALL, source: ALL, status: ALL, from: '', to: '', sort: 'recent' })
  const [rows, setRows] = useState<Visitor[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [dlg, setDlg] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const bump = () => setReloadKey(k => k + 1)

  useEffect(() => { void db.rpc('group_member_names', { p_group: g.id }).then(({ data }) => setPeople((data ?? []) as Person[])) }, [g.id])
  useEffect(() => { try { localStorage.setItem('gc.visitors.view', view) } catch { /* indisponível */ } }, [view])

  const load = useCallback(async () => {
    setError(null)
    let q = db.from('visitors').select('*', { count: 'exact' }).eq('group_id', g.id).is('anonymized_at', null)
    const term = f.q.trim().replace(/[%_,()]/g, '')
    if (term) q = q.or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`)
    if (f.owner === NONE) q = q.is('owner_id', null); else if (f.owner !== ALL) q = q.eq('owner_id', f.owner)
    if (f.source !== ALL) q = q.eq('source', f.source)
    if (f.status !== ALL && view === 'table') q = q.eq('status', f.status)
    if (f.from) q = q.gte('first_contact_at', f.from)
    if (f.to) q = q.lte('first_contact_at', f.to + 'T23:59:59')
    q = f.sort === 'name' ? q.order('name', { ascending: true }) : f.sort === 'oldest' ? q.order('first_contact_at', { ascending: true })
      : f.sort === 'next' ? q.order('next_action_at', { ascending: true, nullsFirst: false }) : q.order('first_contact_at', { ascending: false })
    q = view === 'table' ? q.range(page * PAGE, page * PAGE + PAGE - 1) : q.limit(KANBAN_LIMIT)
    const { data, error, count } = await q
    if (error) { setError(friendlyError(error)); return }
    setRows((data ?? []) as Visitor[]); setTotal(count ?? 0)
  }, [g.id, f, page, view])
  useEffect(() => { const h = setTimeout(() => void load(), 250); return () => clearTimeout(h) }, [load, reloadKey])
  useEffect(() => setPage(0), [f, view])

  async function moveTo(v: Visitor, status: VisitorStatus) {
    if (v.status === status) return
    setRows(rs => rs?.map(r => (r.id === v.id ? { ...r, status } : r)) ?? null)
    const { error } = await db.from('visitors').update({ status }).eq('id', v.id)
    if (error) { toast.error(friendlyError(error)); bump() } else toast.success(`Movido para “${STATUS_LABEL[status]}”`)
  }
  const ownerName = (id: string | null) => people.find(p => p.user_id === id)?.display_name || '—'
  const grouped = useMemo(() => groupByStatus(rows ?? []), [rows])
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF(s => ({ ...s, [k]: v }))
  const filtered = f.q || f.owner !== ALL || f.source !== ALL || f.status !== ALL || f.from || f.to

  return (
    <>
      <PageHeader title="Visitantes e acolhimento" description="Acompanhe pessoas que demonstraram interesse. Os dados são pessoais: use apenas o necessário e registre somente fatos objetivos."
        actions={<Button onClick={() => setDlg(true)}><Plus className="mr-2 h-4 w-4" /> Novo visitante</Button>} />
      <Tabs defaultValue="visitors">
        <TabsList><TabsTrigger value="visitors">Visitantes</TabsTrigger><TabsTrigger value="tasks">Tarefas</TabsTrigger><TabsTrigger value="forms">Formulários recebidos</TabsTrigger></TabsList>

        <TabsContent value="visitors" className="mt-4 space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <div className="relative lg:col-span-2"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden /><Input className="pl-9" placeholder="Buscar nome, telefone ou e-mail" aria-label="Buscar visitante" value={f.q} onChange={e => set('q', e.target.value)} /></div>
            <Select value={f.owner} onValueChange={v => set('owner', v)}><SelectTrigger aria-label="Filtrar por responsável"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>Todos os responsáveis</SelectItem><SelectItem value={NONE}>Sem responsável</SelectItem>{people.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.display_name || 'Sem nome'}</SelectItem>)}</SelectContent></Select>
            <Select value={f.source} onValueChange={v => set('source', v)}><SelectTrigger aria-label="Filtrar por origem"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>Todas as origens</SelectItem>{SOURCES.map(s => <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>)}</SelectContent></Select>
            {view === 'table' && <Select value={f.status} onValueChange={v => set('status', v)}><SelectTrigger aria-label="Filtrar por situação"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>Todas as situações</SelectItem>{STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent></Select>}
            <Select value={f.sort} onValueChange={v => set('sort', v as Sort)}><SelectTrigger aria-label="Ordenar"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="recent">Mais recentes</SelectItem><SelectItem value="oldest">Mais antigos</SelectItem><SelectItem value="name">Nome (A–Z)</SelectItem><SelectItem value="next">Próxima ação</SelectItem></SelectContent></Select>
            <div className="flex items-center gap-1 sm:col-span-2 lg:col-span-2"><Input type="date" aria-label="Contato a partir de" value={f.from} onChange={e => set('from', e.target.value)} /><span className="text-xs text-muted-foreground">até</span><Input type="date" aria-label="Contato até" value={f.to} onChange={e => set('to', e.target.value)} /></div>
            <div className="flex gap-1 lg:col-span-2 lg:justify-end" role="group" aria-label="Modo de exibição">
              <Button variant={view === 'table' ? 'default' : 'outline'} size="sm" aria-pressed={view === 'table'} onClick={() => setView('table')}><TableIcon className="mr-1 h-4 w-4" /> Tabela</Button>
              <Button variant={view === 'board' ? 'default' : 'outline'} size="sm" aria-pressed={view === 'board'} onClick={() => setView('board')}><LayoutGrid className="mr-1 h-4 w-4" /> Quadro</Button>
              {filtered && <Button variant="ghost" size="sm" onClick={() => setF({ q: '', owner: ALL, source: ALL, status: ALL, from: '', to: '', sort: f.sort })}>Limpar filtros</Button>}</div>
          </div>

          {error ? <ErrorState message={error} onRetry={() => void load()} /> : rows === null ? <LoadingState /> : rows.length === 0 ? (
            <EmptyState icon={Handshake} title={filtered ? 'Nenhum visitante encontrado' : 'Nenhum visitante ainda'}
              description={filtered ? 'Ajuste os filtros.' : 'Quando alguém preencher “Participar do GC” na página pública, ou quando você cadastrar um contato, ele aparecerá aqui.'}
              action={!filtered ? <div className="flex flex-wrap justify-center gap-2"><Button onClick={() => setDlg(true)}>Cadastrar visitante</Button><Button variant="outline" asChild><Link to="/app/link-na-bio">Configurar página pública</Link></Button></div> : undefined} />
          ) : view === 'table' ? (
            <>
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <Table>
                  <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Contato</TableHead><TableHead>Origem</TableHead><TableHead>Primeiro contato</TableHead><TableHead>Responsável</TableHead><TableHead>Situação</TableHead><TableHead>Próxima ação</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {rows.map(v => (
                      <TableRow key={v.id} className="cursor-pointer" onClick={() => setOpen(v.id)}>
                        <TableCell className="font-medium"><button type="button" className="text-left underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={e => { e.stopPropagation(); setOpen(v.id) }}>{v.name || 'Sem nome'}</button></TableCell>
                        <TableCell className="text-xs">{[v.phone, v.email].filter(Boolean).join(' · ') || '—'}</TableCell>
                        <TableCell>{SOURCE_LABEL[v.source]}</TableCell>
                        <TableCell>{formatDate(v.first_contact_at, g.timezone)}</TableCell>
                        <TableCell>{ownerName(v.owner_id)}</TableCell>
                        <TableCell><Badge variant={v.status === 'new' ? 'default' : 'secondary'}>{STATUS_LABEL[v.status]}</Badge></TableCell>
                        <TableCell className="text-xs">{v.next_action ? <>{v.next_action}{v.next_action_at && <span className={isDueSoon(v.next_action_at) ? 'font-semibold' : 'text-muted-foreground'}> · {formatDateTime(v.next_action_at, g.timezone)}</span>}</> : '—'}</TableCell>
                      </TableRow>))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{total} visitante(s)</span>
                <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button><Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(p => p + 1)}>Próxima</Button></div></div>
            </>
          ) : (
            <>
              {total > KANBAN_LIMIT && <p role="status" className="rounded-lg bg-accent p-3 text-sm">Mostrando os primeiros {KANBAN_LIMIT} de {total}. Use os filtros para refinar.</p>}
              <div className="flex gap-3 overflow-x-auto pb-3">
                {STATUS_ORDER.map(s => (
                  <section key={s} aria-label={STATUS_LABEL[s]} className="w-64 shrink-0 rounded-xl border border-border bg-secondary p-2"
                    onDragOver={e => e.preventDefault()} onDrop={e => { const id = e.dataTransfer.getData('text/plain'); const v = rows.find(r => r.id === id); if (v) void moveTo(v, s) }}>
                    <h2 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{STATUS_LABEL[s]}<Badge variant="outline">{grouped[s].length}</Badge></h2>
                    <ul className="space-y-2">
                      {grouped[s].map(v => (
                        <li key={v.id} draggable onDragStart={e => e.dataTransfer.setData('text/plain', v.id)} className="cursor-grab rounded-lg border border-border bg-card p-2 text-sm shadow-sm active:cursor-grabbing">
                          <button type="button" className="block w-full text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setOpen(v.id)}>{v.name || 'Sem nome'}</button>
                          <p className="text-xs text-muted-foreground">{SOURCE_LABEL[v.source]} · {formatDate(v.first_contact_at, g.timezone)}</p>
                          {v.next_action && <p className="mt-1 text-xs">{v.next_action}{v.next_action_at ? ` · ${formatDate(v.next_action_at, g.timezone)}` : ''}</p>}
                          <p className="mt-1 text-xs text-muted-foreground">{ownerName(v.owner_id)}</p>
                          <Select value={v.status} onValueChange={st => void moveTo(v, st as VisitorStatus)}><SelectTrigger className="mt-2 h-8 text-xs" aria-label={`Mover ${v.name ?? 'visitante'} para`}><SelectValue /></SelectTrigger>
                            <SelectContent>{STATUS_ORDER.map(x => <SelectItem key={x} value={x}>{STATUS_LABEL[x]}</SelectItem>)}</SelectContent></Select>
                        </li>))}
                      {grouped[s].length === 0 && <li className="px-1 py-3 text-center text-xs text-muted-foreground">Vazio</li>}
                    </ul>
                  </section>))}
              </div>
            </>)}
        </TabsContent>

        <TabsContent value="tasks" className="mt-4"><FollowUpTasks people={people} onOpenVisitor={setOpen} /></TabsContent>
        <TabsContent value="forms" className="mt-4"><FormInbox onOpenVisitor={setOpen} /></TabsContent>
      </Tabs>

      <VisitorSheet visitorId={open} people={people} onClose={() => setOpen(null)} onChanged={bump} />
      <NewVisitorDialog open={dlg} onOpenChange={setDlg} groupId={g.id} people={people} onCreated={id => { setDlg(false); bump(); setOpen(id) }} />
    </>
  )
}

const newSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome').max(120),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  email: z.string().trim().email('E-mail inválido').max(160).optional().or(z.literal('')),
}).refine(v => v.phone || v.email, { path: ['phone'], message: 'Informe telefone ou e-mail' })

function NewVisitorDialog({ open, onOpenChange, groupId, people, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; groupId: string; people: Person[]; onCreated: (id: string) => void }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<In<typeof newSchema>, unknown, Out<typeof newSchema>>({ resolver: zodResolver(newSchema), defaultValues: { name: '', phone: '', email: '' } })
  const [source, setSource] = useState<VisitorSource>('in_person'), [owner, setOwner] = useState(''), [consent, setConsent] = useState(false), [consentErr, setConsentErr] = useState(false)
  useEffect(() => { if (open) { reset({ name: '', phone: '', email: '' }); setSource('in_person'); setOwner(''); setConsent(false); setConsentErr(false) } }, [open, reset])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gc-theme max-h-[92vh] overflow-y-auto bg-card text-foreground">
        <DialogHeader><DialogTitle>Novo visitante</DialogTitle><DialogDescription>Cadastre somente quem autorizou o registro. Colete o mínimo necessário.</DialogDescription></DialogHeader>
        <form noValidate className="space-y-3" onSubmit={handleSubmit(async v => {
          if (!consent) { setConsentErr(true); return }
          const { data, error } = await db.from('visitors').insert({ group_id: groupId, name: v.name, phone: v.phone || null, email: v.email || null, source, owner_id: owner || null, consent_given: true, consent_text_version: 'manual-v1' }).select('id').single()
          if (error) { toast.error(friendlyError(error)); return }
          toast.success('Visitante cadastrado'); onCreated((data as { id: string }).id)
        })}>
          <Field label="Nome" autoFocus error={errors.name?.message} {...register('name')} />
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Telefone" type="tel" error={errors.phone?.message} {...register('phone')} /><Field label="E-mail" type="email" error={errors.email?.message} {...register('email')} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldShell label="Origem do contato"><Select value={source} onValueChange={s => setSource(s as VisitorSource)}><SelectTrigger aria-label="Origem"><SelectValue /></SelectTrigger><SelectContent>{SOURCES.map(s => <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>)}</SelectContent></Select></FieldShell>
            <FieldShell label="Responsável"><Select value={owner || NONE} onValueChange={o => setOwner(o === NONE ? '' : o)}><SelectTrigger aria-label="Responsável"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>Sem responsável</SelectItem>{people.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.display_name || 'Sem nome'}</SelectItem>)}</SelectContent></Select></FieldShell>
          </div>
          <label className="flex items-start gap-2 text-sm"><Checkbox className="mt-0.5" checked={consent} onCheckedChange={c => { setConsent(c === true); setConsentErr(false) }} aria-invalid={consentErr} />
            <span>Confirmo que esta pessoa autorizou o registro dos seus dados para acompanhamento, conforme a <a className="underline" href="/privacidade" target="_blank" rel="noopener noreferrer">política de privacidade</a>.</span></label>
          {consentErr && <p role="alert" className="text-xs text-destructive">Sem a autorização da pessoa, o cadastro não pode ser feito.</p>}
          <DialogFooter><SubmitButton loading={isSubmitting}>Cadastrar</SubmitButton></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
