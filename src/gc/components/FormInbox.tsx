import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Inbox, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { db, friendlyError } from '../lib/db'
import { useTenant } from '../lib/tenant'
import { can } from '../lib/roles'
import { formatDateTime } from '../lib/format'
import { EmptyState, ErrorState, LoadingState } from './ui-kit'

export const FORM_KIND_LABEL: Record<string, string> = { join_gc: 'Quero participar do GC', know_church: 'Quero conhecer a igreja', prayer_request: 'Pedido de oração', contact_leadership: 'Contato com a liderança' }
interface Sub { id: string; kind: string; name: string | null; phone: string | null; email: string | null; message: string | null; status: 'new' | 'handled'; visitor_id: string | null; created_at: string; anonymized_at: string | null }
const PAGE = 20

export function FormInbox({ onOpenVisitor }: { onOpenVisitor: (id: string) => void }) {
  const { active } = useTenant()
  const g = active!.group
  const [filter, setFilter] = useState<'new' | 'handled' | 'all'>('new')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<Sub[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [del, setDel] = useState<Sub | null>(null)

  const load = useCallback(async () => {
    setError(null)
    let q = db.from('form_submissions').select('id, kind, name, phone, email, message, status, visitor_id, created_at, anonymized_at', { count: 'exact' }).eq('group_id', g.id).order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)
    if (filter !== 'all') q = q.eq('status', filter)
    const { data, error, count } = await q
    if (error) { setError(friendlyError(error)); return }
    setRows((data ?? []) as Sub[]); setTotal(count ?? 0)
  }, [g.id, filter, page])
  useEffect(() => { void load() }, [load])
  useEffect(() => setPage(0), [filter])

  async function setStatus(s: Sub, status: 'new' | 'handled') {
    const { error } = await db.from('form_submissions').update({ status }).eq('id', s.id)
    if (error) toast.error(friendlyError(error)); else void load()
  }
  async function remove(s: Sub) {
    const { error } = await db.from('form_submissions').delete().eq('id', s.id)
    setDel(null); if (error) toast.error(friendlyError(error)); else { toast.success('Registro excluído'); void load() }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={filter} onValueChange={v => setFilter(v as typeof filter)}><SelectTrigger className="w-48" aria-label="Filtrar formulários"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="new">Novos</SelectItem><SelectItem value="handled">Atendidos</SelectItem><SelectItem value="all">Todos</SelectItem></SelectContent></Select>
        <p className="text-xs text-muted-foreground">Formulários enviados pela página pública. Pedidos de oração ficam guardados por até 6 meses.</p>
      </div>
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : rows === null ? <LoadingState /> : rows.length === 0 ? (
        <EmptyState icon={Inbox} title="Nenhum formulário aqui" description="Quando alguém enviar um formulário pela página pública, ele aparecerá nesta lista." />
      ) : (
        <>
          <ul className="space-y-3">
            {rows.map(s => (
              <li key={s.id} className="rounded-xl border border-border bg-card p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{FORM_KIND_LABEL[s.kind] ?? s.kind}</Badge>
                  <Badge variant={s.status === 'new' ? 'default' : 'outline'}>{s.status === 'new' ? 'Novo' : 'Atendido'}</Badge><span className="text-xs text-muted-foreground">{formatDateTime(s.created_at, g.timezone)}</span></div>
                {s.anonymized_at ? <p className="mt-2 text-muted-foreground">Dados anonimizados.</p> : <>
                  <p className="mt-2 font-medium">{s.name || 'Anônimo'}</p>
                  {(s.phone || s.email) && <p className="text-muted-foreground">{[s.phone, s.email].filter(Boolean).join(' · ')}</p>}
                  {s.message && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-secondary p-3">{s.message}</p>}</>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {s.status === 'new' ? <Button size="sm" onClick={() => void setStatus(s, 'handled')}>Marcar como atendido</Button> : <Button size="sm" variant="outline" onClick={() => void setStatus(s, 'new')}>Reabrir</Button>}
                  {s.visitor_id && <Button size="sm" variant="outline" onClick={() => onOpenVisitor(s.visitor_id!)}>Abrir visitante</Button>}
                  {can.deleteVisitors(active!.role) && <Button size="sm" variant="ghost" aria-label="Excluir formulário" onClick={() => setDel(s)}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </li>))}
          </ul>
          <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{total} formulário(s)</span>
            <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button><Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(p => p + 1)}>Próxima</Button></div></div>
        </>)}
      <AlertDialog open={!!del} onOpenChange={o => !o && setDel(null)}>
        <AlertDialogContent className="gc-theme bg-card text-foreground">
          <AlertDialogHeader><AlertDialogTitle>Excluir formulário?</AlertDialogTitle><AlertDialogDescription>O registro será apagado definitivamente.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => del && void remove(del)}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
