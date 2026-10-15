import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from './lib/auth'
import { TenantProvider } from './lib/tenant'
import { RequireAuth, RequireTenant } from './components/Guards'
import AppLayout from './components/AppLayout'
import AuthPage from './pages/AuthPage'
import ResetPassword from './pages/ResetPassword'
import AcceptInvite from './pages/AcceptInvite'
import NoAccess from './pages/NoAccess'
import Wizard from './pages/Wizard'
import Overview from './pages/Overview'
import Team from './pages/Team'
import Settings from './pages/Settings'
import Churches from './pages/Churches'
import Profile from './pages/Profile'
import { SearchX } from 'lucide-react'
import { EmptyState } from './components/ui-kit'
import Studio from './pages/Studio'
import StudioEditor from './pages/StudioEditor'
import Templates from './pages/Templates'
import Gallery from './pages/Gallery'
import BioPage from './pages/BioPage'
import Events from './pages/Events'
import Visitors from './pages/Visitors'
import AiAssistant from './pages/AiAssistant'
import Metrics from './pages/Metrics'
import Calendar from './pages/Calendar'
import ComingSoon from './pages/ComingSoon'

const SOON: [string, string, number, string][] = [
]

export default function GcApp() {
  // Tema claro do GC Digital, aplicado ao <html> para que portais (menus, diálogos) herdem as variáveis.
  useEffect(() => {
    document.documentElement.classList.add('gc-theme')
    return () => document.documentElement.classList.remove('gc-theme')
  }, [])
  return (
    <AuthProvider>
      <Toaster richColors position="top-center" />
      <Routes>
        <Route path="entrar" element={<AuthPage />} />
        <Route path="redefinir-senha" element={<ResetPassword />} />
        <Route path="*" element={
          <RequireAuth>
            <TenantProvider>
              <Routes>
                <Route path="convite/:token" element={<AcceptInvite />} />
                <Route path="sem-acesso" element={<NoAccess />} />
                <Route path="configuracao-inicial" element={<Wizard />} />
                <Route element={<RequireTenant><AppLayout /></RequireTenant>}>
                  <Route index element={<Overview />} />
                  <Route path="equipe" element={<Team />} />
                  <Route path="configuracoes" element={<Settings />} />
                  <Route path="igrejas" element={<Churches />} />
                  <Route path="perfil" element={<Profile />} />
                  <Route path="assistente" element={<AiAssistant />} />
                  <Route path="estudio" element={<Studio />} />
                  <Route path="estudio/:id" element={<StudioEditor />} />
                  <Route path="templates" element={<Templates />} />
                  <Route path="galeria" element={<Gallery />} />
                  <Route path="visitantes" element={<Visitors />} />
                  <Route path="metricas" element={<Metrics />} />
                  <Route path="calendario" element={<Calendar />} />
                  <Route path="eventos" element={<Events />} />
                  <Route path="link-na-bio" element={<BioPage />} />
                  {SOON.map(([p, t, s, d]) => <Route key={p} path={p} element={<ComingSoon title={t} stage={s} description={d} />} />)}
                  <Route path="*" element={<EmptyState icon={SearchX} title="Página não encontrada" description="O endereço acessado não existe." />} />
                </Route>
              </Routes>
            </TenantProvider>
          </RequireAuth>} />
      </Routes>
    </AuthProvider>
  )
}
