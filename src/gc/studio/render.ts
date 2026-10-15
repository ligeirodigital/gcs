import { wrapText } from './layout'
import type { Design, ImageElement, Page, ShapeElement, TextElement } from './model'

/** Imagens já carregadas, indexadas por "media:<id>" ou "logo". */
export type AssetMap = Map<string, CanvasImageSource & { width: number; height: number }>
export const assetKey = (src: ImageElement['src']) => (src.kind === 'media' ? `media:${src.mediaId}` : src.kind === 'logo' ? 'logo' : '')

export function fontString(e: TextElement) {
  return `${e.italic ? 'italic ' : ''}${e.fontWeight} ${e.fontSize}px "${e.fontFamily}", Arial, sans-serif`
}

function roundRectPath(ctx: CanvasRenderingContext2D, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(rr, 0); ctx.lineTo(w - rr, 0); ctx.arcTo(w, 0, w, rr, rr); ctx.lineTo(w, h - rr)
  ctx.arcTo(w, h, w - rr, h, rr); ctx.lineTo(rr, h); ctx.arcTo(0, h, 0, h - rr, rr); ctx.lineTo(0, rr); ctx.arcTo(0, 0, rr, 0, rr); ctx.closePath()
}

function drawText(ctx: CanvasRenderingContext2D, e: TextElement) {
  ctx.font = fontString(e)
  ctx.fillStyle = e.color
  ctx.textBaseline = 'alphabetic'
  ;(ctx as unknown as { letterSpacing: string }).letterSpacing = `${e.letterSpacing}px`
  const content = e.uppercase ? e.content.toUpperCase() : e.content
  const lines = wrapText(content, e.w, s => ctx.measureText(s).width)
  const lh = e.fontSize * e.lineHeight
  const total = lines.length * lh
  let y = e.valign === 'middle' ? (e.h - total) / 2 : e.valign === 'bottom' ? e.h - total : 0
  for (const line of lines) {
    const w = ctx.measureText(line).width
    const x = e.align === 'center' ? (e.w - w) / 2 : e.align === 'right' ? e.w - w : 0
    ctx.fillText(line, x, y + (lh + e.fontSize * 0.7) / 2 - e.fontSize * 0.1)
    y += lh
  }
  ;(ctx as unknown as { letterSpacing: string }).letterSpacing = '0px'
}

function drawImage(ctx: CanvasRenderingContext2D, e: ImageElement, assets: AssetMap, placeholders: boolean) {
  const img0 = assets.get(assetKey(e.src))
  if (!img0 && !placeholders) return   // exportação não mostra espaços reservados
  ctx.save()
  roundRectPath(ctx, e.w, e.h, e.radius)
  ctx.clip()
  const img = assets.get(assetKey(e.src))
  if (!img) {
    ctx.fillStyle = '#E8E6DF'; ctx.fillRect(0, 0, e.w, e.h)
    ctx.strokeStyle = '#B8B5AA'; ctx.lineWidth = Math.max(2, e.w * 0.004); ctx.setLineDash([e.w * 0.02, e.w * 0.02])
    ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, e.w - ctx.lineWidth * 2, e.h - ctx.lineWidth * 2); ctx.setLineDash([])
    ctx.fillStyle = '#8A877C'
    ctx.font = `600 ${Math.max(14, Math.min(e.w, e.h) * 0.08)}px "Space Grotesk", Arial, sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(e.src.kind === 'logo' ? 'Logo' : 'Foto', e.w / 2, e.h / 2); ctx.textAlign = 'left'
    ctx.restore(); return
  }
  const iw = img.width, ih = img.height
  const scale = (e.fit === 'cover' ? Math.max(e.w / iw, e.h / ih) : Math.min(e.w / iw, e.h / ih)) * (e.fit === 'cover' ? e.zoom : 1)
  const dw = iw * scale, dh = ih * scale
  const ox = (e.w - dw) * (e.fit === 'cover' ? e.focalX : 0.5)
  const oy = (e.h - dh) * (e.fit === 'cover' ? e.focalY : 0.5)
  ctx.drawImage(img, ox, oy, dw, dh)
  ctx.restore()
}

function drawShape(ctx: CanvasRenderingContext2D, e: ShapeElement) {
  ctx.lineWidth = e.strokeWidth
  if (e.shape === 'line') {
    ctx.strokeStyle = e.stroke ?? e.fill ?? '#232323'; ctx.lineWidth = e.strokeWidth || 6
    ctx.beginPath(); ctx.moveTo(0, e.h / 2); ctx.lineTo(e.w, e.h / 2); ctx.stroke(); return
  }
  if (e.shape === 'ellipse') { ctx.beginPath(); ctx.ellipse(e.w / 2, e.h / 2, e.w / 2, e.h / 2, 0, 0, Math.PI * 2) }
  else roundRectPath(ctx, e.w, e.h, e.radius)
  if (e.shape !== 'frame' && e.fill) { ctx.fillStyle = e.fill; ctx.fill() }
  if (e.stroke && e.strokeWidth > 0) { ctx.strokeStyle = e.stroke; ctx.stroke() }
}

/** Desenha uma página no canvas. `scale` = pixels de saída por unidade do design (1 = 1080 px de largura). */
export function renderPage(canvas: HTMLCanvasElement | OffscreenCanvas, page: Page, design: Design, assets: AssetMap, scale = 1, opts: { placeholders?: boolean } = {}) {
  const placeholders = opts.placeholders ?? true
  canvas.width = Math.round(design.width * scale); canvas.height = Math.round(design.height * scale)
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  ctx.imageSmoothingQuality = 'high'
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.fillStyle = page.background; ctx.fillRect(0, 0, design.width, design.height)
  for (const e of page.elements) {
    ctx.save()
    ctx.globalAlpha = e.opacity
    ctx.translate(e.x + e.w / 2, e.y + e.h / 2); ctx.rotate((e.rotation * Math.PI) / 180); ctx.translate(-e.w / 2, -e.h / 2)
    if (e.type === 'text') drawText(ctx, e)
    else if (e.type === 'image') drawImage(ctx, e, assets, placeholders)
    else drawShape(ctx, e)
    ctx.restore()
  }
}
