import { useRef, useState } from 'react'
import { ImagePlus, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { supabase } from '@/integrations/supabase/client'
import { brandingUrl, friendlyError } from '../lib/db'
import { validateImage } from '../lib/schemas'

interface Props {
  label: string
  /** Pasta no bucket: `group/<uuid>` ou `church/<uuid>` (autorizada pelo banco). */
  folder: string
  currentPath: string | null
  onUploaded: (path: string) => Promise<void> | void
  shape?: 'square' | 'wide'
}

export function ImageUploader({ label, folder, currentPath, onUploaded, shape = 'square' }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [failedFile, setFailedFile] = useState<File | null>(null)
  const url = brandingUrl(currentPath)

  async function upload(file: File) {
    const problem = validateImage(file)
    if (problem) { toast.error(problem); return }
    setBusy(true); setFailedFile(null)
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${folder}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('branding').upload(path, file, { contentType: file.type, upsert: false })
    if (error) { setFailedFile(file); toast.error(friendlyError(error)); setBusy(false); return }
    try { await onUploaded(path); toast.success('Imagem enviada') } catch (e) { toast.error(friendlyError(e)) }
    setBusy(false)
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium leading-none">{label}</p>
      <div className="flex items-center gap-4">
        <div className={`flex items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary ${shape === 'wide' ? 'h-20 w-36' : 'h-20 w-20'}`}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Enviando" />
            : url ? <img src={url} alt={label} className="h-full w-full object-cover" />
            : <ImagePlus className="h-5 w-5 text-muted-foreground" aria-hidden />}
        </div>
        <div className="space-y-1">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={`Selecionar ${label}`}
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f) }} />
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            {url ? 'Trocar imagem' : 'Enviar imagem'}
          </Button>
          {failedFile && <Button type="button" variant="ghost" size="sm" onClick={() => void upload(failedFile)}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Tentar novamente</Button>}
          <p className="text-xs text-muted-foreground">PNG, JPEG ou WebP, até 2 MB.</p>
        </div>
      </div>
    </div>
  )
}
