import { motion } from 'framer-motion'
import { Send, Phone, Mail, MapPin, Instagram } from 'lucide-react'
import { useState } from 'react'

export function Contact() {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', message: '' })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const whatsappMsg = encodeURIComponent(
      `Olá! Meu nome é ${formData.name}. ${formData.message}\n\nEmail: ${formData.email}\nTelefone: ${formData.phone}`
    )
    window.open(`https://wa.me/5585992753337?text=${whatsappMsg}`, '_blank')
  }

  return (
    <div className="py-32 bg-card relative overflow-hidden">
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[120px]" />

      <div className="container mx-auto px-6 sm:px-8 lg:px-12 max-w-7xl relative z-10">
        <div className="grid lg:grid-cols-2 gap-16">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className="text-primary font-semibold text-sm tracking-widest uppercase mb-4 block">Contato</span>
            <h2 className="font-display font-extrabold text-4xl sm:text-5xl mb-8 leading-tight">
              Vamos acelerar seu
              <br />
              <span className="text-gradient">crescimento?</span>
            </h2>
            <p className="text-muted-foreground text-lg mb-12 leading-relaxed">
              Entre em contato e descubra como podemos transformar sua presença digital em resultados concretos.
            </p>

            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                  <Phone className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">WhatsApp</div>
                  <div className="font-semibold text-foreground">(85) 99275-3337</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Email</div>
                  <div className="font-semibold text-foreground">ligeirodigital@gmail.com</div>
                </div>
              </div>
              <a href="https://instagram.com/ligeirodigital" target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 group">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                  <Instagram className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Instagram</div>
                  <div className="font-semibold text-foreground group-hover:text-primary gentle-animation">@ligeirodigital</div>
                </div>
              </a>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Localização</div>
                  <div className="font-semibold text-foreground">Brasil</div>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.form
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            onSubmit={handleSubmit}
            className="bg-background border border-border rounded-2xl p-8 space-y-6"
          >
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Nome</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-foreground focus:outline-none focus:border-primary gentle-animation"
                placeholder="Seu nome"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Email</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-foreground focus:outline-none focus:border-primary gentle-animation"
                  placeholder="seu@email.com"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Telefone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-foreground focus:outline-none focus:border-primary gentle-animation"
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Mensagem</label>
              <textarea
                required
                rows={4}
                value={formData.message}
                onChange={e => setFormData(p => ({ ...p, message: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-foreground focus:outline-none focus:border-primary gentle-animation resize-none"
                placeholder="Conte sobre seu projeto..."
              />
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-xl text-lg flex items-center justify-center gap-2 glow-primary"
            >
              Enviar pelo WhatsApp <Send className="w-5 h-5" />
            </motion.button>
          </motion.form>
        </div>
      </div>
    </div>
  )
}
