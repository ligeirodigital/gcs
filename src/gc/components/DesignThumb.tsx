import { useEffect, useRef } from 'react'
import { renderPage, type AssetMap } from '../studio/render'
import type { Design } from '../studio/model'
import { ensureFonts } from '../studio/assets'

/** Miniatura de uma página (renderizada com o mesmo motor da exportação). */
export function DesignThumb({ design, pageIndex = 0, assets, width = 160, className = '' }: { design: Design; pageIndex?: number; assets?: AssetMap; width?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let off = false
    void ensureFonts().then(() => { if (!off && ref.current) renderPage(ref.current, design.pages[pageIndex] ?? design.pages[0], design, assets ?? new Map(), width / design.width) })
    return () => { off = true }
  }, [design, pageIndex, assets, width])
  return <canvas ref={ref} className={`block h-auto max-w-full rounded-sm bg-white ${className}`} style={{ width }} role="img" aria-label="Miniatura da arte" />
}
