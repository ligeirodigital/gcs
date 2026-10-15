import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { db, friendlyError, type Group } from '../lib/db'
import { useTenant } from '../lib/tenant'
import { brandSchema, groupBasicSchema, meetingSchema, slugSchema, type In, type Out } from '../lib/schemas'
import { can } from '../lib/roles'
import { WEEKDAYS } from '../lib/format'
import { ColorField, Field, FieldShell, PageHeader, SubmitButton } from '../components/ui-kit'
import { ImageUploader } from '../components/ImageUploader'

const schema = groupBasicSchema.and(brandSchema).and(z.object({ slug: slugSchema })).and(
  z.object({ address: z.string().trim().max(300).optional().or(z.literal('')), meeting_weekday: z.string(), meeting_time: z.string() }))

export default function Settings() {
  const { active, reload } = useTenant()
  const g = active?.group
  const canEdit = can.manageGroup(active?.role)
  const { register, handleSubmit, reset, setValue, watch, setError, formState: { errors, isSubmitting, isDirty } } = useForm<In<typeof schema>, unknown, Out<typeof schema>>({ resolver: zodResolver(schema) })
  const [saved, setSaved] = useState<Group | null>(null)
  const current = saved ?? g

  useEffect(() => {
    if (!g) return
    setSaved(null)
    reset({ name: g.name, description: g.description ?? '', primary_color: g.primary_color, secondary_color: g.secondary_color, slug: g.slug,
      address: g.address ?? '', meeting_weekday: g.meeting_weekday?.toString() ?? '', meeting_time: g.meeting_time?.slice(0, 5) ?? '' })
  }, [g?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!g || !current) return null

  async function save(patch: Partial<Group>) {
    const { data, error } = await db.from('groups').update(patch).eq('id', g!.id).select().single()
    if (error) throw error
    setSaved(data as Group); await reload()
  }

  return (
    <>
      <PageHeader title="Configurações do GC" description="Identidade, informações de encontro e endereço público. Cada GC tem sua própria identidade, que pode conviver com a marca da igreja." />
      {!canEdit && <p role="status" className="mb-4 rounded-lg bg-secondary p-3 text-sm">Você pode consultar, mas somente líderes do GC e administradores da igreja podem editar.</p>}
      <div className="space-y-6">
        <section className="space-y-5 rounded-xl border border-border bg-card p-5">
          <h2 className="font-medium">Logo e capa</h2>
          {canEdit ? <>
            <ImageUploader label="Logo do GC" folder={`group/${g.id}`} currentPath={current.logo_path} onUploaded={p => save({ logo_path: p })} />
            <ImageUploader label="Imagem de capa" shape="wide" folder={`group/${g.id}`} currentPath={current.cover_path} onUploaded={p => save({ cover_path: p })} />
          </> : <p className="text-sm text-muted-foreground">Somente leitura.</p>}
        </section>
        <form noValidate className="space-y-6" onSubmit={handleSubmit(async v => {
          try {
            await save({ name: v.name, description: v.description || null, primary_color: v.primary_color, secondary_color: v.secondary_color, slug: v.slug,
              address: v.address || null, meeting_weekday: v.meeting_weekday === '' ? null : Number(v.meeting_weekday), meeting_time: v.meeting_time || null })
            toast.success('Configurações salvas')
          } catch (e) {
            if ((e as { code?: string }).code === '23505') setError('slug', { message: 'Este endereço já está em uso.' }); else toast.error(friendlyError(e))
          }
        })}>
          <fieldset disabled={!canEdit} className="space-y-6">
            <section className="space-y-4 rounded-xl border border-border bg-card p-5">
              <h2 className="font-medium">Identificação</h2>
              <Field label="Nome do GC" error={errors.name?.message} {...register('name')} />
              <FieldShell label="Descrição" htmlFor="desc" error={errors.description?.message}><Textarea id="desc" rows={3} {...register('description')} /></FieldShell>
              <Field label="Endereço público" error={errors.slug?.message} hint={`${window.location.origin}/gc/${watch('slug') || '…'}`} {...register('slug')} />
              <div className="grid gap-4 sm:grid-cols-2">
                <ColorField label="Cor principal" error={errors.primary_color?.message} {...register('primary_color')} />
                <ColorField label="Cor secundária" error={errors.secondary_color?.message} {...register('secondary_color')} />
              </div>
            </section>
            <section className="space-y-4 rounded-xl border border-border bg-card p-5">
              <h2 className="font-medium">Encontros</h2>
              <Field label="Endereço" error={errors.address?.message} {...register('address')} />
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldShell label="Dia da semana">
                  <Select value={watch('meeting_weekday') || undefined} onValueChange={v => setValue('meeting_weekday', v, { shouldDirty: true })}>
                    <SelectTrigger aria-label="Dia da semana"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{WEEKDAYS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </FieldShell>
                <Field label="Horário" type="time" {...register('meeting_time')} />
              </div>
            </section>
          </fieldset>
          {canEdit && <SubmitButton loading={isSubmitting} disabled={!isDirty}>Salvar alterações</SubmitButton>}
        </form>
      </div>
    </>
  )
}
