import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Copy, ImagePlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FONT_FAMILIES, type Element, type ImageElement, type Page, type ShapeElement, type TextElement } from '../studio/model'

type Patch = Partial<Element>
interface Props {
  element: Element | null; page: Page; readOnly: boolean
  onChange: (p: Patch, key?: string) => void
  onPage: (p: Partial<Page>, key?: string) => void
  onOrder: (d: 1 | -1 | 'front' | 'back') => void
  onDuplicate: () => void; onDelete: () => void; onPickPhoto: () => void; onUseLogo: () => void; hasLogo: boolean
}

function Num({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className="space-y-1 text-xs font-medium">{label}
      <Input type="number" inputMode="decimal" className="h-8" value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0} min={min} max={max} step={step}
        onChange={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))) }} /></label>)
}
function Color({ label, value, onChange, allowNone }: { label: string; value: string | null; onChange: (v: string | null) => void; allowNone?: boolean }) {
  return (
    <div className="space-y-1 text-xs font-medium"><span>{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={label} className="h-8 w-12 cursor-pointer rounded border border-border bg-background p-0.5" value={(value ?? '#000000').slice(0, 7)} onChange={e => onChange(e.target.value.toUpperCase())} />
        {allowNone && <label className="flex items-center gap-1 font-normal"><Switch checked={value !== null} onCheckedChange={c => onChange(c ? '#E3AE00' : null)} aria-label={`Usar ${label}`} /> usar</label>}
      </div></div>)
}

export function Inspector({ element: el, page, readOnly, onChange, onPage, onOrder, onDuplicate, onDelete, onPickPhoto, onUseLogo, hasLogo }: Props) {
  const ch = (p: Patch, k?: string) => onChange(p, k)
  return (
    <fieldset disabled={readOnly} className="space-y-5 text-sm">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Página</h3>
        <Color label="Cor de fundo" value={page.background} onChange={v => v && onPage({ background: v }, 'bg')} />
      </section>
      {!el ? <p className="text-xs text-muted-foreground">Selecione um elemento na arte para editar texto, fonte, cor, posição e tamanho.</p> : (
        <>
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ordem e ações</h3>
            <div className="flex flex-wrap gap-1">
              <Button type="button" size="icon" variant="outline" aria-label="Trazer para frente" onClick={() => onOrder('front')}><ChevronsUp className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant="outline" aria-label="Avançar uma camada" onClick={() => onOrder(1)}><ArrowUp className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant="outline" aria-label="Recuar uma camada" onClick={() => onOrder(-1)}><ArrowDown className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant="outline" aria-label="Enviar para trás" onClick={() => onOrder('back')}><ChevronsDown className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant="outline" aria-label="Duplicar elemento" onClick={onDuplicate}><Copy className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant="outline" aria-label="Excluir elemento" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </section>
          <section className="grid grid-cols-2 gap-2">
            <Num label="X" value={el.x} onChange={v => ch({ x: v }, `x${el.id}`)} />
            <Num label="Y" value={el.y} onChange={v => ch({ y: v }, `y${el.id}`)} />
            <Num label="Largura" value={el.w} min={1} onChange={v => ch({ w: v }, `w${el.id}`)} />
            <Num label="Altura" value={el.h} min={1} onChange={v => ch({ h: v }, `h${el.id}`)} />
            <Num label="Rotação (°)" value={el.rotation} min={-360} max={360} onChange={v => ch({ rotation: v }, `r${el.id}`)} />
            <Num label="Opacidade (%)" value={el.opacity * 100} min={0} max={100} onChange={v => ch({ opacity: v / 100 }, `o${el.id}`)} />
          </section>
          {el.type === 'text' && <TextPanel el={el} ch={ch} />}
          {el.type === 'image' && <ImagePanel el={el} ch={ch} onPickPhoto={onPickPhoto} onUseLogo={onUseLogo} hasLogo={hasLogo} />}
          {el.type === 'shape' && <ShapePanel el={el} ch={ch} />}
        </>)}
    </fieldset>
  )
}

function TextPanel({ el, ch }: { el: TextElement; ch: (p: Patch, k?: string) => void }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Texto</h3>
      <div className="space-y-1"><Label htmlFor="ins-text" className="text-xs">Conteúdo</Label>
        <Textarea id="ins-text" rows={4} maxLength={2000} value={el.content} onChange={e => ch({ content: e.target.value }, `t${el.id}`)} /></div>
      <div className="space-y-1"><Label className="text-xs">Fonte</Label>
        <Select value={el.fontFamily} onValueChange={v => ch({ fontFamily: v as TextElement['fontFamily'] })}>
          <SelectTrigger aria-label="Fonte"><SelectValue /></SelectTrigger>
          <SelectContent>{FONT_FAMILIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid grid-cols-2 gap-2">
        <Num label="Tamanho" value={el.fontSize} min={8} max={600} onChange={v => ch({ fontSize: v }, `fs${el.id}`)} />
        <div className="space-y-1"><Label className="text-xs">Peso</Label>
          <Select value={String(el.fontWeight)} onValueChange={v => ch({ fontWeight: Number(v) as TextElement['fontWeight'] })}>
            <SelectTrigger aria-label="Peso da fonte"><SelectValue /></SelectTrigger>
            <SelectContent>{[400, 500, 600, 700, 800].map(w => <SelectItem key={w} value={String(w)}>{w}</SelectItem>)}</SelectContent></Select></div>
        <Num label="Entrelinha" value={el.lineHeight} min={0.8} max={3} step={0.05} onChange={v => ch({ lineHeight: v }, `lh${el.id}`)} />
        <Num label="Espaço entre letras" value={el.letterSpacing} min={-10} max={50} onChange={v => ch({ letterSpacing: v }, `ls${el.id}`)} />
      </div>
      <Color label="Cor do texto" value={el.color} onChange={v => v && ch({ color: v }, `c${el.id}`)} />
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1"><Label className="text-xs">Alinhamento</Label>
          <Select value={el.align} onValueChange={v => ch({ align: v as TextElement['align'] })}>
            <SelectTrigger aria-label="Alinhamento"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="left">Esquerda</SelectItem><SelectItem value="center">Centro</SelectItem><SelectItem value="right">Direita</SelectItem></SelectContent></Select></div>
        <div className="space-y-1"><Label className="text-xs">Vertical</Label>
          <Select value={el.valign} onValueChange={v => ch({ valign: v as TextElement['valign'] })}>
            <SelectTrigger aria-label="Alinhamento vertical"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="top">Topo</SelectItem><SelectItem value="middle">Meio</SelectItem><SelectItem value="bottom">Base</SelectItem></SelectContent></Select></div>
      </div>
      <div className="flex gap-4 text-xs">
        <label className="flex items-center gap-2"><Switch checked={el.italic} onCheckedChange={c => ch({ italic: c })} aria-label="Itálico" /> Itálico</label>
        <label className="flex items-center gap-2"><Switch checked={el.uppercase} onCheckedChange={c => ch({ uppercase: c })} aria-label="Maiúsculas" /> Maiúsculas</label>
      </div>
    </section>)
}

function ImagePanel({ el, ch, onPickPhoto, onUseLogo, hasLogo }: { el: ImageElement; ch: (p: Patch, k?: string) => void; onPickPhoto: () => void; onUseLogo: () => void; hasLogo: boolean }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Imagem</h3>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onPickPhoto}><ImagePlus className="mr-1 h-4 w-4" /> {el.src.kind === 'media' ? 'Trocar foto' : 'Escolher foto'}</Button>
        <Button type="button" size="sm" variant="outline" disabled={!hasLogo} title={hasLogo ? undefined : 'Envie a logo em Configurações'} onClick={onUseLogo}>Usar logo do GC</Button>
      </div>
      <div className="space-y-1"><Label className="text-xs">Enquadramento</Label>
        <Select value={el.fit} onValueChange={v => ch({ fit: v as ImageElement['fit'] })}>
          <SelectTrigger aria-label="Enquadramento"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="cover">Preencher (recorta)</SelectItem><SelectItem value="contain">Conter (sem cortar)</SelectItem></SelectContent></Select></div>
      {el.fit === 'cover' && <>
        <div className="space-y-1"><Label className="text-xs">Zoom ({el.zoom.toFixed(2)}×)</Label>
          <Slider min={1} max={5} step={0.05} value={[el.zoom]} onValueChange={([v]) => ch({ zoom: v }, `z${el.id}`)} aria-label="Zoom" /></div>
        <div className="space-y-1"><Label className="text-xs">Posição horizontal</Label>
          <Slider min={0} max={1} step={0.01} value={[el.focalX]} onValueChange={([v]) => ch({ focalX: v }, `fx${el.id}`)} aria-label="Posição horizontal da foto" /></div>
        <div className="space-y-1"><Label className="text-xs">Posição vertical</Label>
          <Slider min={0} max={1} step={0.01} value={[el.focalY]} onValueChange={([v]) => ch({ focalY: v }, `fy${el.id}`)} aria-label="Posição vertical da foto" /></div></>}
      <Num label="Arredondamento" value={el.radius} min={0} max={10000} onChange={v => ch({ radius: v }, `rad${el.id}`)} />
    </section>)
}

function ShapePanel({ el, ch }: { el: ShapeElement; ch: (p: Patch, k?: string) => void }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Forma</h3>
      {el.shape !== 'frame' && el.shape !== 'line' && <Color label="Preenchimento" value={el.fill} allowNone onChange={v => ch({ fill: v }, `f${el.id}`)} />}
      <Color label="Contorno" value={el.stroke} allowNone onChange={v => ch({ stroke: v }, `s${el.id}`)} />
      <div className="grid grid-cols-2 gap-2">
        <Num label="Espessura" value={el.strokeWidth} min={0} max={200} onChange={v => ch({ strokeWidth: v }, `sw${el.id}`)} />
        {(el.shape === 'rect' || el.shape === 'frame') && <Num label="Arredondamento" value={el.radius} min={0} max={10000} onChange={v => ch({ radius: v }, `rd${el.id}`)} />}
      </div>
    </section>)
}
