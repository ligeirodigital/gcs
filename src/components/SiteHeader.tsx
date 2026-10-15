import { motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import logoDark from '@/assets/logo-dark.png.asset.json'

export function SiteHeader() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const location = useLocation()
  const isHome = location.pathname === '/'

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : 'unset'
    return () => { document.body.style.overflow = 'unset' }
  }, [isMobileMenuOpen])

  const anchor = (hash: string) => (isHome ? hash : `/${hash}`)

  const navLinks = [
    { label: 'Serviços', href: anchor('#services') },
    { label: 'Sobre', href: anchor('#about') },
    { label: 'Portfólio', href: anchor('#portfolio') },
    { label: 'Projetos', href: '/projetos', isRoute: true },
    { label: 'Contato', href: anchor('#contact') },
  ]

  return (
    <>
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="fixed top-0 left-0 right-0 z-50"
      >
        <div className={`w-full px-6 sm:px-8 lg:px-12 py-4 gentle-animation ${
          isScrolled || !isHome ? 'bg-background/90 backdrop-blur-xl border-b border-border' : ''
        }`}>
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <Link to="/" className="cursor-pointer">
              <motion.img whileHover={{ scale: 1.05 }} src={logoDark.url} alt="Ligeiro Digital" className="h-10 w-auto" />
            </Link>

            <div className="hidden md:flex items-center gap-8">
              {navLinks.map(link => (
                link.isRoute ? (
                  <Link key={link.href} to={link.href} className="text-muted-foreground hover:text-foreground gentle-animation text-sm font-medium">
                    {link.label}
                  </Link>
                ) : (
                  <a key={link.href} href={link.href} className="text-muted-foreground hover:text-foreground gentle-animation text-sm font-medium">
                    {link.label}
                  </a>
                )
              ))}
              <motion.a
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                href={anchor('#contact')}
                className="bg-primary text-primary-foreground font-semibold px-6 py-2.5 rounded-lg text-sm"
              >
                Fale Conosco
              </motion.a>
            </div>

            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden p-2 text-foreground">
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </motion.nav>

      {isMobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-background z-40 flex flex-col items-center justify-center gap-8"
        >
          {navLinks.map(link => (
            link.isRoute ? (
              <Link key={link.href} to={link.href} className="text-2xl font-display font-bold text-foreground" onClick={() => setIsMobileMenuOpen(false)}>
                {link.label}
              </Link>
            ) : (
              <a key={link.href} href={link.href} className="text-2xl font-display font-bold text-foreground" onClick={() => setIsMobileMenuOpen(false)}>
                {link.label}
              </a>
            )
          ))}
          <a href={anchor('#contact')} className="bg-primary text-primary-foreground font-semibold px-8 py-3 rounded-lg" onClick={() => setIsMobileMenuOpen(false)}>
            Fale Conosco
          </a>
        </motion.div>
      )}
    </>
  )
}
