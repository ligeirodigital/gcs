import { useCallback, useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { db, friendlyError } from '../lib/db'
import { uploadMedia, type MediaRow } from '../lib/media'
import { signedUrls } from '../studio/assets'
import { EmptyState, ErrorState } from './ui-kit'

/** Seletor de foto da galeria do GC (com envio rápido). */
export function MediaPicker({ open, onOpenChange, groupId, canUpload, onPick }: {
  open: boolean; onOpenChange: (o: boolean) => void; groupId: string; canUpload: boolean; onPick: (m: MediaRow) => void
}) {
  const [rows, setRows] = useState<MediaRow[] | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setError(null)
    let query = db.from('media_assets').select('*').eq('group_id', groupId).order('created_at', { ascending: false }).limit(60)
    if (q.trim()) query = query.ilike('title', `%${q.trim().replace(/[%_]/g, '')}%`)
    const { data, error } = await query
    if (error) { setError(friendlyError(error)); return }
    const list = (data ?? []) as MediaRow[]
    setRows(list)
    try { setUrls(await signedUrls(list.map(r => r.storage_path))) } catch (e) { setError(friendlyError(e)) }
  }, [groupId, q])
  useEffect(() => { if (open) { const h = setTimeout(() => void load(), 250); return () => clearTimeout(h) } }, [open, load])

  async function upload(file: File) {
    setUploading(true)
    try { const m = await uploadMedia(groupId, file); toast.success('Foto enviada'); onPick(m); onOpenChange(false) }
    catch (e) { toast.error((e as Error).message) }
    setUploading(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gc-theme max-h-[90vh] max-w-3xl overflow-y-auto bg-card text-foreground">
        <DialogHeader><DialogTitle>Escolher foto</DialogTitle><DialogDescription>Fotos da galeria deste GC.</DialogDescription></DialogHeader>
        <div className="flex gap-2">
          <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input className="pl-9" placeholder="Buscar por título" aria-label="Buscar foto" value={q} onChange={e => setQ(e.target.value)} /></div>
          {canUpload && <>
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Enviar nova foto"
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f) }} />
            <Button variant="outline" disabled={uploading} onClick={() => input.current?.click()}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />} Enviar nova</Button></>}
        </div>
        {error ? <ErrorState message={error} onRetry={() => void load()} /> : rows === null ? <div className="py-10 text-center text-sm text-muted-foreground">Carregando…</div>
          : rows.length === 0 ? <EmptyState icon={ImagePlus} title="Nenhuma foto encontrada" description="Envie uma foto para usar na arte." />
          : <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {rows.map(r => (
              <li key={r.id}><button type="button" onClick={() => { onPick(r); onOpenChange(false) }} className="group relative block aspect-square w-full overflow-hidden rounded-lg border border-border bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {urls[r.storage_path] && <img src={urls[r.storage_path]} alt={r.title ?? 'Foto'} loading="lazy" className="h-full w-full object-cover" />}
                <span className="sr-only">Usar {r.title ?? 'foto'}</span></button></li>))}
          </ul>}
      </DialogContent>
    </Dialog>
  )
}
