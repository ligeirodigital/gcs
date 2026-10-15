import { supabase } from '@/integrations/supabase/client'
import { brandingUrl, db } from '../lib/db'
import { FONT_FAMILIES, mediaIdsInDesign, type Design } from './model'
import type { AssetMap } from './render'

interface MediaRow { id: string; storage_path: string }
const signedCache = new Map<string, { url: string; exp: number }>()

/** URLs temporárias (1 h) para arquivos privados do bucket "media". Nunca há URL pública permanente. */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now(), out: Record<string, string> = {}, missing: string[] = []
  for (const p of paths) {
    const c = signedCache.get(p)
    if (c && c.exp > now + 60_000) out[p] = c.url; else missing.push(p)
  }
  if (missing.length) {
    const { data, error } = await supabase.storage.from('media').createSignedUrls(missing, 3600)
    if (error) throw error
    for (const r of data ?? []) if (r.signedUrl && r.path) { signedCache.set(r.path, { url: r.signedUrl, exp: now + 3_600_000 }); out[r.path] = r.signedUrl }
  }
  return out
}

async function fetchBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Falha ao carregar imagem (${res.status})`)
  return createImageBitmap(await res.blob())   // evita "tainted canvas" na exportação
}

const fontsReady = new Set<string>()
export async function ensureFonts(families: string[] = [...FONT_FAMILIES]) {
  if (typeof document === 'undefined' || !document.fonts) return
  const todo = families.filter(f => !fontsReady.has(f))
  await Promise.all(todo.flatMap(f => [400, 500, 600, 700, 800].map(w => document.fonts.load(`${w} 40px "${f}"`).catch(() => undefined))))
  todo.forEach(f => fontsReady.add(f))
}

/** Carrega logo e fotos usadas no projeto. Arquivos que falham simplesmente ficam como espaço reservado. */
export async function loadDesignAssets(d: Design, logoPath: string | null, existing?: AssetMap): Promise<{ assets: AssetMap; failed: string[] }> {
  const assets: AssetMap = new Map(existing ?? [])
  const failed: string[] = []
  const ids = mediaIdsInDesign(d).filter(id => !assets.has(`media:${id}`))
  const tasks: Promise<void>[] = []
  if (ids.length) {
    const { data, error } = await db.from('media_assets').select('id, storage_path').in('id', ids)
    if (error) throw error
    const paths = (data ?? []).map((r: MediaRow) => r.storage_path)
    const urls = paths.length ? await signedUrls(paths) : {}
    for (const r of (data ?? []) as MediaRow[]) {
      tasks.push(fetchBitmap(urls[r.storage_path]).then(b => { assets.set(`media:${r.id}`, b) }).catch(() => { failed.push(r.id) }))
    }
    for (const id of ids) if (!((data ?? []) as MediaRow[]).some(r => r.id === id)) failed.push(id)
  }
  const logoUrl = brandingUrl(logoPath)
  if (logoUrl && !assets.has('logo')) tasks.push(fetchBitmap(logoUrl).then(b => { assets.set('logo', b) }).catch(() => { failed.push('logo') }))
  await Promise.all(tasks)
  return { assets, failed }
}
