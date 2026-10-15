import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Copy, PenSquare, Plus, Search, Sparkles, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { db, friendlyError } from '../lib/db'
import { useTenant } from '../lib/tenant'
import { can } from '../lib/roles'
import { formatDateTime } from '../lib/format'
import { cloneDesign, createProject } from '../lib/projects'
import { FORMATS, FORMAT_SPECS, parseDesign, type Design, type PostFormat } from '../studio/model'
import { DesignThumb } from '../components/DesignThumb'
import { NewProjectDialog } from '../components/NewProjectDialog'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui-kit'

interface Row { id: string; title: string; format: PostFormat; status: string; design: unknown; updated_at: string }
const PAGE = 12
export const STATUS_LABEL: Record<string, string> = { idea: 'Ideia', draft: 'Rascunho', in_review: 'Em revisão', approved: 'Aprovado', scheduled: 'Agendado', published: 'Publicado', cancelled: 'Cancelado' }

export default function Studio() {
  const { active } = useTenant()
  const g = active!.group
  const canEdit = can.manageGroup(active!.role) || active!.role === 'communicator'
  const [rows, setRows] = useState<Row[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [q, setQ] = useState('')
  const [format, setFormat] = useState<'all' | PostFormat>('all')
  const [error, setError] = useState<string | null>(null)
  const [dlg, setDlg] = useState(false)
  const [del, setDel] = useState<Row | null>(null)

  const load = useCallback(async () => {
    setError(null)
    let query = db.from('posts').select('id, title, format, status, design, updated_at', { count: 'exact' }).eq('group_id', g.id).not('design', 'is', null)
      .order('updated_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)
    if (q.trim()) query = query.ilike('title', `%${q.trim().replace(/[%_]/g, '')}%`)
    if (format !== 'all') query = query.eq('format', format)
    const { data, error, count } = await query
    if (error) { setError(friendlyError(error)); return }
    setRows((data ?? []) as Row[]); setTotal(count ?? 0)
  }, [g.id, page, q, format])
  useEffect(() => { const h = setTimeout(() => void load(), 250); return () => clearTimeout(h) }, [load])
  useEffect(() => { setPage(0) }, [q, format, g.id])

  async function duplicate(r: Row) {
    const p = parseDesign(r.design)
    if ('error' in p) { toast.error('Projeto corrompido; não foi possível duplicar.'); return }
    try { await createProject(g.id, `${r.title} (cópia)`.slice(0, 160), cloneDesign(p.design)); toast.success('Projeto duplicado'); void load() } catch (e) { toast.error(friendlyError(e)) }
  }
  async function remove(r: Row) {
    const { error } = await db.from('posts').delete().eq('id', r.id)
    setDel(null)
    if (error) toast.error(friendlyError(error)); else { toast.success('Projeto excluído'); void load() }
  }

  return (
    <>
      <PageHeader title="Estúdio de conteúdo" description="Crie artes para feed, Stories e carrosséis. Os projetos ficam salvos como elementos editáveis."
        actions={canEdit ? <><Button variant="outline" asChild><Link to="/app/assistente"><Sparkles className="mr-2 h-4 w-4" /> Assistente de IA</Link></Button><Button onClick={() => setDlg(true)}><Plus className="mr-2 h-4 w-4" /> Novo projeto</Button></> : undefined} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[12rem] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input className="pl-9" placeholder="Buscar projeto" aria-label="Buscar projeto" value={q} onChange={e => setQ(e.target.value)} /></div>
        <Select value={format} onValueChange={v => setFormat(v as 'all' | PostFormat)}><SelectTrigger className="w-48" aria-label="Filtrar por formato"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos os formatos</SelectItem>{FORMATS.map(f => <SelectItem key={f} value={f}>{FORMAT_SPECS[f].label}</SelectItem>)}</SelectContent></Select>
      </div>
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : rows === null ? <LoadingState /> : rows.length === 0 ? (
        <EmptyState icon={PenSquare} title={q || format !== 'all' ? 'Nenhum projeto encontrado' : 'Nenhum projeto ainda'}
          description={q || format !== 'all' ? 'Ajuste a busca ou os filtros.' : 'Comece por um template pronto ou por uma tela em branco.'}
          action={canEdit && !q && format === 'all' ? <Button onClick={() => setDlg(true)}>Criar primeiro projeto</Button> : undefined} />
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {rows.map(r => {
              const p = parseDesign(r.design)
              return (
                <li key={r.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
                  <Link to={`/app/estudio/${r.id}`} className="flex h-48 items-center justify-center bg-secondary p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Abrir ${r.title}`}>
                    {'error' in p ? <span className="text-xs text-destructive">Projeto corrompido</span> : <DesignThumb design={p.design as Design} width={p.design.height > p.design.width ? 110 : 150} className="shadow" />}
                  </Link>
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <Link to={`/app/estudio/${r.id}`} className="truncate text-sm font-medium hover:underline">{r.title}</Link>
                    <div className="flex flex-wrap items-center gap-1"><Badge variant="secondary">{FORMAT_SPECS[r.format]?.label}</Badge><Badge variant="outline">{STATUS_LABEL[r.status] ?? r.status}</Badge></div>
                    <span className="text-xs text-muted-foreground">Editado em {formatDateTime(r.updated_at, g.timezone)}</span>
                    {canEdit && <div className="mt-auto flex gap-1 pt-2">
                      <Button size="sm" variant="outline" aria-label={`Duplicar ${r.title}`} onClick={() => void duplicate(r)}><Copy className="h-4 w-4" /></Button>
                      <Button size="sm" variant="outline" aria-label={`Excluir ${r.title}`} onClick={() => setDel(r)}><Trash2 className="h-4 w-4" /></Button></div>}
                  </div>
                </li>)
            })}
          </ul>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{total} projeto(s)</span>
            <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(p => p + 1)}>Próxima</Button></div>
          </div>
        </>)}
      <NewProjectDialog open={dlg} onOpenChange={setDlg} />
      <AlertDialog open={!!del} onOpenChange={o => !o && setDel(null)}>
        <AlertDialogContent className="gc-theme bg-card text-foreground">
          <AlertDialogHeader><AlertDialogTitle>Excluir projeto?</AlertDialogTitle><AlertDialogDescription>“{del?.title}” e suas versões serão removidos. Artes já exportadas para a galeria não são apagadas.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => del && void remove(del)}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
