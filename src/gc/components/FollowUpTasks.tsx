import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CheckSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { db, friendlyError } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useTenant } from '../lib/tenant'
import { formatDateTime } from '../lib/format'
import { isOverdue } from '../lib/visitors'
import { CompleteTaskDialog, type Person, type Task } from './VisitorSheet'
import { EmptyState, ErrorState, LoadingState } from './ui-kit'

const PAGE = 20
type Filter = 'open' | 'overdue' | 'done' | 'all'

export function FollowUpTasks({ people, onOpenVisitor }: { people: Person[]; onOpenVisitor: (id: string) => void }) {
  const { active } = useTenant()
  const { user } = useAuth()
  const g = active!.group
  const [filter, setFilter] = useState<Filter>('open')
  const [mine, setMine] = useState(false)
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<Task[] | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [completing, setCompleting] = useState<Task | null>(null)

  const load = useCallback(async () => {
    setError(null)
    let q = db.from('follow_up_tasks').select('id, visitor_id, title, due_at, assignee_id, completed_at, result, next_step, created_at', { count: 'exact' }).eq('group_id', g.id)
      .order('due_at', { ascending: true, nullsFirst: false }).range(page * PAGE, page * PAGE + PAGE - 1)
    if (filter === 'open') q = q.is('completed_at', null)
    if (filter === 'overdue') q = q.is('completed_at', null).lt('due_at', new Date().toISOString())
    if (filter === 'done') q = q.not('completed_at', 'is', null)
    if (mine && user) q = q.eq('assignee_id', user.id)
    const { data, error, count } = await q
    if (error) { setError(friendlyError(error)); return }
    const list = (data ?? []) as Task[]
    setRows(list); setTotal(count ?? 0)
    const ids = [...new Set(list.map(t => t.visitor_id))]
    if (ids.length) { const v = await db.from('visitors').select('id, name').in('id', ids); setNames(Object.fromEntries(((v.data ?? []) as { id: string; name: string | null }[]).map(x => [x.id, x.name ?? 'Anonimizado']))) }
  }, [g.id, filter, mine, page, user])
  useEffect(() => { void load() }, [load])
  useEffect(() => setPage(0), [filter, mine])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filter} onValueChange={v => setFilter(v as Filter)}><SelectTrigger className="w-48" aria-label="Filtrar tarefas"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="open">Pendentes</SelectItem><SelectItem value="overdue">Atrasadas</SelectItem><SelectItem value="done">Concluídas</SelectItem><SelectItem value="all">Todas</SelectItem></SelectContent></Select>
        <label className="flex items-center gap-2 text-sm"><Switch checked={mine} onCheckedChange={setMine} aria-label="Somente minhas tarefas" /> Somente minhas</label>
      </div>
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : rows === null ? <LoadingState /> : rows.length === 0 ? (
        <EmptyState icon={CheckSquare} title="Nenhuma tarefa aqui" description="Crie tarefas de acompanhamento a partir da ficha de cada visitante." />
      ) : (
        <>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {rows.map(t => (
              <li key={t.id} className="flex items-start gap-3 p-3 text-sm">
                <Checkbox checked={!!t.completed_at} aria-label={t.completed_at ? `Reabrir ${t.title}` : `Concluir ${t.title}`}
                  onCheckedChange={async c => { if (c) setCompleting(t); else { const { error } = await db.from('follow_up_tasks').update({ completed_at: null }).eq('id', t.id); if (error) toast.error(friendlyError(error)); else void load() } }} />
                <div className="min-w-0 flex-1">
                  <p className={t.completed_at ? 'text-muted-foreground line-through' : 'font-medium'}>{t.title}</p>
                  <p className="text-xs text-muted-foreground">{t.due_at ? formatDateTime(t.due_at, g.timezone) : 'Sem prazo'} · {people.find(p => p.user_id === t.assignee_id)?.display_name ?? 'Sem responsável'}</p>
                  {t.completed_at && (t.result || t.next_step) && <p className="mt-1 text-xs">{t.result ? `Resultado: ${t.result}. ` : ''}{t.next_step ? `Próximo passo: ${t.next_step}` : ''}</p>}
                </div>
                {isOverdue(t) && <Badge variant="destructive">Atrasada</Badge>}
                <Button size="sm" variant="outline" onClick={() => onOpenVisitor(t.visitor_id)}>{names[t.visitor_id] ?? 'Visitante'}</Button>
              </li>))}
          </ul>
          <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{total} tarefa(s)</span>
            <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button><Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(p => p + 1)}>Próxima</Button></div></div>
        </>)}
      <CompleteTaskDialog task={completing} onClose={() => setCompleting(null)} onDone={() => { setCompleting(null); void load() }} />
    </div>
  )
}
