import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '../lib/auth'
import { useTenant } from '../lib/tenant'

export default function NoAccess() {
  const { signOut, user } = useAuth()
  const { reload } = useTenant()
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md space-y-4 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-primary-ink" aria-hidden />
        <h1 className="text-xl font-semibold">Você ainda não faz parte de nenhum GC</h1>
        <p className="text-sm text-muted-foreground">
          Sua conta ({user?.email}) foi criada, mas o acesso a um GC depende de um convite da liderança ou de uma
          autorização da administração da plataforma. Peça que enviem o convite para este e-mail e abra o link recebido.
        </p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={() => void reload()}>Já fui convidado — atualizar</Button>
          <Button variant="ghost" onClick={() => void signOut()}>Sair</Button>
        </div>
      </div>
    </div>
  )
}
