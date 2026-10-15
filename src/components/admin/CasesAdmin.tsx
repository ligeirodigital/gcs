import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Trash2, Plus, Upload, Pencil } from 'lucide-react'
import { toast } from 'sonner'

type PortfolioCase = {
  id: string
  title: string
  category: string
  result: string
  description: string
  image_url: string | null
  logo_url: string | null
  display_order: number
}

const emptyCase = {
  title: '', category: '', result: '', description: '',
  image_url: '', logo_url: '', display_order: 0,
}

export function CasesAdmin() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<PortfolioCase | null>(null)
  const [form, setForm] = useState(emptyCase)
  const [showForm, setShowForm] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ['admin-cases'],
    queryFn: async () => {
      const { data, error } = await supabase.from('portfolio_cases').select('*').order('display_order')
      if (error) throw error
      return data as PortfolioCase[]
    },
  })

  const uploadFile = async (file: File, folder: string) => {
    const ext = file.name.split('.').pop()
    const path = `${folder}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('portfolio').upload(path, file)
    if (error) throw error
    return supabase.storage.from('portfolio').getPublicUrl(path).data.publicUrl
  }

  const save = useMutation({
    mutationFn: async () => {
      let image_url = form.image_url || null
      let logo_url = form.logo_url || null
      if (imageFile) image_url = await uploadFile(imageFile, 'images')
      if (logoFile) logo_url = await uploadFile(logoFile, 'logos')
      const payload = { ...form, image_url, logo_url }
      if (editing) {
        const { error } = await supabase.from('portfolio_cases').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('portfolio_cases').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-cases'] })
      queryClient.invalidateQueries({ queryKey: ['portfolio-cases'] })
      setEditing(null); setForm(emptyCase); setImageFile(null); setLogoFile(null); setShowForm(false)
      toast.success('Salvo!')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('portfolio_cases').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-cases'] })
      queryClient.invalidateQueries({ queryKey: ['portfolio-cases'] })
      toast.success('Excluído!')
    },
  })

  const startEdit = (item: PortfolioCase) => {
    setEditing(item)
    setForm({
      title: item.title, category: item.category, result: item.result, description: item.description,
      image_url: item.image_url || '', logo_url: item.logo_url || '', display_order: item.display_order,
    })
    setImageFile(null); setLogoFile(null); setShowForm(true)
  }
  const startNew = () => {
    setEditing(null); setForm({ ...emptyCase, display_order: cases.length + 1 }); setShowForm(true)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display font-bold text-xl">Cases do Portfólio</h2>
        <Button onClick={startNew} className="gap-2"><Plus className="w-4 h-4" /> Novo Case</Button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-2xl p-6 mb-6">
          <h3 className="font-semibold mb-4">{editing ? 'Editar' : 'Novo'} case</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input placeholder="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input placeholder="Categoria" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <Input className="md:col-span-2" placeholder="Resultado (ex: +320% de vendas)" value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} />
            <Textarea className="md:col-span-2" placeholder="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            <Input type="number" placeholder="Ordem" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value) || 0 })} />
            <div />
            <FileField label="Imagem" file={imageFile} onFile={setImageFile} hasUrl={!!form.image_url} />
            <FileField label="Logo" file={logoFile} onFile={setLogoFile} hasUrl={!!form.logo_url} />
          </div>
          <div className="flex gap-3 mt-6">
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.title}>{save.isPending ? 'Salvando...' : 'Salvar'}</Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditing(null); setForm(emptyCase) }}>Cancelar</Button>
          </div>
        </div>
      )}

      {isLoading ? <p className="text-muted-foreground">Carregando...</p> : (
        <div className="space-y-3">
          {cases.map((item) => (
            <div key={item.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
              {(item.logo_url || item.image_url) && <img src={item.logo_url || item.image_url!} alt="" className="w-10 h-10 rounded object-cover" />}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold truncate">{item.title}</h3>
                <p className="text-sm text-muted-foreground truncate">{item.category} — {item.result}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => startEdit(item)}><Pencil className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => confirm('Excluir?') && del.mutate(item.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function FileField({ label, file, onFile, hasUrl }: { label: string; file: File | null; onFile: (f: File | null) => void; hasUrl: boolean }) {
  return (
    <div>
      <label className="text-sm text-muted-foreground mb-1 block">{label}</label>
      <label className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-lg cursor-pointer hover:bg-secondary/80 gentle-animation text-sm">
        <Upload className="w-4 h-4" />
        {file ? file.name : hasUrl ? 'Substituir arquivo' : `Escolher ${label.toLowerCase()}`}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0] || null)} />
      </label>
    </div>
  )
}
