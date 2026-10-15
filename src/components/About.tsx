import { motion } from 'framer-motion'
import { Zap, Target, Lightbulb } from 'lucide-react'

export function About() {
  const values = [
    {
      icon: Zap,
      title: 'Velocidade',
      description: 'Somos ligeiros. Implementamos estratégias com agilidade para você ver resultados rápidos.',
    },
    {
      icon: Target,
      title: 'Precisão',
      description: 'Cada real investido é otimizado. Focamos em métricas que realmente importam para o seu negócio.',
    },
    {
      icon: Lightbulb,
      title: 'Inovação',
      description: 'Estamos sempre à frente das tendências, testando e aplicando o que há de mais novo no digital.',
    },
  ]

  return (
    <div className="py-32 bg-card relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[150px]" />
      
      <div className="container mx-auto px-6 sm:px-8 lg:px-12 max-w-7xl relative z-10">
        <div className="grid lg:grid-cols-2 gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <span className="text-primary font-semibold text-sm tracking-widest uppercase mb-4 block">Sobre Nós</span>
            <h2 className="font-display font-extrabold text-4xl sm:text-5xl mb-8 leading-tight">
              Marketing digital que
              <br />
              <span className="text-gradient">gera resultado</span>
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed mb-6">
              A Ligeiro Digital nasceu com um propósito claro: ajudar empresas a crescerem no mundo digital 
              com estratégias inteligentes e execução impecável. Somos uma equipe apaixonada por dados, 
              criatividade e performance.
            </p>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Combinamos expertise técnica com visão estratégica para criar campanhas que não apenas 
              alcançam seu público, mas convertem de verdade. Seu crescimento é o nosso combustível.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="space-y-6"
          >
            {values.map((value, index) => (
              <motion.div
                key={value.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.3 + index * 0.15 }}
                className="flex gap-5 bg-background border border-border rounded-2xl p-6"
              >
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                  <value.icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg text-foreground mb-1">{value.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{value.description}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  )
}
