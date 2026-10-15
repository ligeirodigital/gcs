import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { db, friendlyError, type AppRole } from '../lib/db'
import { useTenant } from '../lib/tenant'
import { ROLE_LABEL } from '../lib/roles'
import { ErrorState, LoadingState } from '../components/ui-kit'

interface Preview { church_name: string; group_name: string | null; role: AppRole; email_hint: string; status: string; expired: boolean }

export default function AcceptInvite() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const tenant = useTenant()
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined)
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)

  useEffect(() => {
    db.rpc('preview_invitation', { p_token: token }).then(({ data, error }) => {
      if (error) { toast.error(friendlyError(error)); setPreview(null); return }
      setPreview((data as Preview[] | null)?.[0] ?? null)
    })
  }, [token])

  async function respond(kind: 'accept' | 'decline') {
    setBusy(kind)
    const { error } = await db.rpc(kind === 'accept' ? 'accept_invitation' : 'decline_invitation', { p_token: token })
    setBusy(null)
    if (error) { toast.error(friendlyError(error)); return }
    if (kind === 'accept') { toast.success('Convite aceito'); await tenant.reload(); navigate('/app', { replace: true }) }
    else { toast.success('Convite recusado'); navigate('/app', { replace: true }) }
  }

  if (preview === undefined) return <LoadingState label="Verificando convite…" />
  if (preview === null) return <div className="mx-auto max-w-md p-6"><ErrorState message="Convite não encontrado. Verifique o link recebido." /></div>
  const unavailable = preview.status !== 'pending' || preview.expired
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Convite para participar</h1>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Igreja</dt><dd>{preview.church_name}</dd></div>
          {preview.group_name && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">GC</dt><dd>{preview.group_name}</dd></div>}
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Função</dt><dd>{ROLE_LABEL[preview.role]}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Enviado para</dt><dd>{preview.email_hint}</dd></div>
        </dl>
        {unavailable ? (
          <p role="alert" className="rounded-lg bg-secondary p-3 text-sm">{preview.expired && preview.status === 'pending' ? 'Este convite expirou.' : 'Este convite já foi utilizado ou cancelado.'} Peça um novo convite à liderança.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">Para aceitar, entre com o e-mail para o qual o convite foi enviado, já verificado.</p>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={!!busy} onClick={() => void respond('accept')}>{busy === 'accept' ? 'Aceitando…' : 'Aceitar convite'}</Button>
              <Button className="flex-1" variant="outline" disabled={!!busy} onClick={() => void respond('decline')}>Recusar</Button>
            </div>
          </>
        )}
        <Link to="/app" className="block text-center text-sm text-muted-foreground underline-offset-4 hover:underline">Ir para o painel</Link>
      </div>
    </div>
  )
}
