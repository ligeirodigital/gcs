import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/db'
import { newPasswordSchema, type In, type Out } from '../lib/schemas'
import { Field, LoadingState, SubmitButton } from '../components/ui-kit'

export default function ResetPassword() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<In<typeof newPasswordSchema>, unknown, Out<typeof newPasswordSchema>>({ resolver: zodResolver(newPasswordSchema) })
  if (loading) return <LoadingState />
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="mb-4 text-lg font-medium">Definir nova senha</h1>
        {!session ? (
          <p className="text-sm text-muted-foreground">Este link é inválido ou expirou. <a className="underline" href="/app/entrar">Solicite um novo link</a>.</p>
        ) : (
          <form className="space-y-4" noValidate onSubmit={handleSubmit(async v => {
            const { error } = await supabase.auth.updateUser({ password: v.password })
            if (error) { toast.error(friendlyError(error)); return }
            toast.success('Senha atualizada'); navigate('/app', { replace: true })
          })}>
            <Field label="Nova senha" type="password" autoComplete="new-password" error={errors.password?.message} {...register('password')} />
            <Field label="Confirmar senha" type="password" autoComplete="new-password" error={errors.confirm?.message} {...register('confirm')} />
            <SubmitButton className="w-full" loading={isSubmitting}>Salvar senha</SubmitButton>
          </form>
        )}
      </div>
    </div>
  )
}
