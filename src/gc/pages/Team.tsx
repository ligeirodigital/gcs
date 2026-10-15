import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Trash2, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { db, friendlyError, type AppRole } from '../lib/db'
import { useTenant } from '../lib/tenant'
import { useAuth } from '../lib/auth'
import { GROUP_ROLES, ROLE_LABEL, can } from '../lib/roles'
import { formatDate } from '../lib/format'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui-kit'
import { InvitePanel } from '../components/InvitePanel'

interface Member { id: string; user_id: string; role: AppRole; created_at: string; profiles: { display_name: string } | null }
interface Invite { id: string; email: string; role: AppRole; expires_at: string; created_at: string }

export default function Team() {
  const { active } = useTenant()
  const { user } = useAuth()
  const [members, setMembers] = useState<Member[] | null>(null)
  const [invites, setInvites] = useState<Invite[]>([])
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Member | null>(null)
  const groupId = active?.group.id
  const manage = can.manageGroup(active?.role)

  const load = useCallback(async () => {
    if (!groupId) return
    setError(null)
    const [m, i] = await Promise.all([
      db.from('memberships').select('id, user_id, role, created_at, profiles(display_name)').eq('group_id', groupId).order('created_at'),
      manage ? db.from('invitations').select('id, email, role, expires_at, created_at').eq('group_id', groupId).eq('status', 'pending').order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ])
    if (m.error || i.error) { setError(friendlyError(m.error ?? i.error)); return }
    setMembers(m.data as unknown as Member[]); setInvites(i.data as Invite[])
  }, [groupId, manage])
  useEffect(() => { setMembers(null); void load() }, [load])

  if (!active) return null
  async function changeRole(m: Member, role: AppRole) {
    const { error } = await db.rpc('set_member_role', { p_membership: m.id, p_role: role })
    if (error) toast.error(friendlyError(error)); else { toast.success('Função atualizada'); void load() }
  }
  async function remove(m: Member) {
    const { error } = await db.rpc('remove_member', { p_membership: m.id })
    setRemoving(null)
    if (error) toast.error(friendlyError(error)); else { toast.success('Membro removido'); void load() }
  }
  async function revoke(i: Invite) {
    const { error } = await db.rpc('revoke_invitation', { p_id: i.id })
    if (error) toast.error(friendlyError(error)); else { toast.success('Convite cancelado'); void load() }
  }

  return (
    <>
      <PageHeader title="Equipe e permissões" description={`Pessoas com acesso ao GC ${active.group.name}. Alterações de função são validadas e registradas no servidor.`} />
      {manage && (
        <section className="mb-8 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 font-medium">Convidar para o GC</h2>
          <InvitePanel churchId={active.church.id} groupId={active.group.id} onCreated={() => void load()} />
        </section>
      )}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : members === null ? <LoadingState /> : (
        <>
          <section className="mb-8">
            <h2 className="mb-3 font-medium">Membros ({members.length})</h2>
            {members.length === 0 ? <EmptyState icon={Users} title="Nenhum membro direto" description="Administradores da igreja têm acesso a todos os GCs e não aparecem nesta lista." /> : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <Table>
                  <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Função</TableHead><TableHead>Desde</TableHead><TableHead className="w-12"><span className="sr-only">Ações</span></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {members.map(m => {
                      const self = m.user_id === user?.id
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium">{m.profiles?.display_name || 'Sem nome'}{self && <Badge variant="secondary" className="ml-2">você</Badge>}</TableCell>
                          <TableCell>
                            {manage && !self ? (
                              <Select value={m.role} onValueChange={v => void changeRole(m, v as AppRole)}>
                                <SelectTrigger className="w-52" aria-label={`Função de ${m.profiles?.display_name ?? 'membro'}`}><SelectValue /></SelectTrigger>
                                <SelectContent>{GROUP_ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
                              </Select>) : ROLE_LABEL[m.role]}
                          </TableCell>
                          <TableCell>{formatDate(m.created_at, active.group.timezone)}</TableCell>
                          <TableCell>{(manage || self) && <Button variant="ghost" size="icon" aria-label={self ? 'Sair do GC' : `Remover ${m.profiles?.display_name ?? 'membro'}`} onClick={() => setRemoving(m)}><Trash2 className="h-4 w-4" /></Button>}</TableCell>
                        </TableRow>)
                    })}
                  </TableBody>
                </Table>
              </div>)}
          </section>
          {manage && invites.length > 0 && (
            <section>
              <h2 className="mb-3 font-medium">Convites pendentes ({invites.length})</h2>
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {invites.map(i => (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">{i.email}</span>
                    <Badge variant="outline">{ROLE_LABEL[i.role]}</Badge>
                    <span className="text-xs text-muted-foreground">expira em {formatDate(i.expires_at, active.group.timezone)}</span>
                    <Button variant="outline" size="sm" onClick={() => void revoke(i)}>Cancelar</Button>
                  </li>))}
              </ul>
            </section>)}
        </>)}
      <AlertDialog open={!!removing} onOpenChange={o => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{removing?.user_id === user?.id ? 'Sair deste GC?' : 'Remover membro?'}</AlertDialogTitle>
            <AlertDialogDescription>{removing?.user_id === user?.id ? 'Você perderá o acesso a este GC.' : `${removing?.profiles?.display_name ?? 'Esta pessoa'} perderá o acesso a este GC.`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => removing && void remove(removing)}>Confirmar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
