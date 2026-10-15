import { useEffect, useState } from 'react'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { db, friendlyError, type Church, type Group } from '../lib/db'
import { useTenant } from '../lib/tenant'
import { useAuth } from '../lib/auth'
import { brandSchema, churchSchema, groupBasicSchema, meetingSchema, slugSchema, type In, type Out } from '../lib/schemas'
import { WEEKDAYS, slugify } from '../lib/format'
import { ColorField, Field, FieldShell, SubmitButton } from '../components/ui-kit'
import { ImageUploader } from '../components/ImageUploader'
import { InvitePanel } from '../components/InvitePanel'

const z_slug = z.object({ slug: slugSchema })
const STEPS = ['Igreja', 'GC', 'Identidade', 'Encontros', 'Link público', 'Colaboradores']

export default function Wizard() {
  const t = useTenant()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [church, setChurch] = useState<Church | null>(t.active?.church ?? (t.churches.length === 1 ? t.churches[0] : null))
  const [group, setGroup] = useState<Group | null>(t.active?.group ?? null)
  const isAdminOfChurch = !church ? t.isPlatformAdmin : t.isPlatformAdmin || t.active?.role === 'church_admin'
    || t.access.some(a => a.church.id === church.id && a.role === 'church_admin')
  const next = () => setStep(s => Math.min(s + 1, STEPS.length - 1))
  const back = () => setStep(s => Math.max(s - 1, 0))

  async function saveGroup(patch: Partial<Group>) {
    if (!group) return
    const { data, error } = await db.from('groups').update(patch).eq('id', group.id).select().single()
    if (error) throw error
    setGroup(data as Group)
  }

  async function finish() {
    if (!group) return
    try {
      await saveGroup({ onboarding_completed_at: new Date().toISOString() })
      t.setActiveGroupId(group.id)
      await t.reload()
      toast.success('GC configurado!'); navigate('/app', { replace: true })
    } catch (e) { toast.error(friendlyError(e)) }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Configuração inicial</h1>
          <Button variant="ghost" size="sm" onClick={() => void signOut().then(() => navigate('/app/entrar'))}>Sair</Button>
        </div>
        <ol className="mb-6 flex gap-1" aria-label="Etapas">
          {STEPS.map((s, i) => (
            <li key={s} className="flex-1" aria-current={i === step ? 'step' : undefined}>
              <div className={`h-1.5 rounded-full ${i <= step ? 'bg-primary' : 'bg-border'}`} />
              <span className={`mt-1 hidden text-xs sm:block ${i === step ? 'font-medium' : 'text-muted-foreground'}`}>{i + 1}. {s}</span>
            </li>
          ))}
        </ol>
        <p className="mb-3 text-sm text-muted-foreground sm:hidden">Etapa {step + 1} de {STEPS.length}: {STEPS[step]}</p>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          {step === 0 && <ChurchStep church={church} canEdit={isAdminOfChurch} onSaved={c => { setChurch(c); next() }} onSkip={next} />}
          {step === 1 && church && <GroupStep church={church} group={group} canCreate={isAdminOfChurch} onSaved={g => { setGroup(g); next() }} onBack={back} />}
          {step === 2 && group && <IdentityStep group={group} save={saveGroup} onNext={next} onBack={back} />}
          {step === 3 && group && <MeetingStep group={group} save={saveGroup} onNext={next} onBack={back} />}
          {step === 4 && group && <LinkStep group={group} save={saveGroup} onNext={next} onBack={back} />}
          {step === 5 && group && church && (
            <div className="space-y-5">
              <div><h2 className="text-lg font-medium">Convide os colaboradores</h2>
                <p className="text-sm text-muted-foreground">Opcional. Você pode convidar mais pessoas depois, em Equipe e permissões.</p></div>
              <InvitePanel churchId={church.id} groupId={group.id} />
              <div className="flex justify-between pt-2"><Button variant="ghost" onClick={back}>Voltar</Button>
                <Button onClick={() => void finish()}><Check className="mr-2 h-4 w-4" /> Concluir configuração</Button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ChurchStep({ church, canEdit, onSaved, onSkip }: { church: Church | null; canEdit: boolean; onSaved: (c: Church) => void; onSkip: () => void }) {
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting, touchedFields } } = useForm<In<typeof churchSchema>, unknown, Out<typeof churchSchema>>({
    resolver: zodResolver(churchSchema),
    defaultValues: { name: church?.name ?? '', slug: church?.slug ?? '', website_url: church?.website_url ?? '' },
  })
  if (!canEdit) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Dados da igreja</h2>
        <p className="text-sm">Igreja: <strong>{church?.name}</strong></p>
        <p className="text-sm text-muted-foreground">Os dados da igreja são mantidos pela administração da igreja.</p>
        <div className="flex justify-end"><Button onClick={onSkip}>Continuar</Button></div>
      </div>
    )
  }
  return (
    <form className="space-y-4" noValidate onSubmit={handleSubmit(async v => {
      try {
        if (church) {
          const { data, error } = await db.from('churches').update({ name: v.name, website_url: v.website_url || null }).eq('id', church.id).select().single()
          if (error) throw error
          onSaved(data as Church)
        } else {
          const { data: id, error } = await db.rpc('create_church', { p_name: v.name, p_slug: v.slug })
          if (error) throw error
          const { data, error: e2 } = await db.from('churches').select('*').eq('id', id as string).single()
          if (e2) throw e2
          onSaved(data as Church)
        }
      } catch (e) { toast.error(friendlyError(e)) }
    })}>
      <h2 className="text-lg font-medium">Dados da igreja</h2>
      <Field label="Nome da igreja" error={errors.name?.message} {...register('name', {
        onChange: e => { if (!church && !touchedFields.slug) setValue('slug', slugify(e.target.value)) } })} />
      <Field label="Identificador (slug)" disabled={!!church} hint={church ? 'O identificador não pode ser alterado.' : 'Letras minúsculas, números e hífens.'} error={errors.slug?.message} {...register('slug')} />
      <Field label="Site da igreja (opcional)" type="url" placeholder="https://" error={errors.website_url?.message} {...register('website_url')} />
      <div className="flex justify-end"><SubmitButton loading={isSubmitting}>{church ? 'Salvar e continuar' : 'Criar igreja'}</SubmitButton></div>
    </form>
  )
}

function GroupStep({ church, group, canCreate, onSaved, onBack }: { church: Church; group: Group | null; canCreate: boolean; onSaved: (g: Group) => void; onBack: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<In<typeof groupBasicSchema>, unknown, Out<typeof groupBasicSchema>>({
    resolver: zodResolver(groupBasicSchema), defaultValues: { name: group?.name ?? '', description: group?.description ?? '' } })
  return (
    <form className="space-y-4" noValidate onSubmit={handleSubmit(async v => {
      try {
        if (group) {
          const { data, error } = await db.from('groups').update({ name: v.name, description: v.description || null }).eq('id', group.id).select().single()
          if (error) throw error
          onSaved(data as Group); return
        }
        const base = slugify(v.name) || 'gc'
        for (let i = 0; i < 4; i++) {
          const slug = i === 0 ? base : `${base.slice(0, 44)}-${Math.random().toString(36).slice(2, 6)}`
          const { data, error } = await db.from('groups').insert({ church_id: church.id, name: v.name, description: v.description || null, slug }).select().single()
          if (!error) { onSaved(data as Group); return }
          if (error.code !== '23505') throw error
        }
        throw new Error('Não foi possível gerar um endereço único para o GC. Tente outro nome.')
      } catch (e) { toast.error(friendlyError(e)) }
    })}>
      <h2 className="text-lg font-medium">Nome e identificação do GC</h2>
      {!group && !canCreate ? <p role="alert" className="text-sm">Somente a administração da igreja pode criar um novo GC.</p> : <>
        <Field label="Nome do GC" error={errors.name?.message} {...register('name')} />
        <FieldShell label="Descrição (opcional)" error={errors.description?.message} htmlFor="gc-desc">
          <Textarea id="gc-desc" rows={3} {...register('description')} /></FieldShell></>}
      <div className="flex justify-between"><Button type="button" variant="ghost" onClick={onBack}>Voltar</Button>
        <SubmitButton loading={isSubmitting} disabled={!group && !canCreate}>{group ? 'Salvar e continuar' : 'Criar GC'}</SubmitButton></div>
    </form>
  )
}

type StepProps = { group: Group; save: (p: Partial<Group>) => Promise<void>; onNext: () => void; onBack: () => void }

function IdentityStep({ group, save, onNext, onBack }: StepProps) {
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<In<typeof brandSchema>, unknown, Out<typeof brandSchema>>({
    resolver: zodResolver(brandSchema), defaultValues: { primary_color: group.primary_color, secondary_color: group.secondary_color } })
  const c = watch()
  return (
    <form className="space-y-5" noValidate onSubmit={handleSubmit(async v => {
      try { await save(v); onNext() } catch (e) { toast.error(friendlyError(e)) } })}>
      <h2 className="text-lg font-medium">Logo e identidade visual</h2>
      <ImageUploader label="Logo do GC" folder={`group/${group.id}`} currentPath={group.logo_path} onUploaded={p => save({ logo_path: p })} />
      <ImageUploader label="Imagem de capa" shape="wide" folder={`group/${group.id}`} currentPath={group.cover_path} onUploaded={p => save({ cover_path: p })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <ColorField label="Cor principal" error={errors.primary_color?.message} {...register('primary_color')} />
        <ColorField label="Cor secundária" error={errors.secondary_color?.message} {...register('secondary_color')} />
      </div>
      <div className="flex items-center gap-3 rounded-lg border border-border p-3" aria-label="Prévia">
        <span className="rounded-md px-3 py-1.5 text-sm font-medium" style={{ background: c.primary_color, color: c.secondary_color }}>{group.name}</span>
        <span className="text-xs text-muted-foreground">Prévia das cores</span>
      </div>
      <div className="flex justify-between"><Button type="button" variant="ghost" onClick={onBack}>Voltar</Button><SubmitButton loading={isSubmitting}>Salvar e continuar</SubmitButton></div>
    </form>
  )
}

function MeetingStep({ group, save, onNext, onBack }: StepProps) {
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<In<typeof meetingSchema>, unknown, Out<typeof meetingSchema>>({
    resolver: zodResolver(meetingSchema),
    defaultValues: { address: group.address ?? '', meeting_weekday: group.meeting_weekday?.toString() ?? '', meeting_time: group.meeting_time?.slice(0, 5) ?? '' } })
  const wd = watch('meeting_weekday')
  return (
    <form className="space-y-4" noValidate onSubmit={handleSubmit(async v => {
      try {
        await save({ address: v.address || null, meeting_weekday: v.meeting_weekday === '' ? null : Number(v.meeting_weekday), meeting_time: v.meeting_time || null })
        onNext()
      } catch (e) { toast.error(friendlyError(e)) } })}>
      <h2 className="text-lg font-medium">Endereço e horário dos encontros</h2>
      <Field label="Endereço" error={errors.address?.message} {...register('address')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldShell label="Dia da semana" error={errors.meeting_weekday?.message}>
          <Select value={wd || undefined} onValueChange={v => setValue('meeting_weekday', v)}>
            <SelectTrigger aria-label="Dia da semana"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{WEEKDAYS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}</SelectContent>
          </Select>
        </FieldShell>
        <Field label="Horário" type="time" error={errors.meeting_time?.message} {...register('meeting_time')} />
      </div>
      <p className="text-xs text-muted-foreground">Fuso horário: {group.timezone}.</p>
      <div className="flex justify-between"><Button type="button" variant="ghost" onClick={onBack}>Voltar</Button><SubmitButton loading={isSubmitting}>Salvar e continuar</SubmitButton></div>
    </form>
  )
}

function LinkStep({ group, save, onNext, onBack }: StepProps) {
  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm<In<typeof z_slug>, unknown, Out<typeof z_slug>>({
    resolver: zodResolver(z_slug), defaultValues: { slug: group.slug } })
  const slug = watch('slug')
  const [available, setAvailable] = useState<boolean | null>(null)
  useEffect(() => {
    setAvailable(null)
    const parsed = slugSchema.safeParse(slug)
    if (!parsed.success || parsed.data === group.slug) return
    const h = setTimeout(async () => {
      const { data } = await db.rpc('slug_available', { p_slug: parsed.data })
      setAvailable(data === true)
    }, 400)
    return () => clearTimeout(h)
  }, [slug, group.slug])
  return (
    <form className="space-y-4" noValidate onSubmit={handleSubmit(async v => {
      try { await save({ slug: v.slug }); onNext() } catch (e) {
        const err = e as { code?: string }
        if (err.code === '23505') setError('slug', { message: 'Este endereço já está em uso.' }); else toast.error(friendlyError(e))
      } })}>
      <h2 className="text-lg font-medium">Link público do GC</h2>
      <Field label="Endereço do GC" error={errors.slug?.message} hint={`${window.location.origin}/gc/${slug || '…'}`} {...register('slug')} />
      {available === true && <p role="status" className="text-xs text-success">Endereço disponível.</p>}
      {available === false && <p role="alert" className="text-xs text-destructive">Este endereço já está em uso.</p>}
      <p className="text-xs text-muted-foreground">A página pública (link na bio) será liberada na Etapa 4; o endereço fica reservado desde já.</p>
      <div className="flex justify-between"><Button type="button" variant="ghost" onClick={onBack}>Voltar</Button>
        <SubmitButton loading={isSubmitting} disabled={available === false}>Salvar e continuar</SubmitButton></div>
    </form>
  )
}
