import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { Search, ArrowRight, ExternalLink, MessageCircle } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { SiteHeader } from '@/components/SiteHeader'
import { Footer } from '@/components/Footer'
import { WhatsAppButton } from '@/components/WhatsAppButton'
import { Input } from '@/components/ui/input'

const WHATSAPP = 'https://wa.me/5585992753337'

export default function Projects() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('Todos')

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects', 'public'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('status', 'published')
        .order('featured', { ascending: false })
        .order('display_order', { ascending: true })
      if (error) throw error
      return data
    },
  })

  const { data: affiliates = [] } = useQuery({
    queryKey: ['affiliate_products', 'public'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('affiliate_products')
        .select('*')
        .eq('status', 'published')
        .order('featured', { ascending: false })
        .order('display_order', { ascending: true })
      if (error) throw error
      return data
    },
  })

  const categories = useMemo(() => {
    const set = new Set<string>()
    projects.forEach((p) => p.category && set.add(p.category))
    return ['Todos', ...Array.from(set)]
  }, [projects])

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      const matchesCat = category === 'Todos' || p.category === category
      const matchesSearch = !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.short_description?.toLowerCase().includes(search.toLowerCase())
      return matchesCat && matchesSearch
    })
  }, [projects, category, search])

  const handleAffiliateClick = async (id: string, url: string) => {
    supabase.rpc('increment_affiliate_click', { _affiliate_id: id })
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Projetos e Soluções — Ligeiro Digital</title>
        <meta name="description" content="Conheça os sistemas, sites, SaaS e soluções digitais desenvolvidos pela Ligeiro Digital." />
        <link rel="canonical" href="https://ligeirodigital.lovable.app/projetos" />
        <meta property="og:title" content="Projetos e Soluções — Ligeiro Digital" />
        <meta property="og:description" content="Vitrine de sistemas, sites, SaaS e aplicativos desenvolvidos pela Ligeiro Digital." />
        <meta property="og:url" content="https://ligeirodigital.lovable.app/projetos" />
        <meta property="og:type" content="website" />
      </Helmet>

      <SiteHeader />

      {/* Hero */}
      <section className="relative pt-40 pb-20 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(rgba(255,109,0,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,109,0,0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px'
        }} />
        <div className="absolute top-0 -left-32 w-96 h-96 bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 -right-32 w-80 h-80 bg-primary/5 rounded-full blur-[100px]" />

        <div className="container mx-auto px-6 sm:px-8 lg:px-12 max-w-7xl relative z-10">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 mb-8">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <span className="text-sm text-primary font-medium">Portfólio de Projetos</span>
            </div>
            <h1 className="font-display font-extrabold text-5xl sm:text-6xl lg:text-7xl leading-[0.95] mb-6 max-w-4xl">
              Conheça nossas
              <br />
              <span className="text-gradient">soluções digitais</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
              Sistemas, sites, SaaS, aplicativos e landing pages criados para gerar resultado real.
            </p>
            <div className="flex flex-wrap gap-4">
              <a href="/#contact" className="bg-primary text-primary-foreground font-bold px-8 py-4 rounded-xl text-lg flex items-center gap-2 glow-primary">
                Solicitar Orçamento <ArrowRight className="w-5 h-5" />
              </a>
              <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="border border-border text-foreground font-semibold px-8 py-4 rounded-xl text-lg hover:bg-secondary gentle-animation flex items-center gap-2">
                <MessageCircle className="w-5 h-5" /> Falar no WhatsApp
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Filters */}
      <section className="py-8 border-y border-border bg-card/30 sticky top-[72px] z-30 backdrop-blur-xl">
        <div className="container mx-auto px-6 sm:px-8 lg:px-12 max-w-7xl">
          <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar projeto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 -mx-6 px-6 md:mx-0 md:px-0">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap gentle-animation border ${
                    category === cat
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-primary/40'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Projects grid */}
      <section className="py-20">
        <div className="container mx-auto px-6 sm:px-8 lg:px-12 max-w-7xl">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="bg-card border border-border rounded-2xl h-96 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              Nenhum projeto encontrado.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((p, index) => (
                <motion.article
                  key={p.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.05 }}
                  className="group bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/30 gentle-animation flex flex-col"
                >
                  <Link to={`/projetos/${p.slug}`} className="block">
                    <div className="w-full h-48 overflow-hidden bg-secondary relative">
                      {p.cover_url ? (
                        <img
                          src={p.cover_url}
                          alt={p.name}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover group-hover:scale-105 gentle-animation"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">Sem imagem</div>
                      )}
                      {p.tags?.length > 0 && (
                        <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
                          {p.tags.slice(0, 2).map((t) => (
                            <span key={t} className="text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground px-2 py-1 rounded">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </Link>
                  <div className="p-6 flex-1 flex flex-col">
                    <div className="flex items-center gap-3 mb-3">
                      {p.logo_url && (
                        <img src={p.logo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                      )}
                      <span className="text-primary text-xs font-medium bg-primary/10 px-2.5 py-1 rounded-full">{p.category}</span>
                    </div>
                    <Link to={`/projetos/${p.slug}`}>
                      <h3 className="font-display font-bold text-xl text-foreground mb-2 hover:text-primary gentle-animation">{p.name}</h3>
                    </Link>
                    <p className="text-muted-foreground text-sm mb-4 flex-1">{p.short_description}</p>
                    {p.technologies?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {p.technologies.slice(0, 4).map((t) => (
                          <span key={t} className="text-[10px] text-muted-foreground bg-secondary px-2 py-1 rounded">{t}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 pt-4 border-t border-border">
                      <Link
                        to={`/projetos/${p.slug}`}
                        className="flex-1 text-center bg-primary text-primary-foreground text-sm font-semibold py-2 rounded-lg hover:opacity-90 gentle-animation"
                      >
                        Ver detalhes
                      </Link>
                      {p.demo_url && (
                        <a
                          href={p.demo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => supabase.rpc('increment_project_metric', { _project_id: p.id, _kind: 'demo' })}
                          className="p-2 border border-border rounded-lg hover:border-primary hover:text-primary gentle-animation"
                          aria-label="Ver demo"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Affiliates */}
      {affiliates.length > 0 && (
        <section className="py-20 border-t border-border bg-card/30">
          <div className="container mx-auto px-6 sm:px-8 lg:px-12 max-w-7xl">
            <div className="text-center mb-14">
              <span className="text-primary font-semibold text-sm tracking-widest uppercase mb-4 block">Recomendados</span>
              <h2 className="font-display font-extrabold text-3xl sm:text-4xl lg:text-5xl mb-4">
                Ferramentas que <span className="text-gradient">recomendamos</span>
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">Produtos e plataformas que usamos e indicamos para acelerar seu negócio.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {affiliates.map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  className="bg-card border border-border rounded-2xl p-6 hover:border-primary/30 gentle-animation flex flex-col"
                >
                  {a.image_url && (
                    <div className="w-16 h-16 mb-4 rounded-xl overflow-hidden bg-secondary">
                      <img src={a.image_url} alt={a.name} loading="lazy" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <span className="text-xs text-primary font-medium mb-1">{a.category}</span>
                  <h3 className="font-display font-bold text-lg mb-2">{a.name}</h3>
                  {a.company && <p className="text-xs text-muted-foreground mb-2">{a.company}</p>}
                  <p className="text-muted-foreground text-sm mb-4 flex-1">{a.description}</p>
                  {a.price && <p className="font-semibold text-foreground mb-3">{a.price}</p>}
                  <button
                    onClick={() => handleAffiliateClick(a.id, a.affiliate_url)}
                    className="w-full bg-primary text-primary-foreground text-sm font-semibold py-2 rounded-lg hover:opacity-90 gentle-animation flex items-center justify-center gap-2"
                  >
                    Conhecer <ExternalLink className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
      <WhatsAppButton />
    </div>
  )
}
