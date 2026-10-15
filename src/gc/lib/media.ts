import { supabase } from '@/integrations/supabase/client'
import { db, friendlyError } from './db'

export const MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024

export function validateMediaFile(file: { type: string; size: number }): string | null {
  if (!MEDIA_TYPES.includes(file.type)) return 'Formato não suportado. Use PNG, JPEG ou WebP.'
  if (file.size <= 0) return 'O arquivo está vazio.'
  if (file.size > MAX_MEDIA_BYTES) return 'A imagem deve ter no máximo 10 MB.'
  return null
}
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
export const mediaPath = (groupId: string, mime: string) => `${groupId}/${crypto.randomUUID()}.${EXT[mime] ?? 'bin'}`

export interface MediaRow {
  id: string; group_id: string; storage_path: string; title: string | null; mime_type: string; size_bytes: number
  width: number | null; height: number | null; category: string | null; album: string | null; event_id: string | null
  taken_on: string | null; kind: 'photo' | 'export'; uploaded_by: string | null; created_at: string
}
export interface MediaMeta { title?: string | null; album?: string | null; category?: string | null; event_id?: string | null; taken_on?: string | null }

async function imageSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  try { const b = await createImageBitmap(blob); const r = { width: b.width, height: b.height }; b.close(); return r } catch { return null }
}

/** Envio com progresso real (XHR para a API do Storage), autenticado com a sessão do usuário. */
async function putObject(path: string, file: Blob, onProgress?: (frac: number) => void): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sessão expirada. Entre novamente.')
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/media/${path.split('/').map(encodeURIComponent).join('/')}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress?.(e.loaded / e.total) }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject({ message: xhr.status === 403 || xhr.status === 401 ? 'row-level security: sem permissão' : `Falha no envio (${xhr.status})`, code: xhr.status === 403 ? '42501' : undefined }))
    xhr.onerror = () => reject(new Error('Failed to fetch'))
    xhr.send(file)
  })
}

/** Envia o arquivo e registra em media_assets. Em caso de falha no registro, remove o arquivo enviado. */
export async function uploadMedia(groupId: string, file: File | Blob, meta: MediaMeta & { kind?: 'photo' | 'export' } = {}, onProgress?: (f: number) => void): Promise<MediaRow> {
  const problem = validateMediaFile(file)
  if (problem) throw new Error(problem)
  const path = mediaPath(groupId, file.type)
  try { await putObject(path, file, onProgress) } catch (e) { throw new Error(friendlyError(e)) }
  const size = await imageSize(file)
  const { data, error } = await db.from('media_assets').insert({
    group_id: groupId, storage_path: path, mime_type: file.type, size_bytes: file.size, width: size?.width ?? null, height: size?.height ?? null,
    kind: meta.kind ?? 'photo', title: meta.title ?? (file instanceof File ? file.name.replace(/\.[^.]+$/, '').slice(0, 160) : null),
    album: meta.album ?? null, category: meta.category ?? null, event_id: meta.event_id ?? null, taken_on: meta.taken_on ?? null,
  }).select().single()
  if (error) { await supabase.storage.from('media').remove([path]); throw new Error(friendlyError(error)) }
  return data as MediaRow
}

export async function deleteMedia(rows: Pick<MediaRow, 'id' | 'storage_path'>[]): Promise<void> {
  if (!rows.length) return
  const { error } = await db.from('media_assets').delete().in('id', rows.map(r => r.id))
  if (error) throw new Error(friendlyError(error))
  await supabase.storage.from('media').remove(rows.map(r => r.storage_path))
}
