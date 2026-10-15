import { motion } from 'framer-motion'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const faqs = [
  {
    question: 'Quanto tempo leva para ver resultados com tráfego pago?',
    answer: 'Os primeiros resultados podem aparecer já nas primeiras semanas, mas recomendamos um período mínimo de 3 meses para otimização completa das campanhas e resultados consistentes.',
  },
  {
    question: 'Vocês trabalham com contratos de fidelidade?',
    answer: 'Não exigimos fidelidade. Trabalhamos com contratos mensais porque acreditamos que nossos resultados falam por si. Você fica porque quer, não porque é obrigado.',
  },
  {
    question: 'Qual o investimento mínimo em anúncios?',
    answer: 'O investimento varia conforme o segmento e os objetivos. Na reunião de briefing, analisamos seu mercado e recomendamos o orçamento ideal para gerar retorno.',
  },
  {
    question: 'Como funciona a gestão de redes sociais?',
    answer: 'Cuidamos de tudo: planejamento de conteúdo, criação de artes e textos, agendamento de posts, interação com seguidores e relatórios mensais de desempenho.',
  },
  {
    question: 'Vocês atendem empresas de qualquer segmento?',
    answer: 'Sim! Temos experiência com diversos segmentos como e-commerce, serviços, saúde, educação, gastronomia e muito mais. Adaptamos a estratégia ao seu nicho.',
  },
  {
    question: 'Como acompanho os resultados do trabalho?',
    answer: 'Enviamos relatórios periódicos com métricas claras e objetivas. Além disso, você terá acesso a dashboards em tempo real e reuniões de alinhamento.',
  },
]

export function FAQ() {
  return (
    <div className="py-32 bg-background relative">
      <div className="container mx-auto px-6 sm:px-8 lg:px-12 max-w-3xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-primary font-semibold text-sm tracking-widest uppercase mb-4 block">FAQ</span>
          <h2 className="font-display font-extrabold text-4xl sm:text-5xl mb-6">
            Perguntas <span className="text-gradient">Frequentes</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Tire suas dúvidas sobre nossos serviços e processos.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="bg-card border border-border rounded-2xl px-6 data-[state=open]:border-primary/30"
              >
                <AccordionTrigger className="text-left font-semibold text-foreground hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </div>
  )
}
