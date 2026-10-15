import { Hero } from './components/Hero'
import { Services } from './components/Services'
import { About } from './components/About'
import { Portfolio } from './components/Portfolio'
import { Contact } from './components/Contact'
import { FAQ } from './components/FAQ'
import { Footer } from './components/Footer'
import { WhatsAppButton } from './components/WhatsAppButton'

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="relative" role="main">
        <section id="hero" aria-label="Hero">
          <Hero />
        </section>
        <section id="services" aria-label="Serviços">
          <Services />
        </section>
        <section id="about" aria-label="Sobre">
          <About />
        </section>
        <section id="portfolio" aria-label="Portfólio">
          <Portfolio />
        </section>
        <section id="faq" aria-label="FAQ">
          <FAQ />
        </section>
        <section id="contact" aria-label="Contato">
          <Contact />
        </section>
      </main>
      <Footer />
      <WhatsAppButton />
    </div>
  )
}
