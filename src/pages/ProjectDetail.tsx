import { useEffect } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { motion } from 'framer-motion'
import { ArrowLeft, ExternalLink, MessageCircle, Check, Globe } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { SiteHeader } from '@/components/SiteHeader'
import { Footer } from '@/components/Footer'
import { WhatsAppButton } from '@/components/WhatsAppButton'

const WHATSAPP = 'https://wa.me/5585992753337'

export default function ProjectDetail() {
  const { slug } = useParams<{ slug: string }>()

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('slug', slug!)
        .eq('status', 'published')
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!slug,
  })

  useEffect(() => {
    if (project?.id) {
      supabase.rpc('increment_project_metric', { _project_id: project.id, _kind: 'view' })
    }
  }, [project?.id])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="pt-40 container mx-auto px-6 max-w-5xl animate-pulse">
          <div className="h-8 w-32 bg-muted rounded mb-6" />
          <div className="h-14 w-2/3 bg-muted rounded mb-4" />
          <div className="h-96 w-full bg-muted rounded-2xl" />
        </div>
      </div>
    )
  }

  if (error || !project) {
    return <Navigate to="/projetos" replace />
  }

  const trackClick = (kind: 'demo' | 'whatsapp') => {
    supabase.rpc('increment_project_metric', { _project_id: project.id, _kind: kind })
  }

  const whatsappUrl = project.whatsapp_url || `${WHATSAPP}?text=${encodeURIComponent(`Olá! Tenho interesse no projeto ${project.name}.`)}`

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>{project.meta_title || `${project.name} — Ligeiro Digital`}</title>
        <meta name="description" content={project.meta_description || project.short_description} />
        <link rel="canonical" href={`https://ligeirodigital.lovable.app/projetos/${project.slug}`} />
        <meta property="og:title" content={project.meta_title || project.name} />
        <meta property="og:description" content={project.meta_description || project.short_description} />
        <meta property="og:url" content={`https://ligeirodigital.lovable.app/projetos/${project.slug}`} />
        <meta property="og:type" content="article" />
        {(project.og_image || project.cover_url) && (
          <meta property="og:image" content={project.og_image || project.cover_url} />
        )}
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CreativeWork",
          "name": project.name,
          "description": project.short_description,
          "image": project.cover_url,
          "url": `https://ligeirodigital.lovable.app/projetos/${project.slug}`,
          "creator": { "@type": "Organization", "name": "Ligeiro Digital" }
        })}</script>
      </Helmet>

      <SiteHeader />

      <article className="pt-32 pb-20">
        {/* Header */}
        <div className="container mx-auto px-6 sm:px-8 lg:px-12 max-w-6xl">
          <Link to="/projetos" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary gentle-animation mb-8 text-sm">
            <ArrowLeft className="w-4 h-4" /> Voltar aos projetos
          </Link>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              {project.logo_url && (
                <img src={project.logo_url} alt="" className="w-12 h-12 rounded-xl object-cover" />
              )}
              <span className="text-primary text-sm font-medium bg-primary/10 px-3 py-1 rounded-full">{project.category}</span>
              {project.tags?.map((t: string) => (
                <span key={t} className="text-xs font-bold uppercase tracking-wider bg-secondary text-foreground px-2.5 py-1 rounded">{t}</span>
              ))}
            </div>
            <h1 className="font-display font-extrabold text-4xl sm:text-5xl lg:text-6xl leading-tight mb-4">
              {project.name}
            </h1>
            <p className="text-lg text-muted-foreground max-w-3xl mb-8">{project.short_description}</p>

            <div className="flex flex-wrap gap-3 mb-12">
              {project.demo_url && (
                <a
                  href={project.demo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackClick('demo')}
                  className="bg-primary text-primary-foreground font-semibold px-6 py-3 rounded-xl flex items-center gap-2 glow-primary"
                >
                  Acessar Demo <ExternalLink className="w-4 h-4" />
                </a>
              )}
              {project.site_url && (
                <a
                  href={project.site_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-border text-foreground font-semibold px-6 py-3 rounded-xl flex items-center gap-2 hover:bg-secondary gentle-animation"
                >
                  <Globe className="w-4 h-4" /> Site oficial
                </a>
              )}
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackClick('whatsapp')}
                className="bg-[#25D366] text-white font-semibold px-6 py-3 rounded-xl flex items-center gap-2 hover:opacity-90 gentle-animation"
              >
                <MessageCircle className="w-4 h-4" /> Solicitar orçamento
              </a>
            </div>
          </motion.div>

          {/* Cover */}
          {project.cover_url && (
            <div className="rounded-2xl overflow-hidden border border-border mb-12">
              <img src={project.cover_url} alt={project.name} className="w-full h-auto" />
            </div>
          )}

          {/* Full description */}
          {project.full_description && (
            <section className="mb-16">
              <h2 className="font-display font-bold text-2xl mb-4">Sobre o projeto</h2>
              <div className="text-muted-foreground leading-relaxed whitespace-pre-line max-w-3xl">
                {project.full_description}
              </div>
            </section>
          )}

          {/* Features + benefits */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
            {project.features?.length > 0 && (
              <section>
                <h2 className="font-display font-bold text-2xl mb-4">Funcionalidades</h2>
                <ul className="space-y-2">
                  {project.features.map((f: string) => (
                    <li key={f} className="flex items-start gap-3 text-muted-foreground">
                      <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {project.benefits?.length > 0 && (
              <section>
                <h2 className="font-display font-bold text-2xl mb-4">Benefícios</h2>
                <ul className="space-y-2">
                  {project.benefits.map((b: string) => (
                    <li key={b} className="flex items-start gap-3 text-muted-foreground">
                      <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* Technologies */}
          {project.technologies?.length > 0 && (
            <section className="mb-16">
              <h2 className="font-display font-bold text-2xl mb-4">Tecnologias</h2>
              <div className="flex flex-wrap gap-2">
                {project.technologies.map((t: string) => (
                  <span key={t} className="bg-secondary text-foreground px-3 py-1.5 rounded-lg text-sm">{t}</span>
                ))}
              </div>
            </section>
          )}

          {/* Gallery */}
          {project.gallery?.length > 0 && (
            <section className="mb-16">
              <h2 className="font-display font-bold text-2xl mb-6">Galeria</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {project.gallery.map((img: string, i: number) => (
                  <a key={i} href={img} target="_blank" rel="noopener noreferrer" className="rounded-xl overflow-hidden border border-border group">
                    <img src={img} alt={`${project.name} — ${i + 1}`} loading="lazy" className="w-full h-56 object-cover group-hover:scale-105 gentle-animation" />
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Videos */}
          {project.videos?.length > 0 && (
            <section className="mb-16">
              <h2 className="font-display font-bold text-2xl mb-6">Vídeos</h2>
              <div className="space-y-6">
                {project.videos.map((v: string, i: number) => (
                  <div key={i} className="aspect-video rounded-xl overflow-hidden border border-border">
                    <iframe src={v} title={`Vídeo ${i + 1}`} className="w-full h-full" allowFullScreen />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Clients */}
          {project.clients?.length > 0 && (
            <section className="mb-16">
              <h2 className="font-display font-bold text-2xl mb-6">Clientes que usam</h2>
              <div className="flex flex-wrap gap-3">
                {project.clients.map((c: string) => (
                  <span key={c} className="bg-card border border-border text-foreground px-4 py-2 rounded-lg">{c}</span>
                ))}
              </div>
            </section>
          )}

          {/* CTA */}
          <section className="bg-card border border-border rounded-2xl p-8 md:p-12 text-center">
            <h2 className="font-display font-bold text-3xl mb-4">Quer algo assim para o seu negócio?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-8">Fale com a gente e receba uma proposta personalizada em poucas horas.</p>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackClick('whatsapp')}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-8 py-4 rounded-xl glow-primary"
            >
              <MessageCircle className="w-5 h-5" /> Solicitar orçamento
            </a>
          </section>
        </div>
      </article>

      <Footer />
      <WhatsAppButton />
    </div>
  )
}
