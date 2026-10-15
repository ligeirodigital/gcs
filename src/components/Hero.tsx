import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { SiteHeader } from './SiteHeader'

export function Hero() {
  return (
    <div className="relative min-h-screen flex items-center bg-background overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'linear-gradient(rgba(255,109,0,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,109,0,0.5) 1px, transparent 1px)',
        backgroundSize: '60px 60px'
      }} />

      {/* Glow orbs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 -right-32 w-80 h-80 bg-primary/5 rounded-full blur-[100px]" />

      <SiteHeader />

      {/* Hero Content */}
      <div className="container mx-auto px-6 sm:px-8 lg:px-12 relative z-10 pt-32">
        <div className="max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 mb-8">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <span className="text-sm text-primary font-medium">Assessoria de Marketing Digital</span>
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="font-display font-extrabold text-5xl sm:text-6xl lg:text-8xl leading-[0.95] mb-8"
          >
            Acelere seus
            <br />
            <span className="text-gradient">resultados</span>
            <br />
            digitais.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="text-lg sm:text-xl text-muted-foreground max-w-2xl mb-12 leading-relaxed"
          >
            Estratégias de marketing digital que transformam presença online em crescimento real. 
            Tráfego pago, social media, branding e muito mais.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="flex flex-wrap gap-4"
          >
            <motion.a
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              href="#contact"
              className="bg-primary text-primary-foreground font-bold px-8 py-4 rounded-xl text-lg flex items-center gap-2 glow-primary"
            >
              Quero Crescer <ArrowRight className="w-5 h-5" />
            </motion.a>
            <motion.a
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              href="#services"
              className="border border-border text-foreground font-semibold px-8 py-4 rounded-xl text-lg hover:bg-secondary gentle-animation"
            >
              Ver Serviços
            </motion.a>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1 }}
            className="flex flex-wrap gap-12 mt-20 pt-12 border-t border-border"
          >
            {[
              { value: '150+', label: 'Clientes Atendidos' },
              { value: '3x', label: 'ROI Médio' },
              { value: 'R$10M+', label: 'Em Vendas Geradas' },
            ].map(stat => (
              <div key={stat.label}>
                <div className="font-display font-extrabold text-4xl text-primary mb-1">{stat.value}</div>
                <div className="text-muted-foreground text-sm">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  )
}
