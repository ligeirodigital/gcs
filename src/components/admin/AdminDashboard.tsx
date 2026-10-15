import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { FolderKanban, Eye, MessageCircle, ExternalLink, Star, Package, Briefcase } from 'lucide-react'

export function AdminDashboard() {
  const { data } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: async () => {
      const [projects, affiliates, cases] = await Promise.all([
        supabase.from('projects').select('id,status,featured,views_count,clicks_demo,clicks_whatsapp'),
        supabase.from('affiliate_products').select('id,status,featured,clicks_count'),
        supabase.from('portfolio_cases').select('id'),
      ])
      const p = projects.data || []
      const a = affiliates.data || []
      return {
        projectsTotal: p.length,
        projectsPublished: p.filter(x => x.status === 'published').length,
        projectsFeatured: p.filter(x => x.featured).length,
        views: p.reduce((s, x) => s + (x.views_count || 0), 0),
        clicksDemo: p.reduce((s, x) => s + (x.clicks_demo || 0), 0),
        clicksWhatsapp: p.reduce((s, x) => s + (x.clicks_whatsapp || 0), 0),
        affiliatesTotal: a.length,
        affiliatesClicks: a.reduce((s, x) => s + (x.clicks_count || 0), 0),
        casesTotal: cases.data?.length || 0,
      }
    },
  })

  const stats = [
    { label: 'Projetos', value: data?.projectsTotal ?? '-', sub: `${data?.projectsPublished ?? 0} publicados`, icon: FolderKanban },
    { label: 'Destaques', value: data?.projectsFeatured ?? '-', sub: 'projetos em destaque', icon: Star },
    { label: 'Cases', value: data?.casesTotal ?? '-', sub: 'cases do portfólio', icon: Briefcase },
    { label: 'Afiliados', value: data?.affiliatesTotal ?? '-', sub: 'produtos', icon: Package },
    { label: 'Visualizações', value: data?.views ?? '-', sub: 'páginas de projeto', icon: Eye },
    { label: 'Cliques em demo', value: data?.clicksDemo ?? '-', sub: 'links de demonstração', icon: ExternalLink },
    { label: 'Cliques WhatsApp', value: data?.clicksWhatsapp ?? '-', sub: 'em projetos', icon: MessageCircle },
    { label: 'Cliques afiliados', value: data?.affiliatesClicks ?? '-', sub: 'total', icon: ExternalLink },
  ]

  return (
    <div>
      <h2 className="font-display font-bold text-xl mb-6">Visão Geral</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</span>
              <s.icon className="w-4 h-4 text-primary" />
            </div>
            <div className="font-display font-extrabold text-3xl text-foreground">{s.value}</div>
            <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
