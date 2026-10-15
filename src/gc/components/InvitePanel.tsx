import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { db, friendlyError, type AppRole } from '../lib/db'
import { inviteSchema } from '../lib/schemas'
import { GROUP_ROLES, ROLE_HELP, ROLE_LABEL } from '../lib/roles'
import { Field, FieldShell, SubmitButton } from './ui-kit'

export function InvitePanel({ churchId, groupId, onCreated }: { churchId: string; groupId: string; onCreated?: () => void }) {
  const [link, setLink] = useState<string | null>(null)
  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } =
    useForm<{ email: string; role: AppRole }>({ resolver: zodResolver(inviteSchema), defaultValues: { email: '', role: 'communicator' } })
  const role = watch('role') as AppRole

  return (
    <div className="space-y-4">
      <form className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end" noValidate onSubmit={handleSubmit(async v => {
        const { data, error } = await db.rpc('create_invitation', { p_email: v.email, p_role: v.role, p_church: churchId, p_group: groupId })
        if (error) { toast.error(friendlyError(error)); return }
        const token = (data as { token: string }[])[0].token
        setLink(`${window.location.origin}/app/convite/${token}`)
        reset({ email: '', role: v.role }); onCreated?.()
      })}>
        <Field label="E-mail do convidado" type="email" error={errors.email?.message} {...register('email')} />
        <FieldShell label="Função" error={errors.role?.message}>
          <Select value={role} onValueChange={v => setValue('role', v as AppRole)}>
            <SelectTrigger aria-label="Função"><SelectValue /></SelectTrigger>
            <SelectContent>{GROUP_ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
          </Select>
        </FieldShell>
        <SubmitButton loading={isSubmitting}>Gerar convite</SubmitButton>
      </form>
      <p className="text-xs text-muted-foreground">{ROLE_HELP[role]}</p>
      {link && (
        <div role="status" className="space-y-2 rounded-lg border border-border bg-secondary p-3">
          <p className="text-sm font-medium">Convite criado. Envie este link ao convidado:</p>
          <div className="flex gap-2">
            <Input readOnly value={link} aria-label="Link do convite" onFocus={e => e.currentTarget.select()} />
            <Button type="button" variant="outline" size="icon" aria-label="Copiar link" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success('Link copiado'), () => toast.error('Não foi possível copiar'))}><Copy className="h-4 w-4" /></Button>
          </div>
          <p className="text-xs text-muted-foreground">
            O envio automático por e-mail ainda não está configurado: compartilhe o link manualmente. Ele é válido por 7 dias, só funciona
            para o e-mail informado (verificado) e é exibido apenas agora.
          </p>
        </div>
      )}
    </div>
  )
}
