import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { MailCheck } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/db'
import { emailSchema, loginSchema, signupSchema, type In, type Out } from '../lib/schemas'
import { Field, SubmitButton } from '../components/ui-kit'

type Mode = 'login' | 'signup'

export default function AuthPage() {
  const { session, loading } = useAuth()
  const loc = useLocation()
  const [mode, setMode] = useState<Mode>('login')
  const [forgot, setForgot] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const from = (loc.state as { from?: string } | null)?.from ?? '/app'

  if (!loading && session) return <Navigate to={from} replace />

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">GC <span className="text-primary-ink">Digital</span></h1>
          <p className="mt-1 text-sm text-muted-foreground">Comunicação, Conexão e Crescimento</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          {notice ? (
            <div role="status" className="space-y-3 text-center">
              <MailCheck className="mx-auto h-8 w-8 text-success" aria-hidden />
              <p className="text-sm">{notice}</p>
              <Button variant="outline" onClick={() => { setNotice(null); setForgot(false) }}>Voltar</Button>
            </div>
          ) : forgot ? (
            <ForgotForm onSent={setNotice} onBack={() => setForgot(false)} />
          ) : (
            <Tabs value={mode} onValueChange={v => setMode(v as Mode)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>
              <TabsContent value="login" className="mt-5"><LoginForm onForgot={() => setForgot(true)} /></TabsContent>
              <TabsContent value="signup" className="mt-5"><SignupForm onDone={setNotice} /></TabsContent>
            </Tabs>
          )}
        </div>
        <p className="px-4 text-center text-xs text-muted-foreground">
          Criar uma conta não dá acesso a nenhum GC. O acesso é concedido por convite ou autorização da administração.
        </p>
      </div>
    </div>
  )
}

function LoginForm({ onForgot }: { onForgot: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<In<typeof loginSchema>, unknown, Out<typeof loginSchema>>({ resolver: zodResolver(loginSchema) })
  return (
    <form className="space-y-4" noValidate onSubmit={handleSubmit(async v => {
      const { error } = await supabase.auth.signInWithPassword({ email: v.email, password: v.password })
      if (error) toast.error(/invalid login/i.test(error.message) ? 'E-mail ou senha incorretos.' : /not confirmed/i.test(error.message) ? 'Confirme seu e-mail antes de entrar.' : friendlyError(error))
    })}>
      <Field label="E-mail" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
      <Field label="Senha" type="password" autoComplete="current-password" error={errors.password?.message} {...register('password')} />
      <SubmitButton className="w-full" loading={isSubmitting}>Entrar</SubmitButton>
      <button type="button" onClick={onForgot} className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline">Esqueci minha senha</button>
    </form>
  )
}

function SignupForm({ onDone }: { onDone: (m: string) => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<In<typeof signupSchema>, unknown, Out<typeof signupSchema>>({ resolver: zodResolver(signupSchema) })
  return (
    <form className="space-y-4" noValidate onSubmit={handleSubmit(async v => {
      const { data, error } = await supabase.auth.signUp({
        email: v.email, password: v.password,
        options: { data: { display_name: v.displayName }, emailRedirectTo: `${window.location.origin}/app` },
      })
      if (error) { toast.error(friendlyError(error)); return }
      if (!data.session) onDone('Enviamos um e-mail de confirmação. Após confirmar, entre para aceitar seu convite.')
    })}>
      <Field label="Nome" autoComplete="name" error={errors.displayName?.message} {...register('displayName')} />
      <Field label="E-mail" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
      <Field label="Senha" type="password" autoComplete="new-password" hint="Mínimo de 8 caracteres." error={errors.password?.message} {...register('password')} />
      <SubmitButton className="w-full" loading={isSubmitting}>Criar conta</SubmitButton>
    </form>
  )
}

function ForgotForm({ onSent, onBack }: { onSent: (m: string) => void; onBack: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<In<typeof emailSchema>, unknown, Out<typeof emailSchema>>({ resolver: zodResolver(emailSchema) })
  return (
    <form className="space-y-4" noValidate onSubmit={handleSubmit(async v => {
      const { error } = await supabase.auth.resetPasswordForEmail(v.email, { redirectTo: `${window.location.origin}/app/redefinir-senha` })
      if (error) { toast.error(friendlyError(error)); return }
      onSent('Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.')
    })}>
      <h2 className="text-lg font-medium">Recuperar senha</h2>
      <Field label="E-mail" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
      <SubmitButton className="w-full" loading={isSubmitting}>Enviar link</SubmitButton>
      <Button type="button" variant="ghost" className="w-full" onClick={onBack}>Voltar</Button>
    </form>
  )
}
