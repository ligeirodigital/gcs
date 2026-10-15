import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Building2, Calendar, CalendarDays, Check, ChevronsUpDown, Handshake, Image, LayoutDashboard, Link2, LogOut,
  Menu, Palette, PenSquare, Settings, Users, BarChart3, UserCircle, type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useAuth } from '../lib/auth'
import { useTenant } from '../lib/tenant'
import { brandingUrl } from '../lib/db'
import { ROLE_LABEL, can } from '../lib/roles'

interface Item { to: string; label: string; icon: LucideIcon; soon?: boolean; end?: boolean }
const NAV: Item[] = [
  { to: '/app', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/app/estudio', label: 'Estúdio de conteúdo', icon: PenSquare },
  { to: '/app/templates', label: 'Templates', icon: Palette },
  { to: '/app/galeria', label: 'Galeria de fotos', icon: Image },
  { to: '/app/calendario', label: 'Calendário editorial', icon: CalendarDays },
  { to: '/app/eventos', label: 'Encontros e eventos', icon: Calendar },
  { to: '/app/link-na-bio', label: 'Link na bio', icon: Link2 },
  { to: '/app/visitantes', label: 'Visitantes e acolhimento', icon: Handshake },
  { to: '/app/metricas', label: 'Métricas', icon: BarChart3 },
  { to: '/app/equipe', label: 'Equipe e permissões', icon: Users },
  { to: '/app/configuracoes', label: 'Configurações', icon: Settings },
]

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const { active, isPlatformAdmin } = useTenant()
  const items = [...NAV]
  if (isPlatformAdmin || can.manageChurch(active?.role)) items.splice(items.length - 1, 0, { to: '/app/igrejas', label: 'Igrejas e GCs', icon: Building2 })
  return (
    <nav aria-label="Principal" className="flex flex-col gap-0.5 p-3">
      {items.map(i => (
        <NavLink key={i.to} to={i.to} end={i.end} onClick={onNavigate}
          className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isActive ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
          <i.icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{i.label}</span>
          {i.soon && <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">em breve</span>}
        </NavLink>
      ))}
    </nav>
  )
}

function GroupSwitcher() {
  const { access, active, setActiveGroupId } = useTenant()
  if (!active) return null
  const logo = brandingUrl(active.group.logo_path)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto max-w-[16rem] gap-2 px-2 py-1.5" aria-label="Trocar de GC">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md text-xs font-semibold" style={{ background: active.group.primary_color }}>
            {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : active.group.name.slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0 text-left"><span className="block truncate text-sm font-medium">{active.group.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{active.church.name}</span></span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Seus grupos</DropdownMenuLabel>
        {access.map(a => (
          <DropdownMenuItem key={a.group.id} onSelect={() => setActiveGroupId(a.group.id)} className="gap-2">
            <span className="min-w-0 flex-1"><span className="block truncate">{a.group.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{a.church.name} · {ROLE_LABEL[a.role]}</span></span>
            {a.group.id === active.group.id && <Check className="h-4 w-4" aria-label="Ativo" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function AppLayout() {
  const [open, setOpen] = useState(false)
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="gc-theme min-h-screen bg-background text-foreground">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2">Pular para o conteúdo</a>
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 items-center border-b border-border px-5">
          <span className="text-base font-semibold tracking-tight">GC <span className="text-primary-ink">Digital</span></span>
        </div>
        <div className="flex-1 overflow-y-auto"><Nav /></div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu className="h-5 w-5" /></Button>
          <GroupSwitcher />
          <div className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2" aria-label="Menu da conta"><UserCircle className="h-5 w-5" aria-hidden />
                <span className="hidden max-w-[10rem] truncate sm:inline">{profile?.display_name || user?.email}</span></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="max-w-[16rem] truncate">{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate('/app/perfil')}>Meu perfil</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void signOut().then(() => navigate('/app/entrar'))}><LogOut className="mr-2 h-4 w-4" /> Sair</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-72 p-0 gc-theme bg-card text-foreground">
            <SheetTitle className="flex h-16 items-center border-b border-border px-5 text-base font-semibold">GC Digital</SheetTitle>
            <Nav onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6"><Outlet /></main>
      </div>
    </div>
  )
}
