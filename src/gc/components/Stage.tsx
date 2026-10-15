import { useEffect, useRef } from 'react'
import { renderPage, type AssetMap } from '../studio/render'
import { patchElement, type Design, type Element } from '../studio/model'

type Handle = 'nw' | 'ne' | 'sw' | 'se'
interface Drag { id: string; mode: 'move' | Handle; sx: number; sy: number; orig: Element; started: boolean }
const MIN = 24, SNAP = 10

interface Props {
  design: Design; pageIndex: number; assets: AssetMap; selectedId: string | null; readOnly: boolean
  onSelect: (id: string | null) => void; onBegin: () => void; onLive: (d: Design) => void
  onKey: (e: React.KeyboardEvent) => void
}

/** Pré-visualização em canvas (mesmo renderizador da exportação) + camada de seleção/arraste/redimensionamento. */
export function Stage({ design, pageIndex, assets, selectedId, readOnly, onSelect, onBegin, onLive, onKey }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const page = design.pages[pageIndex]

  useEffect(() => {
    const id = requestAnimationFrame(() => { if (canvas.current) renderPage(canvas.current, page, design, assets, 0.6) })
    return () => cancelAnimationFrame(id)
  }, [page, design, assets])

  function start(e: React.PointerEvent, el: Element, mode: Drag['mode']) {
    e.stopPropagation(); onSelect(el.id)
    if (readOnly) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { id: el.id, mode, sx: e.clientX, sy: e.clientY, orig: el, started: false }
  }
  function move(e: React.PointerEvent) {
    const d = drag.current, r = box.current?.getBoundingClientRect()
    if (!d || !r) return
    const k = design.width / r.width
    const dx = (e.clientX - d.sx) * k, dy = (e.clientY - d.sy) * k
    if (!d.started) { if (Math.abs(dx) + Math.abs(dy) < 3) return; d.started = true; onBegin() }
    const o = d.orig
    let patch: Partial<Element>
    if (d.mode === 'move') {
      let x = o.x + dx, y = o.y + dy
      if (Math.abs(x + o.w / 2 - design.width / 2) < SNAP) x = design.width / 2 - o.w / 2
      if (Math.abs(y + o.h / 2 - design.height / 2) < SNAP) y = design.height / 2 - o.h / 2
      patch = { x, y }
    } else {
      let { x, y, w, h } = o
      if (d.mode.includes('e')) w = Math.max(MIN, o.w + dx)
      if (d.mode.includes('w')) { w = Math.max(MIN, o.w - dx); x = o.x + o.w - w }
      if (d.mode.includes('s')) h = Math.max(MIN, o.h + dy)
      if (d.mode.includes('n')) { h = Math.max(MIN, o.h - dy); y = o.y + o.h - h }
      patch = { x, y, w, h }
    }
    onLive(patchElement(design, pageIndex, d.id, patch))
  }
  const end = () => { drag.current = null }

  const handles: [Handle, string][] = [['nw', 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize'], ['ne', 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize'],
    ['sw', 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize'], ['se', 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize']]

  return (
    <div ref={box} className="relative mx-auto w-full max-w-[560px] select-none overflow-visible rounded-md shadow-md ring-1 ring-border" tabIndex={0}
      style={{ aspectRatio: `${design.width} / ${design.height}`, maxHeight: '75vh' }} role="application"
      aria-label={`Área de edição da página ${pageIndex + 1}. Use as setas para mover o elemento selecionado, Delete para remover.`}
      onKeyDown={onKey} onPointerDown={() => onSelect(null)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full rounded-md" aria-hidden />
      {[...page.elements].map(el => {
        const sel = el.id === selectedId
        return (
          <div key={el.id} onPointerDown={e => start(e, el, 'move')}
            className={`absolute ${sel ? 'outline outline-2 outline-[#2563eb]' : 'hover:outline hover:outline-1 hover:outline-[#2563eb]/60'} ${readOnly ? '' : 'cursor-move'}`}
            style={{ left: `${(el.x / design.width) * 100}%`, top: `${(el.y / design.height) * 100}%`, width: `${(el.w / design.width) * 100}%`,
              height: `${(el.h / design.height) * 100}%`, transform: `rotate(${el.rotation}deg)`, touchAction: 'none' }}
            title={el.name ?? (el.type === 'text' ? 'Texto' : el.type === 'image' ? 'Imagem' : 'Forma')}>
            {sel && !readOnly && handles.map(([h, cls]) => (
              <span key={h} onPointerDown={e => start(e, el, h)} className={`absolute h-3.5 w-3.5 rounded-sm border-2 border-[#2563eb] bg-white ${cls}`} style={{ touchAction: 'none' }} />))}
          </div>)
      })}
    </div>
  )
}
