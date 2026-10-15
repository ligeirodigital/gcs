import { motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export function Portfolio() {
  const { data: cases = [], isLoading } = useQuery({
    queryKey: ['portfolio-cases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('portfolio_cases')
        .select('*')
        .order('display_order', { ascending: true })
      if (error) throw error
      return data
    },
  })

  return (
    <div className="py-32 bg-background relative">
      <div className="container mx-auto px-6 sm:px-8 lg:px-12 max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <span className="text-primary font-semibold text-sm tracking-widest uppercase mb-4 block">Cases de Sucesso</span>
          <h2 className="font-display font-extrabold text-4xl sm:text-5xl lg:text-6xl mb-6">
            Resultados que
            <br />
            <span className="text-gradient">falam por si</span>
          </h2>
        </motion.div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-card border border-border rounded-2xl p-8 animate-pulse">
                <div className="h-4 bg-muted rounded w-1/3 mb-6" />
                <div className="h-6 bg-muted rounded w-2/3 mb-2" />
                <div className="h-4 bg-muted rounded w-full mb-6" />
                <div className="h-5 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {cases.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="group bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/30 gentle-animation"
              >
                {item.image_url && (
                  <div className="w-full h-48 overflow-hidden">
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 gentle-animation"
                    />
                  </div>
                )}
                <div className="p-8">
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-3">
                      {item.logo_url && (
                        <img
                          src={item.logo_url}
                          alt={`${item.title} logo`}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      )}
                      <span className="text-primary text-sm font-medium bg-primary/10 px-3 py-1 rounded-full">{item.category}</span>
                    </div>
                    <ArrowUpRight className="w-5 h-5 text-muted-foreground group-hover:text-primary gentle-animation" />
                  </div>
                  <h3 className="font-display font-bold text-2xl text-foreground mb-2">{item.title}</h3>
                  <p className="text-muted-foreground mb-6">{item.description}</p>
                  <div className="pt-4 border-t border-border">
                    <span className="font-display font-bold text-xl text-primary">{item.result}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
