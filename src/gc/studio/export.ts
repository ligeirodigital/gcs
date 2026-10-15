import JSZip from 'jszip'
import { renderPage, type AssetMap } from './render'
import type { Design } from './model'

export type ExportType = 'png' | 'jpeg'
/** Resoluções disponíveis: largura de saída em pixels. */
export const EXPORT_WIDTHS = [720, 1080, 2160] as const

export function exportDimensions(d: Design, outWidth: number) {
  const scale = outWidth / d.width
  return { width: Math.round(d.width * scale), height: Math.round(d.height * scale), scale }
}
export function safeFileName(title: string) {
  const s = title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return s || 'arte'
}
export function pageFileName(title: string, index: number, total: number, type: ExportType) {
  const ext = type === 'png' ? 'png' : 'jpg'
  return total > 1 ? `${safeFileName(title)}-${String(index + 1).padStart(2, '0')}.${ext}` : `${safeFileName(title)}.${ext}`
}

export async function renderPageBlob(d: Design, pageIndex: number, assets: AssetMap, type: ExportType, outWidth: number): Promise<Blob> {
  const { scale } = exportDimensions(d, outWidth)
  const canvas = document.createElement('canvas')
  renderPage(canvas, d.pages[pageIndex], d, assets, scale, { placeholders: false })
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Não foi possível gerar a imagem. Tente uma resolução menor.'))),
      type === 'png' ? 'image/png' : 'image/jpeg', 0.92))
}

export async function renderZip(d: Design, title: string, assets: AssetMap, type: ExportType, outWidth: number): Promise<Blob> {
  const zip = new JSZip()
  for (let i = 0; i < d.pages.length; i++) {
    zip.file(pageFileName(title, i, d.pages.length, type), await renderPageBlob(d, i, assets, type, outWidth))
  }
  return zip.generateAsync({ type: 'blob' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
