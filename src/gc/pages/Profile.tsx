import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { db, friendlyError } from '../lib/db'
import { useAuth } from '../lib/auth'
import { profileSchema, type In, type Out } from '../lib/schemas'
import { Field, PageHeader, SubmitButton } from '../components/ui-kit'

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth()
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<In<typeof profileSchema>, unknown, Out<typeof profileSchema>>({ resolver: zodResolver(profileSchema) })
  useEffect(() => { reset({ display_name: profile?.display_name ?? '', phone: profile?.phone ?? '' }) }, [profile, reset])
  return (
    <>
      <PageHeader title="Meu perfil" />
      <form noValidate className="max-w-md space-y-4 rounded-xl border border-border bg-card p-5" onSubmit={handleSubmit(async v => {
        const { error } = await db.from('profiles').update({ display_name: v.display_name, phone: v.phone || null }).eq('id', user!.id)
        if (error) { toast.error(friendlyError(error)); return }
        await refreshProfile(); toast.success('Perfil atualizado')
      })}>
        <Field label="E-mail" value={user?.email ?? ''} readOnly disabled />
        <Field label="Nome" error={errors.display_name?.message} {...register('display_name')} />
        <Field label="Telefone (opcional)" type="tel" error={errors.phone?.message} {...register('phone')} />
        <SubmitButton loading={isSubmitting}>Salvar</SubmitButton>
      </form>
    </>
  )
}
