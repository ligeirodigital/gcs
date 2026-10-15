import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { useTenant } from '../lib/tenant'
import { ErrorState, LoadingState } from './ui-kit'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <LoadingState />
  if (!session) return <Navigate to="/app/entrar" replace state={{ from: loc.pathname + loc.search }} />
  return <>{children}</>
}

/** Encaminha para o assistente ou para a tela de "sem acesso" quando necessário. */
export function RequireTenant({ children }: { children: ReactNode }) {
  const t = useTenant()
  const loc = useLocation()
  if (t.loading) return <LoadingState label="Carregando seus grupos…" />
  if (t.error) return <div className="p-6"><ErrorState message={`Não foi possível carregar seus dados. ${t.error}`} onRetry={() => void t.reload()} /></div>
  const canSetUp = t.isPlatformAdmin || t.churches.length > 0
  if (!t.active) {
    if (canSetUp) return <Navigate to="/app/configuracao-inicial" replace />
    return <Navigate to="/app/sem-acesso" replace />
  }
  const needsOnboarding = !t.active.group.onboarding_completed_at && (t.active.role === 'church_admin' || t.active.role === 'gc_leader')
  if (needsOnboarding && loc.pathname !== '/app/configuracao-inicial') return <Navigate to="/app/configuracao-inicial" replace />
  return <>{children}</>
}
