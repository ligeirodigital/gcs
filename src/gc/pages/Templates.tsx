import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { db, friendlyError } from '../lib/db'
import { useTenant } from '../lib/tenant'
import { can } from '../lib/roles'
import { brandFromGroup } from '../lib/brand'
import { FORMATS, FORMAT_SPECS, parseDesign, type Design, type PostFormat } from '../studio/model'
import { BUILTIN_TEMPLATES, CATEGORY_LABEL, instantiateTemplate, type TemplateCategory } from '../studio/templates'
import { DesignThumb } from '../components/DesignThumb'
import { NewProjectDialog } from '../components/NewProjectDialog'
import { ErrorState, PageHeader } from '../components/ui-kit'

interface GroupTpl { id: string; name: string; category: TemplateCategory; format: PostFormat; design: unknown }

export default function Templates() {
  const { active } = useTenant()
  const g = active!.group
  const canEdit = can.manageGroup(active!.role) || active!.role === 'communicator'
  const [mine, setMine] = useState<GroupTpl[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cat, setCat] = useState<'all' | TemplateCategory>('all')
  const [fmt, setFmt] = useState<'all' | PostFormat>('all')
  const [use, setUse] = useState<string | null>(null)
  const [del, setDel] = useState<GroupTpl | null>(null)
  const brand = useMemo(() => brandFromGroup(g), [g])

  const load = () => db.from('templates').select('id, name, category, format, design').eq('group_id', g.id).order('name')
    .then(({ data, error }) => { if (error) setError(friendlyError(error)); else setMine((data ?? []) as GroupTpl[]) })
  useEffect(() => { void load() }, [g.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const builtin = BUILTIN_TEMPLATES.filter(t => (cat === 'all' || t.category === cat) && (fmt === 'all' || t.defaultFormat === fmt))
  const own = mine.filter(t => (cat === 'all' || t.category === cat) && (fmt === 'all' || t.format === fmt))
  async function remove(t: GroupTpl) {
    const { error } = await db.from('templates').delete().eq('id', t.id)
    setDel(null)
    if (error) toast.error(friendlyError(error)); else { toast.success('Template excluído'); void load() }
  }

  return (
    <>
      <PageHeader title="Templates" description="Modelos prontos usam as cores, a logo e os dados de encontro do seu GC. Você pode personalizar tudo no estúdio e salvar seus próprios templates." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={cat} onValueChange={v => setCat(v as 'all' | TemplateCategory)}><SelectTrigger className="w-52" aria-label="Filtrar por categoria"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todas as categorias</SelectItem>{(Object.keys(CATEGORY_LABEL) as TemplateCategory[]).map(c => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}</SelectContent></Select>
        <Select value={fmt} onValueChange={v => setFmt(v as 'all' | PostFormat)}><SelectTrigger className="w-48" aria-label="Filtrar por formato"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos os formatos</SelectItem>{FORMATS.map(f => <SelectItem key={f} value={f}>{FORMAT_SPECS[f].label}</SelectItem>)}</SelectContent></Select>
      </div>
      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {own.length > 0 && <section className="mb-8"><h2 className="mb-3 font-medium">Do seu GC</h2>
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {own.map(t => { const p = parseDesign(t.design); return (
            <li key={t.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex h-48 items-center justify-center bg-secondary p-2">{'error' in p ? <span className="text-xs text-destructive">Corrompido</span> : <DesignThumb design={p.design as Design} width={p.design.height > p.design.width ? 110 : 150} className="shadow" />}</div>
              <div className="flex flex-1 flex-col gap-1 p-3"><span className="text-sm font-medium">{t.name}</span>
                <div className="flex gap-1"><Badge variant="secondary">{CATEGORY_LABEL[t.category]}</Badge><Badge variant="outline">{FORMAT_SPECS[t.format].label}</Badge></div>
                <div className="mt-auto flex gap-1 pt-2">{canEdit && <><Button size="sm" onClick={() => setUse(`g:${t.id}`)}>Usar</Button>
                  <Button size="sm" variant="outline" aria-label={`Excluir ${t.name}`} onClick={() => setDel(t)}><Trash2 className="h-4 w-4" /></Button></>}</div></div>
            </li>) })}
        </ul></section>}
      <section><h2 className="mb-3 font-medium">Modelos prontos</h2>
        {builtin.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum modelo para esse filtro.</p> :
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {builtin.map(t => (
              <li key={t.key} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex h-48 items-center justify-center bg-secondary p-2">
                  <DesignThumb design={instantiateTemplate(t.key, t.defaultFormat, brand)} width={t.defaultFormat === 'feed_square' ? 150 : 110} className="shadow" /></div>
                <div className="flex flex-1 flex-col gap-1 p-3"><span className="text-sm font-medium">{t.name}</span>
                  <span className="text-xs text-muted-foreground">{t.description}</span>
                  <div className="flex gap-1"><Badge variant="secondary">{CATEGORY_LABEL[t.category]}</Badge><Badge variant="outline">{FORMAT_SPECS[t.defaultFormat].label}</Badge></div>
                  {canEdit && <Button size="sm" className="mt-auto self-start" onClick={() => setUse(`b:${t.key}`)}>Usar este modelo</Button>}</div>
              </li>))}
          </ul>}
      </section>
      <NewProjectDialog open={!!use} onOpenChange={o => !o && setUse(null)} initial={use ?? undefined} />
      <AlertDialog open={!!del} onOpenChange={o => !o && setDel(null)}>
        <AlertDialogContent className="gc-theme bg-card text-foreground">
          <AlertDialogHeader><AlertDialogTitle>Excluir template?</AlertDialogTitle><AlertDialogDescription>“{del?.name}” será removido. Projetos criados a partir dele não são afetados.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => del && void remove(del)}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
