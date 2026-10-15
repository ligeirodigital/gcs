import { motion } from 'framer-motion'
import { TrendingUp, Users, Palette, BarChart3, Mail, Search } from 'lucide-react'

const services = [
  {
    icon: TrendingUp,
    title: 'Tráfego Pago',
    description: 'Google Ads, Meta Ads e TikTok Ads com estratégias otimizadas para maximizar seu retorno.',
  },
  {
    icon: Users,
    title: 'Social Media',
    description: 'Gestão completa de redes sociais com conteúdo estratégico que engaja e converte.',
  },
  {
    icon: Palette,
    title: 'Branding & Design',
    description: 'Identidade visual profissional que posiciona sua marca no topo do mercado.',
  },
  {
    icon: BarChart3,
    title: 'Análise de Dados',
    description: 'Dashboards e relatórios que transformam dados em decisões estratégicas.',
  },
  {
    icon: Mail,
    title: 'Email Marketing',
    description: 'Automações e campanhas que nutrem leads e aumentam suas vendas recorrentes.',
  },
  {
    icon: Search,
    title: 'SEO',
    description: 'Otimização para mecanismos de busca que coloca seu negócio nas primeiras posições.',
  },
]

export function Services() {
  return (
    <div className="py-32 bg-background relative">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.02] via-transparent to-transparent" />
      
      <div className="container mx-auto px-6 sm:px-8 lg:px-12 max-w-7xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <span className="text-primary font-semibold text-sm tracking-widest uppercase mb-4 block">Nossos Serviços</span>
          <h2 className="font-display font-extrabold text-4xl sm:text-5xl lg:text-6xl mb-6">
            Tudo que você precisa para
            <br />
            <span className="text-gradient">dominar o digital</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Soluções completas de marketing digital para empresas que querem crescer de verdade.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service, index) => (
            <motion.div
              key={service.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group bg-card border border-border rounded-2xl p-8 hover:border-primary/30 gentle-animation cursor-default"
            >
              <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary/20 gentle-animation">
                <service.icon className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-display font-bold text-xl mb-3 text-foreground">{service.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{service.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
