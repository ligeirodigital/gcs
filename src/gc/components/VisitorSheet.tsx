import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Download, ShieldCheck, Trash2, UserX, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { db, friendlyError } from '../lib/db'
import { useTenant } from '../lib/tenant'
import { can } from '../lib/roles'
import { formatDate, formatDateTime, toLocalInput, zonedToUtc } from '../lib/format'
import { downloadText } from '../lib/csv'
import { CHANNEL_LABEL, KIND_LABEL, SOURCES, SOURCE_LABEL, STATUS_LABEL, STATUS_ORDER, buildVisitorExport, describeHistory, isOverdue, type VisitorSource, type VisitorStatus } from '../lib/visitors'
import type { In, Out } from '../lib/schemas'
import { ErrorState, Field, FieldShell, LoadingState, SubmitButton } from './ui-kit'

export interface Visitor {
  id: string; group_id: string; name: string | null; phone: string | null; email: string | null; source: VisitorSource; event_id: string | null
  first_contact_at: string; consent_given: boolean; consent_at: string | null; consent_text_version: string | null; owner_id: string | null
  status: VisitorStatus; next_action: string | null; next_action_at: string | null; retention_until: string; anonymized_at: string | null; created_at: string
}
export interface Person { user_id: string; display_name: string }
interface Interaction { id: string; kind: string; channel: string | null; content: string; created_by: string | null; created_at: string }
export interface Task { id: string; visitor_id: string; title: string; due_at: string | null; assignee_id: string | null; completed_at: string | null; result: string | null; next_step: string | null; created_at: string }

const NONE = '__none__'
const editSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome').max(120),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  email: z.string().trim().email('E-mail inválido').max(160).optional().or(z.literal('')),
  next_action: z.string().trim().max(200).optional().or(z.literal('')),
  next_action_at: z.string().optional().or(z.literal('')),
  retention_until: z.string().min(1),
})
const interactionSchema = z.object({ content: z.string().trim().min(1, 'Escreva o registro').max(500, 'Máximo de 500 caracteres') })
const taskSchema = z.object({ title: z.string().trim().min(1, 'Informe a tarefa').max(160), due: z.string().optional().or(z.literal('')) })

export function VisitorSheet({ visitorId, people, onClose, onChanged }: { visitorId: string | null; people: Person[]; onClose: () => void; onChanged: () => void }) {
  const { active } = useTenant()
  const tz = active!.group.timezone
  const [v, setV] = useState<Visitor | null>(null)
  const [hist, setHist] = useState<Interaction[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'anonymize' | 'delete' | null>(null)
  const personName = (id: string | null) => people.find(p => p.user_id === id)?.display_name || (id ? 'Ex-membro' : '—')

  const load = useCallback(async () => {
    if (!visitorId) return
    setError(null)
    const [a, b, c] = await Promise.all([
      db.from('visitors').select('*').eq('id', visitorId).maybeSingle(),
      db.from('visitor_interactions').select('id, kind, channel, content, created_by, created_at').eq('visitor_id', visitorId).order('created_at', { ascending: false }),
      db.from('follow_up_tasks').select('id, visitor_id, title, due_at, assignee_id, completed_at, result, next_step, created_at').eq('visitor_id', visitorId).order('created_at', { ascending: false }),
    ])
    const err = a.error ?? b.error ?? c.error
    if (err) { setError(friendlyError(err)); return }
    if (!a.data) { setError('Visitante não encontrado.'); return }
    setV(a.data as Visitor); setHist((b.data ?? []) as Interaction[]); setTasks((c.data ?? []) as Task[])
  }, [visitorId])
  useEffect(() => { setV(null); void load() }, [load])

  async function patchVisitor(p: Partial<Visitor>) {
    if (!v) return false
    const { data, error } = await db.from('visitors').update(p).eq('id', v.id).select().single()
    if (error) { toast.error(friendlyError(error)); return false }
    setV(data as Visitor); onChanged(); void load(); return true
  }
  async function exportData() {
    if (!v) return
    downloadText(`dados-visitante-${v.id.slice(0, 8)}.json`, JSON.stringify(buildVisitorExport(v as never, hist as never, tasks as never), null, 2), 'application/json')
    toast.success('Arquivo gerado')
  }
  async function doConfirm() {
    if (!v || !confirm) return
    const { error } = confirm === 'anonymize' ? await db.rpc('anonymize_visitor', { p_id: v.id }) : await db.from('visitors').delete().eq('id', v.id)
    setConfirm(null)
    if (error) { toast.error(friendlyError(error)); return }
    toast.success(confirm === 'anonymize' ? 'Dados pessoais anonimizados' : 'Registro excluído'); onChanged()
    if (confirm === 'delete') onClose(); else void load()
  }

  const anonymized = !!v?.anonymized_at
  return (
    <Sheet open={!!visitorId} onOpenChange={o => !o && onClose()}>
      <SheetContent className="gc-theme w-full overflow-y-auto bg-card text-foreground sm:max-w-xl">
        <SheetHeader><SheetTitle>{v ? (anonymized ? 'Registro anonimizado' : v.name || 'Sem nome') : 'Visitante'}</SheetTitle>
          <SheetDescription>Primeiro contato {v ? formatDate(v.first_contact_at, tz) : ''}. Mantenha somente informações objetivas, necessárias ao acompanhamento.</SheetDescription></SheetHeader>
        {error ? <div className="mt-4"><ErrorState message={error} onRetry={() => void load()} /></div> : !v ? <LoadingState /> : (
          <div className="mt-4 space-y-6">
            {anonymized && <p role="status" className="rounded-lg bg-secondary p-3 text-sm">Os dados pessoais deste registro foram anonimizados em {formatDate(v.anonymized_at!, tz)}. Restam apenas informações agregadas.</p>}
            {!anonymized && <EditForm v={v} people={people} tz={tz} onSave={patchVisitor} />}
            {!anonymized && <>
              <Timeline visitor={v} hist={hist} personName={personName} tz={tz} onAdded={() => void load()} />
              <TaskSection visitor={v} tasks={tasks} people={people} personName={personName} tz={tz} onChanged={() => { void load(); onChanged() }} />
            </>}
            <section className="space-y-2 rounded-xl border border-border p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4" aria-hidden /> Privacidade e dados (LGPD)</h3>
              <dl className="text-sm"><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Consentimento</dt><dd>{v.consent_at ? `${formatDate(v.consent_at, tz)}${v.consent_text_version ? ` · termo ${v.consent_text_version}` : ''}` : '—'}</dd></div>
                {!anonymized && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Guardar até</dt><dd>{formatDate(v.retention_until + 'T12:00:00', tz)}</dd></div>}</dl>
              <div className="flex flex-wrap gap-2 pt-1">
                {!anonymized && <Button size="sm" variant="outline" onClick={() => void exportData()}><Download className="mr-1 h-4 w-4" /> Exportar dados</Button>}
                {!anonymized && <Button size="sm" variant="outline" onClick={() => setConfirm('anonymize')}><UserX className="mr-1 h-4 w-4" /> Anonimizar</Button>}
                {can.deleteVisitors(active!.role) && <Button size="sm" variant="outline" onClick={() => setConfirm('delete')}><Trash2 className="mr-1 h-4 w-4" /> Excluir definitivamente</Button>}
              </div>
              <p className="text-xs text-muted-foreground">Para corrigir dados, edite o formulário acima. Para atender pedido de eliminação, anonimize (mantém só estatísticas) ou exclua o registro.</p>
            </section>
          </div>)}
        <AlertDialog open={!!confirm} onOpenChange={o => !o && setConfirm(null)}>
          <AlertDialogContent className="gc-theme bg-card text-foreground">
            <AlertDialogHeader><AlertDialogTitle>{confirm === 'delete' ? 'Excluir definitivamente?' : 'Anonimizar dados pessoais?'}</AlertDialogTitle>
              <AlertDialogDescription>{confirm === 'delete' ? 'O visitante, suas tarefas e seu histórico serão apagados. Esta ação não pode ser desfeita.' : 'Nome, telefone, e-mail, histórico de contato e anotações serão apagados. Mantemos apenas origem e situação para estatísticas. Não há como desfazer.'}</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => void doConfirm()}>Confirmar</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  )
}

function EditForm({ v, people, tz, onSave }: { v: Visitor; people: Person[]; tz: string; onSave: (p: Partial<Visitor>) => Promise<boolean> }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<In<typeof editSchema>, unknown, Out<typeof editSchema>>({ resolver: zodResolver(editSchema) })
  const [status, setStatus] = useState(v.status), [owner, setOwner] = useState(v.owner_id ?? ''), [source, setSource] = useState(v.source)
  useEffect(() => {
    reset({ name: v.name ?? '', phone: v.phone ?? '', email: v.email ?? '', next_action: v.next_action ?? '', next_action_at: v.next_action_at ? toLocalInput(v.next_action_at, tz) : '', retention_until: v.retention_until })
    setStatus(v.status); setOwner(v.owner_id ?? ''); setSource(v.source)
  }, [v, tz, reset])
  const dirty = isDirty || status !== v.status || owner !== (v.owner_id ?? '') || source !== v.source
  return (
    <form noValidate className="space-y-3" onSubmit={handleSubmit(async f => {
      if (await onSave({ name: f.name, phone: f.phone || null, email: f.email || null, status, source, owner_id: owner || null, next_action: f.next_action || null,
        next_action_at: f.next_action_at ? zonedToUtc(f.next_action_at, tz).toISOString() : null, retention_until: f.retention_until })) toast.success('Dados atualizados')
    })}>
      <h3 className="text-sm font-semibold">Dados e situação</h3>
      <Field label="Nome" error={errors.name?.message} {...register('name')} />
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Telefone" type="tel" error={errors.phone?.message} {...register('phone')} /><Field label="E-mail" type="email" error={errors.email?.message} {...register('email')} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldShell label="Situação atual"><Select value={status} onValueChange={s => setStatus(s as VisitorStatus)}><SelectTrigger aria-label="Situação atual"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent></Select></FieldShell>
        <FieldShell label="Responsável"><Select value={owner || NONE} onValueChange={o => setOwner(o === NONE ? '' : o)}><SelectTrigger aria-label="Responsável"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={NONE}>Sem responsável</SelectItem>{people.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.display_name || 'Sem nome'}</SelectItem>)}</SelectContent></Select></FieldShell>
      </div>
      <FieldShell label="Origem do contato"><Select value={source} onValueChange={s => setSource(s as VisitorSource)}><SelectTrigger aria-label="Origem"><SelectValue /></SelectTrigger>
        <SelectContent>{SOURCES.map(s => <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>)}</SelectContent></Select></FieldShell>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Próxima ação" error={errors.next_action?.message} {...register('next_action')} /><Field label="Data da próxima ação" type="datetime-local" {...register('next_action_at')} /></div>
      <Field label="Guardar dados até" type="date" hint="Prazo de retenção; após a data os dados pessoais são anonimizados." {...register('retention_until')} />
      <SubmitButton loading={isSubmitting} disabled={!dirty}>Salvar alterações</SubmitButton>
    </form>
  )
}

function Timeline({ visitor, hist, personName, tz, onAdded }: { visitor: Visitor; hist: Interaction[]; personName: (id: string | null) => string; tz: string; onAdded: () => void }) {
  const [kind, setKind] = useState('contact_attempt'), [channel, setChannel] = useState('whatsapp')
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<In<typeof interactionSchema>, unknown, Out<typeof interactionSchema>>({ resolver: zodResolver(interactionSchema), defaultValues: { content: '' } })
  const len = (watch('content') ?? '').length
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Histórico de acompanhamento</h3>
      <form noValidate className="space-y-2 rounded-xl border border-border p-3" onSubmit={handleSubmit(async f => {
        const { error } = await db.from('visitor_interactions').insert({ group_id: visitor.group_id, visitor_id: visitor.id, kind, channel: kind === 'contact_attempt' ? channel : null, content: f.content })
        if (error) { toast.error(friendlyError(error)); return }
        reset({ content: '' }); toast.success('Registro adicionado'); onAdded()
      })}>
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={kind} onValueChange={setKind}><SelectTrigger aria-label="Tipo de registro"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="contact_attempt">Tentativa de contato</SelectItem><SelectItem value="note">Nota objetiva</SelectItem><SelectItem value="result">Resultado / próximo passo</SelectItem></SelectContent></Select>
          {kind === 'contact_attempt' && <Select value={channel} onValueChange={setChannel}><SelectTrigger aria-label="Canal"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(CHANNEL_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>}
        </div>
        <Textarea rows={2} maxLength={500} aria-label="Registro" placeholder="Ex.: Mensagem enviada convidando para quinta; sem resposta." {...register('content')} />
        <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Registre fatos objetivos. Não inclua saúde, diagnósticos, opiniões ou assuntos íntimos.</span><span>{len}/500</span></div>
        {errors.content && <p role="alert" className="text-xs text-destructive">{errors.content.message}</p>}
        <SubmitButton size="sm" loading={isSubmitting}><Plus className="mr-1 h-4 w-4" /> Adicionar</SubmitButton>
      </form>
      {hist.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p> : (
        <ol className="space-y-2 border-l border-border pl-4">
          {hist.map(h => (
            <li key={h.id} className="relative text-sm"><span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden />
              <p className="text-xs text-muted-foreground">{KIND_LABEL[h.kind] ?? h.kind}{h.channel ? ` · ${CHANNEL_LABEL[h.channel] ?? h.channel}` : ''} · {formatDateTime(h.created_at, tz)} · {personName(h.created_by)}</p>
              <p className="whitespace-pre-wrap">{describeHistory(h.kind, h.content)}</p></li>))}
        </ol>)}
    </section>
  )
}

function TaskSection({ visitor, tasks, people, personName, tz, onChanged }: { visitor: Visitor; tasks: Task[]; people: Person[]; personName: (id: string | null) => string; tz: string; onChanged: () => void }) {
  const [assignee, setAssignee] = useState('')
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<In<typeof taskSchema>, unknown, Out<typeof taskSchema>>({ resolver: zodResolver(taskSchema), defaultValues: { title: '', due: '' } })
  const [completing, setCompleting] = useState<Task | null>(null)
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Tarefas de acompanhamento</h3>
      <form noValidate className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-2" onSubmit={handleSubmit(async f => {
        const { error } = await db.from('follow_up_tasks').insert({ group_id: visitor.group_id, visitor_id: visitor.id, title: f.title, due_at: f.due ? zonedToUtc(f.due, tz).toISOString() : null, assignee_id: assignee || null })
        if (error) { toast.error(friendlyError(error)); return }
        reset({ title: '', due: '' }); setAssignee(''); toast.success('Tarefa criada'); onChanged()
      })}>
        <div className="sm:col-span-2"><Input aria-label="Nova tarefa" placeholder="Ex.: Ligar para confirmar presença" maxLength={160} {...register('title')} />{errors.title && <p role="alert" className="mt-1 text-xs text-destructive">{errors.title.message}</p>}</div>
        <Input type="datetime-local" aria-label="Prazo" {...register('due')} />
        <Select value={assignee || NONE} onValueChange={a => setAssignee(a === NONE ? '' : a)}><SelectTrigger aria-label="Responsável pela tarefa"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={NONE}>Sem responsável</SelectItem>{people.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.display_name || 'Sem nome'}</SelectItem>)}</SelectContent></Select>
        <SubmitButton size="sm" className="sm:col-span-2 sm:w-fit" loading={isSubmitting}><Plus className="mr-1 h-4 w-4" /> Criar tarefa</SubmitButton>
      </form>
      {tasks.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma tarefa.</p> : (
        <ul className="space-y-2">
          {tasks.map(t => (
            <li key={t.id} className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
              <Checkbox checked={!!t.completed_at} aria-label={t.completed_at ? `Reabrir ${t.title}` : `Concluir ${t.title}`}
                onCheckedChange={async c => { if (c) setCompleting(t); else { const { error } = await db.from('follow_up_tasks').update({ completed_at: null }).eq('id', t.id); if (error) toast.error(friendlyError(error)); else onChanged() } }} />
              <div className="min-w-0 flex-1"><p className={t.completed_at ? 'line-through text-muted-foreground' : 'font-medium'}>{t.title}</p>
                <p className="text-xs text-muted-foreground">{t.due_at ? `Prazo ${formatDateTime(t.due_at, tz)}` : 'Sem prazo'}{isOverdue(t) ? ' · atrasada' : ''} · {personName(t.assignee_id)}</p>
                {t.completed_at && <p className="mt-1 text-xs">{t.result ? `Resultado: ${t.result}. ` : ''}{t.next_step ? `Próximo passo: ${t.next_step}` : ''}</p>}</div>
              <Button size="icon" variant="ghost" aria-label={`Excluir ${t.title}`} onClick={async () => { const { error } = await db.from('follow_up_tasks').delete().eq('id', t.id); if (error) toast.error(friendlyError(error)); else onChanged() }}><Trash2 className="h-4 w-4" /></Button>
            </li>))}
        </ul>)}
      <CompleteTaskDialog task={completing} onClose={() => setCompleting(null)} onDone={() => { setCompleting(null); onChanged() }} />
    </section>
  )
}

export function CompleteTaskDialog({ task, onClose, onDone }: { task: Task | null; onClose: () => void; onDone: () => void }) {
  const [result, setResult] = useState(''), [next, setNext] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { if (task) { setResult(''); setNext('') } }, [task])
  return (
    <AlertDialog open={!!task} onOpenChange={o => !o && onClose()}>
      <AlertDialogContent className="gc-theme bg-card text-foreground">
        <AlertDialogHeader><AlertDialogTitle>Concluir tarefa</AlertDialogTitle><AlertDialogDescription>{task?.title}. Registre o resultado e o próximo passo (curtos e objetivos).</AlertDialogDescription></AlertDialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label htmlFor="ct-result">Resultado</Label><Input id="ct-result" maxLength={300} value={result} onChange={e => setResult(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="ct-next">Próximo passo</Label><Input id="ct-next" maxLength={300} value={next} onChange={e => setNext(e.target.value)} /></div>
        </div>
        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button disabled={busy} onClick={async () => {
            if (!task) return; setBusy(true)
            const { error } = await db.from('follow_up_tasks').update({ completed_at: new Date().toISOString(), result: result.trim() || null, next_step: next.trim() || null }).eq('id', task.id)
            setBusy(false); if (error) toast.error(friendlyError(error)); else { toast.success('Tarefa concluída'); onDone() }
          }}>Concluir</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
