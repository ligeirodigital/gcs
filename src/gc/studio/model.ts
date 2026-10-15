import { z } from 'zod'

// ===== Formatos =====
export type PostFormat = 'feed_vertical' | 'feed_square' | 'story' | 'carousel'
export const FORMAT_SPECS: Record<PostFormat, { label: string; width: number; height: number; hint: string }> = {
  feed_vertical: { label: 'Feed vertical', width: 1080, height: 1350, hint: '1080 × 1350' },
  feed_square: { label: 'Feed quadrado', width: 1080, height: 1080, hint: '1080 × 1080' },
  story: { label: 'Stories', width: 1080, height: 1920, hint: '1080 × 1920' },
  carousel: { label: 'Carrossel', width: 1080, height: 1350, hint: '1080 × 1350 por página' },
}
export const FORMATS = Object.keys(FORMAT_SPECS) as PostFormat[]

export const FONT_FAMILIES = ['Space Grotesk', 'Syne', 'Playfair Display', 'Inter', 'Georgia', 'Arial'] as const

// ===== Esquema (validado ao abrir/salvar; o projeto fica editável, nunca só uma imagem) =====
const color = z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, 'cor inválida')
const base = {
  id: z.string().min(1).max(64),
  name: z.string().max(60).optional(),
  x: z.number().finite(), y: z.number().finite(),
  w: z.number().finite().min(1).max(8000), h: z.number().finite().min(1).max(8000),
  rotation: z.number().finite().min(-360).max(360).default(0),
  opacity: z.number().min(0).max(1).default(1),
}
const textEl = z.object({
  ...base, type: z.literal('text'),
  content: z.string().max(2000),
  fontFamily: z.enum(FONT_FAMILIES), fontSize: z.number().min(8).max(600),
  fontWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700), z.literal(800)]),
  color, align: z.enum(['left', 'center', 'right']), valign: z.enum(['top', 'middle', 'bottom']).default('top'),
  lineHeight: z.number().min(0.8).max(3).default(1.2), italic: z.boolean().default(false),
  uppercase: z.boolean().default(false), letterSpacing: z.number().min(-10).max(50).default(0),
})
const imageEl = z.object({
  ...base, type: z.literal('image'),
  src: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('media'), mediaId: z.string().uuid() }),
    z.object({ kind: z.literal('logo') }),
    z.object({ kind: z.literal('none') }),
  ]),
  fit: z.enum(['cover', 'contain']).default('cover'),
  focalX: z.number().min(0).max(1).default(0.5), focalY: z.number().min(0).max(1).default(0.5),
  zoom: z.number().min(1).max(5).default(1), radius: z.number().min(0).max(10000).default(0),
})
const shapeEl = z.object({
  ...base, type: z.literal('shape'),
  shape: z.enum(['rect', 'ellipse', 'frame', 'line']),
  fill: color.nullable(), stroke: color.nullable(), strokeWidth: z.number().min(0).max(200).default(0),
  radius: z.number().min(0).max(10000).default(0),
})
export const elementSchema = z.discriminatedUnion('type', [textEl, imageEl, shapeEl])
export const pageSchema = z.object({
  id: z.string().min(1).max(64), name: z.string().max(60).optional(),
  background: color, elements: z.array(elementSchema).max(60),
})
export const designSchema = z.object({
  version: z.literal(1),
  format: z.enum(['feed_vertical', 'feed_square', 'story', 'carousel']),
  width: z.number().int().min(100).max(4000), height: z.number().int().min(100).max(4000),
  pages: z.array(pageSchema).min(1).max(20),
})
export type TextElement = z.infer<typeof textEl>
export type ImageElement = z.infer<typeof imageEl>
export type ShapeElement = z.infer<typeof shapeEl>
export type Element = z.infer<typeof elementSchema>
export type Page = z.infer<typeof pageSchema>
export type Design = z.infer<typeof designSchema>

export function parseDesign(raw: unknown): { ok: true; design: Design } | { ok: false; error: string } {
  const r = designSchema.safeParse(raw)
  return r.success ? { ok: true, design: r.data } : { ok: false, error: r.error.issues[0]?.message ?? 'projeto inválido' }
}

// ===== Operações puras =====
let counter = 0
export const uid = (p = 'e') => `${p}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function emptyDesign(format: PostFormat): Design {
  const s = FORMAT_SPECS[format]
  return { version: 1, format, width: s.width, height: s.height, pages: [{ id: uid('p'), background: '#FFFFFF', elements: [] }] }
}

export function newText(d: Design, over: Partial<TextElement> = {}): TextElement {
  return {
    id: uid(), type: 'text', x: d.width * 0.1, y: d.height * 0.4, w: d.width * 0.8, h: d.height * 0.12, rotation: 0, opacity: 1,
    content: 'Novo texto', fontFamily: 'Space Grotesk', fontSize: d.width * 0.06, fontWeight: 600, color: '#232323',
    align: 'left', valign: 'top', lineHeight: 1.2, italic: false, uppercase: false, letterSpacing: 0, ...over,
  }
}
export function newShape(d: Design, shape: ShapeElement['shape'], over: Partial<ShapeElement> = {}): ShapeElement {
  const size = d.width * 0.3
  return {
    id: uid(), type: 'shape', shape, x: (d.width - size) / 2, y: (d.height - size) / 2, w: size, h: shape === 'line' ? 0 + 8 : size,
    rotation: 0, opacity: 1, fill: shape === 'frame' || shape === 'line' ? null : '#E3AE00',
    stroke: shape === 'frame' || shape === 'line' ? '#E3AE00' : null, strokeWidth: shape === 'frame' ? 12 : shape === 'line' ? 8 : 0, radius: 0, ...over,
  }
}
export function newImage(d: Design, src: ImageElement['src'], over: Partial<ImageElement> = {}): ImageElement {
  const size = d.width * 0.5
  return {
    id: uid(), type: 'image', src, x: (d.width - size) / 2, y: (d.height - size) / 2, w: size, h: size, rotation: 0, opacity: 1,
    fit: 'cover', focalX: 0.5, focalY: 0.5, zoom: 1, radius: 0, ...over,
  }
}

export const getPage = (d: Design, i: number) => d.pages[Math.min(Math.max(i, 0), d.pages.length - 1)]

export function updatePage(d: Design, i: number, fn: (p: Page) => Page): Design {
  return { ...d, pages: d.pages.map((p, idx) => (idx === i ? fn(p) : p)) }
}
export function patchElement(d: Design, pageIdx: number, id: string, patch: Partial<Element>): Design {
  return updatePage(d, pageIdx, p => ({ ...p, elements: p.elements.map(e => (e.id === id ? ({ ...e, ...patch } as Element) : e)) }))
}
export function addElement(d: Design, pageIdx: number, el: Element): Design {
  return updatePage(d, pageIdx, p => ({ ...p, elements: [...p.elements, el].slice(0, 60) }))
}
export function removeElement(d: Design, pageIdx: number, id: string): Design {
  return updatePage(d, pageIdx, p => ({ ...p, elements: p.elements.filter(e => e.id !== id) }))
}
export function duplicateElement(d: Design, pageIdx: number, id: string): { design: Design; newId: string | null } {
  const el = getPage(d, pageIdx).elements.find(e => e.id === id)
  if (!el) return { design: d, newId: null }
  const copy = { ...el, id: uid(), x: el.x + d.width * 0.03, y: el.y + d.width * 0.03 } as Element
  return { design: addElement(d, pageIdx, copy), newId: copy.id }
}
/** direction: 1 = para frente, -1 = para trás, 'front'/'back' = extremos */
export function reorderElement(d: Design, pageIdx: number, id: string, dir: 1 | -1 | 'front' | 'back'): Design {
  return updatePage(d, pageIdx, p => {
    const i = p.elements.findIndex(e => e.id === id)
    if (i < 0) return p
    const els = [...p.elements]
    const [el] = els.splice(i, 1)
    const j = dir === 'front' ? els.length : dir === 'back' ? 0 : Math.min(Math.max(i + dir, 0), els.length)
    els.splice(j, 0, el)
    return { ...p, elements: els }
  })
}
export function addPage(d: Design): Design {
  if (d.pages.length >= 20) return d
  return { ...d, pages: [...d.pages, { id: uid('p'), background: d.pages[d.pages.length - 1]?.background ?? '#FFFFFF', elements: [] }] }
}
export function duplicatePage(d: Design, i: number): Design {
  if (d.pages.length >= 20) return d
  const src = getPage(d, i)
  const copy: Page = { ...src, id: uid('p'), elements: src.elements.map(e => ({ ...e, id: uid() }) as Element) }
  const pages = [...d.pages]; pages.splice(i + 1, 0, copy)
  return { ...d, pages }
}
export function removePage(d: Design, i: number): Design {
  return d.pages.length <= 1 ? d : { ...d, pages: d.pages.filter((_, idx) => idx !== i) }
}
export function movePage(d: Design, i: number, to: number): Design {
  if (to < 0 || to >= d.pages.length || i === to) return d
  const pages = [...d.pages]; const [p] = pages.splice(i, 1); pages.splice(to, 0, p)
  return { ...d, pages }
}
/** Conserva o conteúdo ao trocar de formato (reposiciona proporcionalmente). */
export function resizeDesign(d: Design, format: PostFormat): Design {
  const s = FORMAT_SPECS[format]
  const fx = s.width / d.width, fy = s.height / d.height
  return {
    ...d, format, width: s.width, height: s.height,
    pages: d.pages.map(p => ({ ...p, elements: p.elements.map(e => ({ ...e, x: e.x * fx, y: e.y * fy, w: e.w * fx, h: e.h * fy })) as Element[] })),
  }
}
export function mediaIdsInDesign(d: Design): string[] {
  const ids = new Set<string>()
  for (const p of d.pages) for (const e of p.elements) if (e.type === 'image' && e.src.kind === 'media') ids.add(e.src.mediaId)
  return [...ids]
}
