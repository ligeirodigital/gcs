import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Trash2, Plus, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { FileField } from './CasesAdmin'

type Affiliate = {
  id: string
  name: string
  company: string | null
  category: string
  image_url: string | null
  description: string
  price: string | null
  affiliate_url: string
  featured: boolean
  display_order: number
  status: string
  clicks_count: number
}

const empty = {
  name: '', company: '', category: '', image_url: '', description: '',
  price: '', affiliate_url: '', featured: false, display_order: 0, status: 'published',
}

export function AffiliatesAdmin() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Affiliate | null>(null)
  const [form, setForm] = useState(empty)
  const [showForm, setShowForm] = useState(false)
  const [imgFile, setImgFile] = useState<File | null>(null)

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['admin-affiliates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('affiliate_products').select('*').order('display_order')
      if (error) throw error
      return data as Affiliate[]
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      let image_url = form.image_url || null
      if (imgFile) {
        const ext = imgFile.name.split('.').pop()
        const path = `affiliates/${crypto.randomUUID()}.${ext}`
        const { error } = await supabase.storage.from('portfolio').upload(path, imgFile)
        if (error) throw error
        image_url = supabase.storage.from('portfolio').getPublicUrl(path).data.publicUrl
      }
      const payload = {
        name: form.name,
        company: form.company || null,
        category: form.category,
        image_url,
        description: form.description,
        price: form.price || null,
        affiliate_url: form.affiliate_url,
        featured: form.featured,
        display_order: form.display_order,
        status: form.status,
      }
      if (editing) {
        const { error } = await supabase.from('affiliate_products').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('affiliate_products').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-affiliates'] })
      qc.invalidateQueries({ queryKey: ['affiliate_products', 'public'] })
      setEditing(null); setForm(empty); setImgFile(null); setShowForm(false)
      toast.success('Salvo!')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('affiliate_products').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-affiliates'] })
      toast.success('Excluído!')
    },
  })

  const startEdit = (a: Affiliate) => {
    setEditing(a)
    setForm({
      name: a.name, company: a.company || '', category: a.category, image_url: a.image_url || '',
      description: a.description, price: a.price || '', affiliate_url: a.affiliate_url,
      featured: a.featured, display_order: a.display_order, status: a.status,
    })
    setImgFile(null); setShowForm(true)
  }
  const startNew = () => {
    setEditing(null); setForm({ ...empty, display_order: items.length + 1 }); setShowForm(true)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display font-bold text-xl">Produtos Afiliados</h2>
        <Button onClick={startNew} className="gap-2"><Plus className="w-4 h-4" /> Novo Afiliado</Button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-2xl p-6 mb-6">
          <h3 className="font-semibold mb-4">{editing ? 'Editar' : 'Novo'} produto afiliado</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input placeholder="Nome *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Empresa" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            <Input placeholder="Categoria *" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <Input placeholder="Preço (ex: R$ 97/mês)" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            <Textarea className="md:col-span-2" placeholder="Descrição *" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Input className="md:col-span-2" placeholder="Link de afiliado *" value={form.affiliate_url} onChange={(e) => setForm({ ...form, affiliate_url: e.target.value })} />
            <Input type="number" placeholder="Ordem" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value) || 0 })} />
            <FileField label="Imagem" file={imgFile} onFile={setImgFile} hasUrl={!!form.image_url} />
            <div className="flex items-center gap-3"><Switch checked={form.featured} onCheckedChange={(v) => setForm({ ...form, featured: v })} /><span className="text-sm">Destaque</span></div>
            <div className="flex items-center gap-3"><Switch checked={form.status === 'published'} onCheckedChange={(v) => setForm({ ...form, status: v ? 'published' : 'draft' })} /><span className="text-sm">Publicado</span></div>
          </div>
          <div className="flex gap-3 mt-6">
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name || !form.category || !form.affiliate_url || !form.description}>
              {save.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditing(null); setForm(empty) }}>Cancelar</Button>
          </div>
        </div>
      )}

      {isLoading ? <p className="text-muted-foreground">Carregando...</p> : items.length === 0 ? (
        <p className="text-muted-foreground text-center py-10">Nenhum produto afiliado ainda.</p>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <div key={a.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
              {a.image_url && <img src={a.image_url} alt="" className="w-12 h-12 rounded object-cover" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold truncate">{a.name}</h3>
                  {a.featured && <span className="text-[10px] font-bold uppercase text-primary bg-primary/10 px-2 py-0.5 rounded">Destaque</span>}
                  {a.status !== 'published' && <span className="text-[10px] font-bold uppercase text-muted-foreground bg-muted px-2 py-0.5 rounded">Rascunho</span>}
                </div>
                <p className="text-sm text-muted-foreground truncate">{a.category} — {a.clicks_count} cliques</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => startEdit(a)}><Pencil className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => confirm('Excluir?') && del.mutate(a.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
