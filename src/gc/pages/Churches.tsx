import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Building2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { db, friendlyError } from '../lib/db'
import { useTenant } from '../lib/tenant'
import { churchSchema, groupBasicSchema, type In, type Out } from '../lib/schemas'
import { slugify } from '../lib/format'
import { EmptyState, Field, PageHeader, SubmitButton } from '../components/ui-kit'

export default function Churches() {
  const { churches, access, isPlatformAdmin, reload, setActiveGroupId } = useTenant()
  const [dlg, setDlg] = useState<{ kind: 'church' } | { kind: 'group'; churchId: string } | null>(null)
  const adminChurches = churches.filter(c => isPlatformAdmin || access.some(a => a.church.id === c.id && a.role === 'church_admin'))
  return (
    <>
      <PageHeader title="Igrejas e GCs" description="Cadastre GCs independentes dentro de cada igreja. Cada GC tem dados, equipe e identidade próprios."
        actions={isPlatformAdmin ? <Button onClick={() => setDlg({ kind: 'church' })}><Plus className="mr-2 h-4 w-4" /> Nova igreja</Button> : undefined} />
      {adminChurches.length === 0 ? <EmptyState icon={Building2} title="Nenhuma igreja" description="Crie a primeira igreja para começar." /> : (
        <div className="space-y-6">
          {adminChurches.map(c => (
            <section key={c.id} className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div><h2 className="font-medium">{c.name}</h2><p className="text-xs text-muted-foreground">/{c.slug}</p></div>
                <Button variant="outline" size="sm" onClick={() => setDlg({ kind: 'group', churchId: c.id })}><Plus className="mr-1 h-4 w-4" /> Novo GC</Button>
              </div>
              <ul className="divide-y divide-border">
                {access.filter(a => a.church.id === c.id).map(a => (
                  <li key={a.group.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="h-3 w-3 rounded-full" style={{ background: a.group.primary_color }} aria-hidden />
                    <span className="flex-1">{a.group.name} <span className="text-xs text-muted-foreground">/gc/{a.group.slug}</span></span>
                    <Button variant="ghost" size="sm" onClick={() => { setActiveGroupId(a.group.id); toast.success(`GC ativo: ${a.group.name}`) }}>Usar</Button>
                  </li>))}
                {access.every(a => a.church.id !== c.id) && <li className="py-3 text-sm text-muted-foreground">Esta igreja ainda não tem GCs.</li>}
              </ul>
            </section>))}
        </div>)}
      <Dialog open={!!dlg} onOpenChange={o => !o && setDlg(null)}>
        <DialogContent className="gc-theme bg-card text-foreground">
          {dlg?.kind === 'church' && <NewChurch onDone={async () => { setDlg(null); await reload() }} />}
          {dlg?.kind === 'group' && <NewGroup churchId={dlg.churchId} onDone={async (id) => { setDlg(null); await reload(); setActiveGroupId(id) }} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function NewChurch({ onDone }: { onDone: () => void }) {
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting, touchedFields } } = useForm<In<typeof churchSchema>, unknown, Out<typeof churchSchema>>({ resolver: zodResolver(churchSchema), defaultValues: { name: '', slug: '', website_url: '' } })
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit(async v => {
      const { data: id, error } = await db.rpc('create_church', { p_name: v.name, p_slug: v.slug })
      if (error) { toast.error(friendlyError(error)); return }
      if (v.website_url) await db.from('churches').update({ website_url: v.website_url }).eq('id', id as string)
      toast.success('Igreja criada'); onDone()
    })}>
      <DialogHeader><DialogTitle>Nova igreja</DialogTitle><DialogDescription>Você será registrado como administrador desta igreja.</DialogDescription></DialogHeader>
      <Field label="Nome" error={errors.name?.message} {...register('name', { onChange: e => { if (!touchedFields.slug) setValue('slug', slugify(e.target.value)) } })} />
      <Field label="Identificador" error={errors.slug?.message} {...register('slug')} />
      <Field label="Site (opcional)" type="url" placeholder="https://" error={errors.website_url?.message} {...register('website_url')} />
      <SubmitButton loading={isSubmitting}>Criar igreja</SubmitButton>
    </form>
  )
}

function NewGroup({ churchId, onDone }: { churchId: string; onDone: (id: string) => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<In<typeof groupBasicSchema>, unknown, Out<typeof groupBasicSchema>>({ resolver: zodResolver(groupBasicSchema), defaultValues: { name: '', description: '' } })
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit(async v => {
      const base = slugify(v.name) || 'gc'
      for (let i = 0; i < 4; i++) {
        const slug = i === 0 ? base : `${base.slice(0, 44)}-${Math.random().toString(36).slice(2, 6)}`
        const { data, error } = await db.from('groups').insert({ church_id: churchId, name: v.name, description: v.description || null, slug }).select('id').single()
        if (!error) { toast.success('GC criado. Complete a configuração dele em Configurações.'); onDone((data as { id: string }).id); return }
        if (error.code !== '23505') { toast.error(friendlyError(error)); return }
      }
      toast.error('Não foi possível gerar um endereço único. Tente outro nome.')
    })}>
      <DialogHeader><DialogTitle>Novo GC</DialogTitle><DialogDescription>O endereço público pode ser ajustado depois em Configurações.</DialogDescription></DialogHeader>
      <Field label="Nome do GC" error={errors.name?.message} {...register('name')} />
      <SubmitButton loading={isSubmitting}>Criar GC</SubmitButton>
    </form>
  )
}
