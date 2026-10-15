import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { db, friendlyError } from '../lib/db'
import { useTenant } from '../lib/tenant'
import { brandFromGroup } from '../lib/brand'
import { buildDesign, createProject, type TemplateSource } from '../lib/projects'
import { FORMATS, FORMAT_SPECS, type PostFormat } from '../studio/model'
import { BUILTIN_TEMPLATES, applyEventData, type EventArt } from '../studio/templates'

interface GroupTpl { id: string; name: string; format: PostFormat; design: unknown }

export function NewProjectDialog({ open, onOpenChange, initial, photoMediaId, event }: {
  open: boolean; onOpenChange: (o: boolean) => void; initial?: string   // "blank" | "b:<key>" | "g:<id>"
  photoMediaId?: string; event?: EventArt
}) {
  const { active } = useTenant()
  const navigate = useNavigate()
  const [tpls, setTpls] = useState<GroupTpl[]>([])
  const [choice, setChoice] = useState(initial ?? 'b:invite')
  const [format, setFormat] = useState<PostFormat>('feed_vertical')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !active) return
    setChoice(initial ?? 'b:invite')
    void db.from('templates').select('id, name, format, design').eq('group_id', active.group.id).order('name').then(({ data }) => setTpls((data ?? []) as GroupTpl[]))
  }, [open, initial, active])
  useEffect(() => {
    if (choice.startsWith('b:')) { const t = BUILTIN_TEMPLATES.find(x => x.key === choice.slice(2)); if (t) { setFormat(t.defaultFormat); setTitle(t.name) } }
    else if (choice.startsWith('g:')) { const t = tpls.find(x => x.id === choice.slice(2)); if (t) { setFormat(t.format); setTitle(t.name) } }
    else setTitle('Novo projeto')
    if (event && choice === 'b:event') setTitle(`Convite — ${event.name}`.slice(0, 160))
  }, [choice, tpls, event])
  if (!active) return null

  async function create() {
    if (!title.trim()) { toast.error('Informe um título.'); return }
    setBusy(true)
    try {
      const src: TemplateSource = choice.startsWith('b:') ? { kind: 'builtin', key: choice.slice(2) }
        : choice.startsWith('g:') ? { kind: 'group', design: tpls.find(t => t.id === choice.slice(2))?.design, format }
        : { kind: 'blank' }
      let design = buildDesign(src, format, brandFromGroup(active!.group), photoMediaId)
      if (event) design = applyEventData(design, event)
      const id = await createProject(active!.group.id, title.trim(), design)
      onOpenChange(false); navigate(`/app/estudio/${id}`)
    } catch (e) { toast.error(friendlyError(e)) }
    setBusy(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gc-theme bg-card text-foreground">
        <DialogHeader><DialogTitle>Novo projeto de arte</DialogTitle><DialogDescription>{photoMediaId ? 'A foto escolhida será encaixada no espaço de foto do template.' : 'Escolha um ponto de partida e o formato.'}</DialogDescription></DialogHeader>
        <div className="space-y-1"><Label>Template</Label>
          <Select value={choice} onValueChange={setChoice}><SelectTrigger aria-label="Template"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="blank">Em branco</SelectItem>
              {BUILTIN_TEMPLATES.map(t => <SelectItem key={t.key} value={`b:${t.key}`}>{t.name}</SelectItem>)}
              {tpls.map(t => <SelectItem key={t.id} value={`g:${t.id}`}>{t.name} (do GC)</SelectItem>)}
            </SelectContent></Select></div>
        <fieldset className="space-y-1"><legend className="text-sm font-medium">Formato</legend>
          <div className="grid grid-cols-2 gap-2">
            {FORMATS.map(f => (
              <label key={f} className={`flex cursor-pointer flex-col rounded-lg border-2 p-2 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${format === f ? 'border-primary bg-accent' : 'border-border'}`}>
                <input type="radio" name="format" className="sr-only" checked={format === f} onChange={() => setFormat(f)} />
                <span className="font-medium">{FORMAT_SPECS[f].label}</span><span className="text-xs text-[#4a4842]">{FORMAT_SPECS[f].hint}</span></label>))}
          </div></fieldset>
        <div className="space-y-1"><Label htmlFor="np-title">Título do projeto</Label><Input id="np-title" value={title} maxLength={160} onChange={e => setTitle(e.target.value)} /></div>
        <DialogFooter><Button disabled={busy} onClick={() => void create()}>{busy ? 'Criando…' : 'Criar e abrir'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
