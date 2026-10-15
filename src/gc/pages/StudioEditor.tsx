import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, ChevronLeft, ChevronRight, Copy, Download, Image as ImageIcon, LayoutTemplate, Plus, Redo2, Save, Shapes, Trash2, Type, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { db, friendlyError } from '../lib/db'
import { useTenant } from '../lib/tenant'
import { can } from '../lib/roles'
import { uploadMedia, type MediaRow } from '../lib/media'
import {
  FORMATS, FORMAT_SPECS, addElement, addPage, designSchema, duplicateElement, duplicatePage, emptyDesign, getPage, movePage, newImage, newShape, newText,
  parseDesign, patchElement, removeElement, removePage, reorderElement, resizeDesign, updatePage, type Design, type Element, type Page, type PostFormat,
} from '../studio/model'
import { useEditor } from '../studio/useEditor'
import { ensureFonts, loadDesignAssets } from '../studio/assets'
import type { AssetMap } from '../studio/render'
import { EXPORT_WIDTHS, downloadBlob, exportDimensions, pageFileName, renderPageBlob, renderZip, safeFileName, type ExportType } from '../studio/export'
import { CATEGORY_LABEL, type TemplateCategory } from '../studio/templates'
import { Stage } from '../components/Stage'
import { Inspector } from '../components/Inspector'
import { DesignThumb } from '../components/DesignThumb'
import { MediaPicker } from '../components/MediaPicker'
import { ErrorState, LoadingState } from '../components/ui-kit'

interface PostRow { id: string; title: string; format: PostFormat; design: unknown; status: string; group_id: string }

export default function StudioEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { active } = useTenant()
  const group = active!.group
  const canEdit = can.manageGroup(active!.role) || active!.role === 'communicator'
  const ed = useEditor(emptyDesign('feed_vertical'))
  const { design, page: pageIdx, selected, dirty } = ed.state
  const [post, setPost] = useState<PostRow | null>(null)
  const [title, setTitle] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [assets, setAssets] = useState<AssetMap>(new Map())
  const [saving, setSaving] = useState(false)
  const [picker, setPicker] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [warn, setWarn] = useState<string | null>(null)
  const page = getPage(design, pageIdx)
  const element = page.elements.find(e => e.id === selected) ?? null

  // ---- carregar projeto ----
  useEffect(() => {
    let off = false
    void (async () => {
      const { data, error } = await db.from('posts').select('id, title, format, design, status, group_id').eq('id', id).maybeSingle()
      if (off) return
      if (error || !data) { setLoadError(error ? friendlyError(error) : 'Projeto não encontrado neste GC.'); return }
      const row = data as PostRow
      let d: Design
      if (row.design == null) d = emptyDesign(row.format)
      else {
        const r = parseDesign(row.design)
        if ('error' in r) { setLoadError(`Este projeto está corrompido e não pôde ser aberto (${r.error}).`); return }
        d = r.design
      }
      setPost(row); setTitle(row.title); ed.load(d)
    })()
    return () => { off = true }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- fontes e imagens ----
  const mediaSig = useMemo(() => JSON.stringify(design.pages.flatMap(p => p.elements.filter(e => e.type === 'image').map(e => (e as { src: unknown }).src))), [design.pages])
  useEffect(() => {
    if (!post) return
    let off = false
    void (async () => {
      await ensureFonts()
      try {
        const { assets: a, failed } = await loadDesignAssets(design, group.logo_path, assets)
        if (off) return
        setAssets(a); setWarn(failed.length ? `${failed.length} imagem(ns) não puderam ser carregadas e aparecerão como espaço reservado.` : null)
      } catch (e) { if (!off) setWarn(friendlyError(e)) }
    })()
    return () => { off = true }
  }, [post, mediaSig, group.logo_path]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  // ---- ações sobre o projeto ----
  const commit = useCallback((d: Design, key?: string) => ed.commit(d, key), [ed])
  const patchEl = (p: Partial<Element>, key?: string) => element && commit(patchElement(design, pageIdx, element.id, p), key)
  const patchPage = (p: Partial<Page>, key?: string) => commit(updatePage(design, pageIdx, pg => ({ ...pg, ...p })), key)
  const addAndSelect = (el: Element) => { commit(addElement(design, pageIdx, el)); ed.select(el.id) }

  async function save() {
    if (!post || !canEdit) return
    const parsed = designSchema.safeParse(design)
    if (!parsed.success) { toast.error(`Projeto inválido: ${parsed.error.issues[0]?.message}`); return }
    if (title.trim().length < 1) { toast.error('Informe um título.'); return }
    setSaving(true)
    const patch: Record<string, unknown> = { title: title.trim(), format: design.format, design: parsed.data }
    if (post.status === 'idea') patch.status = 'draft'
    const { error } = await db.from('posts').update(patch).eq('id', post.id)
    setSaving(false)
    if (error) { toast.error(friendlyError(error)); return }
    ed.markSaved(); setPost({ ...post, title: title.trim(), format: design.format, status: patch.status as string ?? post.status }); toast.success('Rascunho salvo')
  }

  function onKey(e: React.KeyboardEvent) {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) ed.redo(); else ed.undo(); return }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); ed.redo(); return }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); return }
    if (!element || !canEdit) return
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); const r = duplicateElement(design, pageIdx, element.id); commit(r.design); ed.select(r.newId); return }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); commit(removeElement(design, pageIdx, element.id)); ed.select(null); return }
    if (e.key === 'Escape') { ed.select(null); return }
    const step = e.shiftKey ? 10 : 1
    const mv: Record<string, Partial<Element>> = { ArrowLeft: { x: element.x - step }, ArrowRight: { x: element.x + step }, ArrowUp: { y: element.y - step }, ArrowDown: { y: element.y + step } }
    if (mv[e.key]) { e.preventDefault(); patchEl(mv[e.key], `nudge${element.id}`) }
  }

  const photoTarget = (m: MediaRow) => {
    const src = { kind: 'media' as const, mediaId: m.id }
    if (element?.type === 'image') patchEl({ src } as Partial<Element>)
    else addAndSelect(newImage(design, src, { w: design.width * 0.6, h: design.width * 0.6 }))
  }
  const applyLogo = () => {
    if (!group.logo_path) { toast.error('Envie a logo do GC em Configurações.'); return }
    if (element?.type === 'image') patchEl({ src: { kind: 'logo' }, fit: 'contain' } as Partial<Element>)
    else addAndSelect(newImage(design, { kind: 'logo' }, { w: design.width * 0.25, h: design.width * 0.15, fit: 'contain' }))
  }

  if (loadError) return <div className="p-4"><Link to="/app/estudio" className="mb-4 inline-flex items-center gap-1 text-sm underline"><ArrowLeft className="h-4 w-4" /> Voltar</Link><ErrorState message={loadError} /></div>
  if (!post) return <LoadingState label="Abrindo projeto…" />

  return (
    <div className="-mx-4 -my-6 sm:-mx-6">
      <h1 className="sr-only">Editor de arte: {title}</h1>
      {/* barra superior */}
      <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2">
        <Button variant="ghost" size="icon" aria-label="Voltar ao estúdio" onClick={() => { if (!dirty || window.confirm('Há alterações não salvas. Sair mesmo assim?')) navigate('/app/estudio') }}><ArrowLeft className="h-4 w-4" /></Button>
        <Input aria-label="Título do projeto" className="h-9 w-48 flex-1 sm:flex-none sm:w-64" value={title} maxLength={160} disabled={!canEdit} onChange={e => { setTitle(e.target.value); ed.commit(design, 'title') }} />
        <Select value={design.format} disabled={!canEdit} onValueChange={v => commit(resizeDesign(design, v as PostFormat))}>
          <SelectTrigger className="h-9 w-40" aria-label="Formato"><SelectValue /></SelectTrigger>
          <SelectContent>{FORMATS.map(f => <SelectItem key={f} value={f}>{FORMAT_SPECS[f].label} · {FORMAT_SPECS[f].hint}</SelectItem>)}</SelectContent></Select>
        <Button variant="outline" size="icon" aria-label="Desfazer" disabled={!ed.canUndo || !canEdit} onClick={ed.undo}><Undo2 className="h-4 w-4" /></Button>
        <Button variant="outline" size="icon" aria-label="Refazer" disabled={!ed.canRedo || !canEdit} onClick={ed.redo}><Redo2 className="h-4 w-4" /></Button>
        <span className="text-xs text-muted-foreground" role="status">{dirty ? 'Alterações não salvas' : 'Salvo'}</span>
        <div className="ml-auto flex gap-2">
          {canEdit && <Button variant="outline" onClick={() => setTemplateOpen(true)}><LayoutTemplate className="mr-1 h-4 w-4" /> <span className="hidden sm:inline">Salvar como template</span></Button>}
          <Button variant="outline" onClick={() => setExportOpen(true)}><Download className="mr-1 h-4 w-4" /> Exportar</Button>
          {canEdit && <Button disabled={saving || !dirty} onClick={() => void save()}><Save className="mr-1 h-4 w-4" /> {saving ? 'Salvando…' : 'Salvar rascunho'}</Button>}
        </div>
      </div>
      {!canEdit && <p role="status" className="bg-secondary px-4 py-2 text-sm">Modo consulta: seu perfil não permite editar este projeto.</p>}
      {warn && <p role="alert" className="bg-accent px-4 py-2 text-sm">{warn}</p>}

      <div className="grid gap-4 p-4 lg:grid-cols-[9rem_minmax(0,1fr)_20rem]">
        {/* páginas */}
        <div className="order-2 lg:order-1">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Páginas</h2>
          <ol className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
            {design.pages.map((p, i) => (
              <li key={p.id} className="shrink-0">
                <button type="button" onClick={() => ed.goPage(i)} aria-label={`Página ${i + 1}${p.name ? `: ${p.name}` : ''}`} aria-current={i === pageIdx}
                  className={`block rounded-md border-2 p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${i === pageIdx ? 'border-primary' : 'border-transparent'}`}>
                  <DesignThumb design={design} pageIndex={i} assets={assets} width={112} /></button>
                <span className="block text-center text-[11px] text-muted-foreground">{p.name ?? `Página ${i + 1}`}</span>
              </li>))}
          </ol>
          {canEdit && (
            <div className="mt-1 flex flex-wrap gap-1">
              <Button size="icon" variant="outline" aria-label="Nova página" onClick={() => { commit(addPage(design)); ed.goPage(design.pages.length) }}><Plus className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" aria-label="Duplicar página" onClick={() => { commit(duplicatePage(design, pageIdx)); ed.goPage(pageIdx + 1) }}><Copy className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" aria-label="Mover página para antes" disabled={pageIdx === 0} onClick={() => { commit(movePage(design, pageIdx, pageIdx - 1)); ed.goPage(pageIdx - 1) }}><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" aria-label="Mover página para depois" disabled={pageIdx === design.pages.length - 1} onClick={() => { commit(movePage(design, pageIdx, pageIdx + 1)); ed.goPage(pageIdx + 1) }}><ChevronRight className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" aria-label="Excluir página" disabled={design.pages.length <= 1}
                onClick={() => { if (window.confirm('Excluir esta página?')) { commit(removePage(design, pageIdx)); ed.goPage(Math.max(0, pageIdx - 1)) } }}><Trash2 className="h-4 w-4" /></Button>
            </div>)}
        </div>

        {/* palco */}
        <div className="order-1 min-w-0 space-y-3 lg:order-2">
          {canEdit && (
            <div className="flex flex-wrap items-center justify-center gap-2" role="toolbar" aria-label="Adicionar elementos">
              <Button size="sm" variant="outline" onClick={() => addAndSelect(newText(design))}><Type className="mr-1 h-4 w-4" /> Texto</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button size="sm" variant="outline"><Shapes className="mr-1 h-4 w-4" /> Forma</Button></DropdownMenuTrigger>
                <DropdownMenuContent>
                  {([['rect', 'Retângulo'], ['ellipse', 'Círculo'], ['frame', 'Moldura'], ['line', 'Linha']] as const).map(([k, l]) =>
                    <DropdownMenuItem key={k} onSelect={() => addAndSelect(newShape(design, k))}>{l}</DropdownMenuItem>)}
                </DropdownMenuContent></DropdownMenu>
              <Button size="sm" variant="outline" onClick={() => { ed.select(null); setPicker(true) }}><ImageIcon className="mr-1 h-4 w-4" /> Foto</Button>
              <Button size="sm" variant="outline" disabled={!group.logo_path} title={group.logo_path ? undefined : 'Envie a logo em Configurações'} onClick={() => { ed.select(null); applyLogo() }}>Logo</Button>
            </div>)}
          <Stage design={design} pageIndex={pageIdx} assets={assets} selectedId={selected} readOnly={!canEdit} onSelect={ed.select} onBegin={ed.begin} onLive={ed.live} onKey={onKey} />
          <p className="text-center text-xs text-muted-foreground">{FORMAT_SPECS[design.format].hint} px · Página {pageIdx + 1} de {design.pages.length}</p>
        </div>

        {/* propriedades */}
        <aside className="order-3 rounded-xl border border-border bg-card p-4" aria-label="Propriedades">
          <Inspector element={element} page={page} readOnly={!canEdit} onChange={patchEl} onPage={patchPage}
            onOrder={d => element && commit(reorderElement(design, pageIdx, element.id, d))}
            onDuplicate={() => { if (!element) return; const r = duplicateElement(design, pageIdx, element.id); commit(r.design); ed.select(r.newId) }}
            onDelete={() => { if (!element) return; commit(removeElement(design, pageIdx, element.id)); ed.select(null) }}
            onPickPhoto={() => setPicker(true)} onUseLogo={applyLogo} hasLogo={!!group.logo_path} />
        </aside>
      </div>

      <MediaPicker open={picker} onOpenChange={setPicker} groupId={group.id} canUpload={canEdit} onPick={photoTarget} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} design={design} title={title} assets={assets} groupId={group.id} postId={post.id} canSave={canEdit} />
      <TemplateDialog open={templateOpen} onOpenChange={setTemplateOpen} design={design} groupId={group.id} defaultName={title} />
    </div>
  )
}

function ExportDialog({ open, onOpenChange, design, title, assets, groupId, postId, canSave }: {
  open: boolean; onOpenChange: (o: boolean) => void; design: Design; title: string; assets: AssetMap; groupId: string; postId: string; canSave: boolean
}) {
  const [type, setType] = useState<ExportType>('png')
  const [width, setWidth] = useState<number>(1080)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [toGallery, setToGallery] = useState(false)
  const dim = exportDimensions(design, width)
  const multi = design.pages.length > 1

  async function run(scope: 'page' | 'zip') {
    setBusy('Gerando…'); setProgress(5)
    try {
      await ensureFonts()
      const pageIndex = 0
      if (scope === 'zip') {
        const blob = await renderZip(design, title, assets, type, width)
        downloadBlob(blob, `${safeFileName(title)}.zip`)
      } else {
        const blob = await renderPageBlob(design, pageIndex, assets, type, width)
        downloadBlob(blob, pageFileName(title, 0, 1, type))
      }
      if (toGallery && canSave) {
        const indices = scope === 'zip' ? design.pages.map((_, i) => i) : [0]
        let firstId: string | null = null
        for (let k = 0; k < indices.length; k++) {
          setBusy(`Salvando na galeria (${k + 1}/${indices.length})…`); setProgress(10 + (80 * k) / indices.length)
          const blob = await renderPageBlob(design, indices[k], assets, type, width)
          const row = await uploadMedia(groupId, blob, { kind: 'export', title: indices.length > 1 ? `${title} — página ${k + 1}` : title, album: 'Artes exportadas' }, f => setProgress(10 + (80 * (k + f)) / indices.length))
          firstId ??= row.id
        }
        if (firstId) await db.from('posts').update({ art_media_id: firstId }).eq('id', postId)
        toast.success('Arte salva na galeria')
      } else toast.success('Download iniciado')
      onOpenChange(false)
    } catch (e) { toast.error((e as Error).message || 'Falha ao exportar') }
    setBusy(null); setProgress(0)
  }
  return (
    <Dialog open={open} onOpenChange={o => !busy && onOpenChange(o)}>
      <DialogContent className="gc-theme bg-card text-foreground">
        <DialogHeader><DialogTitle>Exportar arte</DialogTitle><DialogDescription>Exportar não marca o conteúdo como publicado; o registro da publicação é feito no calendário.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1"><Label>Formato do arquivo</Label>
            <Select value={type} onValueChange={v => setType(v as ExportType)}><SelectTrigger aria-label="Formato do arquivo"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="png">PNG (sem perdas)</SelectItem><SelectItem value="jpeg">JPEG (menor)</SelectItem></SelectContent></Select></div>
          <div className="space-y-1"><Label>Resolução</Label>
            <Select value={String(width)} onValueChange={v => setWidth(Number(v))}><SelectTrigger aria-label="Resolução"><SelectValue /></SelectTrigger>
              <SelectContent>{EXPORT_WIDTHS.map(w => <SelectItem key={w} value={String(w)}>{w} px de largura{w === 1080 ? ' (padrão)' : ''}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <p className="text-sm text-muted-foreground">Cada página sairá com {dim.width} × {dim.height} px.</p>
        {canSave && <label className="flex items-center gap-2 text-sm"><Checkbox checked={toGallery} onCheckedChange={c => setToGallery(c === true)} /> Também salvar na galeria do GC</label>}
        {busy && <div role="status" className="space-y-1"><p className="text-sm">{busy}</p><Progress value={progress} /></div>}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" disabled={!!busy} onClick={() => void run('page')}><Download className="mr-1 h-4 w-4" /> {multi ? 'Baixar página 1' : 'Baixar imagem'}</Button>
          {multi && <Button disabled={!!busy} onClick={() => void run('zip')}><Download className="mr-1 h-4 w-4" /> Baixar tudo (ZIP)</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TemplateDialog({ open, onOpenChange, design, groupId, defaultName }: { open: boolean; onOpenChange: (o: boolean) => void; design: Design; groupId: string; defaultName: string }) {
  const [name, setName] = useState(defaultName)
  const [category, setCategory] = useState<TemplateCategory>('other')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setName(defaultName) }, [open, defaultName])
  async function save() {
    if (name.trim().length < 2) { toast.error('Informe um nome para o template.'); return }
    setBusy(true)
    // templates não carregam fotos (apenas a estrutura); a logo continua vinculada ao GC
    const stripped: Design = { ...design, pages: design.pages.map(p => ({ ...p, elements: p.elements.map(e => e.type === 'image' && e.src.kind === 'media' ? { ...e, src: { kind: 'none' as const } } : e) })) }
    const { error } = await db.from('templates').insert({ group_id: groupId, name: name.trim(), category, format: design.format, design: stripped })
    setBusy(false)
    if (error) { toast.error(friendlyError(error)); return }
    toast.success('Template salvo para este GC'); onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gc-theme bg-card text-foreground">
        <DialogHeader><DialogTitle>Salvar como template</DialogTitle><DialogDescription>As fotos não são guardadas no template; apenas a estrutura, textos e estilos.</DialogDescription></DialogHeader>
        <div className="space-y-1"><Label htmlFor="tpl-name">Nome</Label><Input id="tpl-name" value={name} maxLength={120} onChange={e => setName(e.target.value)} /></div>
        <div className="space-y-1"><Label>Categoria</Label>
          <Select value={category} onValueChange={v => setCategory(v as TemplateCategory)}><SelectTrigger aria-label="Categoria"><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(CATEGORY_LABEL) as TemplateCategory[]).map(c => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}</SelectContent></Select></div>
        <DialogFooter><Button disabled={busy} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar template'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
