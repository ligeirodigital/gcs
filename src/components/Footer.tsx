import { Link } from 'react-router-dom'
import logoDark from '@/assets/logo-dark.png.asset.json'

export function Footer() {
  return (
    <footer className="py-12 bg-background border-t border-border">
      <div className="container mx-auto px-6 sm:px-8 lg:px-12 max-w-7xl">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <img src={logoDark.url} alt="Ligeiro Digital" className="h-10 w-auto" />
          <div className="flex items-center gap-6 flex-wrap justify-center">
            <a href="/#services" className="text-muted-foreground hover:text-foreground text-sm gentle-animation">Serviços</a>
            <a href="/#about" className="text-muted-foreground hover:text-foreground text-sm gentle-animation">Sobre</a>
            <a href="/#portfolio" className="text-muted-foreground hover:text-foreground text-sm gentle-animation">Portfólio</a>
            <Link to="/projetos" className="text-muted-foreground hover:text-foreground text-sm gentle-animation">Projetos</Link>
            <a href="/#contact" className="text-muted-foreground hover:text-foreground text-sm gentle-animation">Contato</a>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://instagram.com/ligeirodigital" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary text-sm gentle-animation">@ligeirodigital</a>
            <span className="text-muted-foreground text-sm">© 2025 Ligeiro Digital</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
