import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Trash2, Plus, Pencil, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { FileField } from './CasesAdmin'

type Project = {
  id: string
  name: string
  slug: string
  category: string
  short_description: string
  full_description: string | null
  cover_url: string | null
  logo_url: string | null
  gallery: string[]
  videos: string[]
  technologies: string[]
  tags: string[]
  features: string[]
  benefits: string[]
  clients: string[]
  demo_url: string | null
  site_url: string | null
  whatsapp_url: string | null
  status: string
  featured: boolean
  display_order: number
  meta_title: string | null
  meta_description: string | null
  og_image: string | null
  views_count: number
  clicks_demo: number
  clicks_whatsapp: number
}

const empty = {
  name: '', slug: '', category: '', short_description: '', full_description: '',
  cover_url: '', logo_url: '', gallery: '', videos: '', technologies: '',
  tags: '', features: '', benefits: '', clients: '',
  demo_url: '', site_url: '', whatsapp_url: '',
  status: 'published', featured: false, display_order: 0,
  meta_title: '', meta_description: '', og_image: '',
}

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const arr = (s: string) => s.split(/\r?\n|,/).map(x => x.trim()).filter(Boolean)
const arrJoin = (a: string[] | null | undefined) => (a || []).join('\n')

export function ProjectsAdmin() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Project | null>(null)
  const [form, setForm] = useState(empty)
  const [showForm, setShowForm] = useState(false)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['admin-projects'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('*').order('display_order')
      if (error) throw error
      return data as Project[]
    },
  })

  const uploadFile = async (file: File, folder: string) => {
    const ext = file.name.split('.').pop()
    const path = `projects/${folder}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('portfolio').upload(path, file)
    if (error) throw error
    return supabase.storage.from('portfolio').getPublicUrl(path).data.publicUrl
  }

  const save = useMutation({
    mutationFn: async () => {
      let cover_url = form.cover_url || null
      let logo_url = form.logo_url || null
      if (coverFile) cover_url = await uploadFile(coverFile, 'cover')
      if (logoFile) logo_url = await uploadFile(logoFile, 'logo')

      const payload = {
        name: form.name,
        slug: form.slug || slugify(form.name),
        category: form.category,
        short_description: form.short_description,
        full_description: form.full_description || null,
        cover_url, logo_url,
        gallery: arr(form.gallery),
        videos: arr(form.videos),
        technologies: arr(form.technologies),
        tags: arr(form.tags),
        features: arr(form.features),
        benefits: arr(form.benefits),
        clients: arr(form.clients),
        demo_url: form.demo_url || null,
        site_url: form.site_url || null,
        whatsapp_url: form.whatsapp_url || null,
        status: form.status,
        featured: form.featured,
        display_order: form.display_order,
        meta_title: form.meta_title || null,
        meta_description: form.meta_description || null,
        og_image: form.og_image || null,
      }

      if (editing) {
        const { error } = await supabase.from('projects').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('projects').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-projects'] })
      qc.invalidateQueries({ queryKey: ['projects', 'public'] })
      setEditing(null); setForm(empty); setCoverFile(null); setLogoFile(null); setShowForm(false)
      toast.success('Projeto salvo!')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('projects').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-projects'] })
      toast.success('Excluído!')
    },
  })

  const startEdit = (p: Project) => {
    setEditing(p)
    setForm({
      name: p.name, slug: p.slug, category: p.category,
      short_description: p.short_description, full_description: p.full_description || '',
      cover_url: p.cover_url || '', logo_url: p.logo_url || '',
      gallery: arrJoin(p.gallery), videos: arrJoin(p.videos),
      technologies: arrJoin(p.technologies), tags: arrJoin(p.tags),
      features: arrJoin(p.features), benefits: arrJoin(p.benefits), clients: arrJoin(p.clients),
      demo_url: p.demo_url || '', site_url: p.site_url || '', whatsapp_url: p.whatsapp_url || '',
      status: p.status, featured: p.featured, display_order: p.display_order,
      meta_title: p.meta_title || '', meta_description: p.meta_description || '', og_image: p.og_image || '',
    })
    setCoverFile(null); setLogoFile(null); setShowForm(true)
  }
  const startNew = () => {
    setEditing(null); setForm({ ...empty, display_order: projects.length + 1 }); setShowForm(true)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display font-bold text-xl">Projetos</h2>
        <Button onClick={startNew} className="gap-2"><Plus className="w-4 h-4" /> Novo Projeto</Button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-2xl p-6 mb-6 space-y-4">
          <h3 className="font-semibold">{editing ? 'Editar' : 'Novo'} projeto</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nome *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: form.slug || slugify(e.target.value) })} /></Field>
            <Field label="Slug (URL)"><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} placeholder="gerado do nome" /></Field>
            <Field label="Categoria *"><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="SaaS, Site, Landing Page..." /></Field>
            <Field label="Ordem"><Input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value) || 0 })} /></Field>
            <Field label="Descrição curta *" className="md:col-span-2"><Textarea rows={2} value={form.short_description} onChange={(e) => setForm({ ...form, short_description: e.target.value })} /></Field>
            <Field label="Descrição completa" className="md:col-span-2"><Textarea rows={6} value={form.full_description} onChange={(e) => setForm({ ...form, full_description: e.target.value })} /></Field>

            <FileField label="Capa" file={coverFile} onFile={setCoverFile} hasUrl={!!form.cover_url} />
            <FileField label="Logo" file={logoFile} onFile={setLogoFile} hasUrl={!!form.logo_url} />

            <Field label="Tecnologias (uma por linha ou vírgula)" className="md:col-span-2"><Textarea rows={2} value={form.technologies} onChange={(e) => setForm({ ...form, technologies: e.target.value })} placeholder="React, TypeScript, Supabase" /></Field>
            <Field label="Tags (Novo, Premium, Em Alta...)" className="md:col-span-2"><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></Field>
            <Field label="Funcionalidades (uma por linha)" className="md:col-span-2"><Textarea rows={4} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} /></Field>
            <Field label="Benefícios (um por linha)" className="md:col-span-2"><Textarea rows={4} value={form.benefits} onChange={(e) => setForm({ ...form, benefits: e.target.value })} /></Field>
            <Field label="Clientes (um por linha)" className="md:col-span-2"><Textarea rows={2} value={form.clients} onChange={(e) => setForm({ ...form, clients: e.target.value })} /></Field>
            <Field label="Galeria — URLs (uma por linha)" className="md:col-span-2"><Textarea rows={3} value={form.gallery} onChange={(e) => setForm({ ...form, gallery: e.target.value })} /></Field>
            <Field label="Vídeos — URLs de embed (uma por linha)" className="md:col-span-2"><Textarea rows={2} value={form.videos} onChange={(e) => setForm({ ...form, videos: e.target.value })} placeholder="https://www.youtube.com/embed/..." /></Field>

            <Field label="Link demo"><Input value={form.demo_url} onChange={(e) => setForm({ ...form, demo_url: e.target.value })} /></Field>
            <Field label="Link site"><Input value={form.site_url} onChange={(e) => setForm({ ...form, site_url: e.target.value })} /></Field>
            <Field label="Link WhatsApp personalizado" className="md:col-span-2"><Input value={form.whatsapp_url} onChange={(e) => setForm({ ...form, whatsapp_url: e.target.value })} placeholder="opcional — usa padrão da empresa" /></Field>

            <Field label="Meta title (SEO)"><Input value={form.meta_title} onChange={(e) => setForm({ ...form, meta_title: e.target.value })} /></Field>
            <Field label="OG image URL"><Input value={form.og_image} onChange={(e) => setForm({ ...form, og_image: e.target.value })} /></Field>
            <Field label="Meta description (SEO)" className="md:col-span-2"><Textarea rows={2} value={form.meta_description} onChange={(e) => setForm({ ...form, meta_description: e.target.value })} /></Field>

            <div className="flex items-center gap-3">
              <Switch checked={form.featured} onCheckedChange={(v) => setForm({ ...form, featured: v })} />
              <span className="text-sm">Destaque</span>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.status === 'published'} onCheckedChange={(v) => setForm({ ...form, status: v ? 'published' : 'draft' })} />
              <span className="text-sm">Publicado</span>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name || !form.category || !form.short_description}>
              {save.isPending ? 'Salvando...' : 'Salvar projeto'}
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditing(null); setForm(empty) }}>Cancelar</Button>
          </div>
        </div>
      )}

      {isLoading ? <p className="text-muted-foreground">Carregando...</p> : projects.length === 0 ? (
        <p className="text-muted-foreground text-center py-10">Nenhum projeto ainda. Clique em "Novo Projeto".</p>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <div key={p.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
              {p.cover_url && <img src={p.cover_url} alt="" className="w-14 h-14 rounded object-cover" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold truncate">{p.name}</h3>
                  {p.featured && <span className="text-[10px] font-bold uppercase text-primary bg-primary/10 px-2 py-0.5 rounded">Destaque</span>}
                  {p.status !== 'published' && <span className="text-[10px] font-bold uppercase text-muted-foreground bg-muted px-2 py-0.5 rounded">Rascunho</span>}
                </div>
                <p className="text-sm text-muted-foreground truncate">/{p.slug} — {p.category}</p>
                <p className="text-xs text-muted-foreground">{p.views_count} views · {p.clicks_demo} demo · {p.clicks_whatsapp} whatsapp</p>
              </div>
              <a href={`/projetos/${p.slug}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
                {p.status === 'published' ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </a>
              <Button variant="ghost" size="icon" onClick={() => startEdit(p)}><Pencil className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => confirm('Excluir projeto?') && del.mutate(p.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-sm text-muted-foreground mb-1 block">{label}</label>
      {children}
    </div>
  )
}
