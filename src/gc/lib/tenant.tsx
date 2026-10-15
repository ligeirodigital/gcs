import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from './auth'
import { db, type AppRole, type Church, type Group, type Membership } from './db'

export interface GroupAccess { group: Group; church: Church; role: AppRole }
interface TenantState {
  loading: boolean
  error: string | null
  isPlatformAdmin: boolean
  churches: Church[]
  /** Vínculos efetivos: um por GC acessível (church_admin recebe todos os GCs da igreja). */
  access: GroupAccess[]
  active: GroupAccess | null
  setActiveGroupId: (id: string) => void
  reload: () => Promise<void>
}
const Ctx = createContext<TenantState | null>(null)
const KEY = 'gc.activeGroup'

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, error: null as string | null, isPlatformAdmin: false, churches: [] as Church[], access: [] as GroupAccess[] })
  const [activeId, setActiveId] = useState<string | null>(() => { try { return localStorage.getItem(KEY) } catch { return null } })

  const reload = useCallback(async () => {
    if (!user) return
    setState(s => ({ ...s, loading: true, error: null }))
    const [adm, ch, gr, mem] = await Promise.all([
      db.rpc('is_platform_admin'),
      db.from('churches').select('*').order('name'),
      db.from('groups').select('*').order('name'),
      db.from('memberships').select('id, user_id, church_id, group_id, role').eq('user_id', user.id),
    ])
    const err = ch.error ?? gr.error ?? mem.error
    if (err) { setState(s => ({ ...s, loading: false, error: err.message })); return }
    const churches = (ch.data ?? []) as Church[]
    const groups = (gr.data ?? []) as Group[]
    const memberships = (mem.data ?? []) as Membership[]
    const isPlatformAdmin = adm.data === true
    const access: GroupAccess[] = []
    for (const g of groups) {
      const church = churches.find(c => c.id === g.church_id)
      if (!church) continue
      const direct = memberships.find(m => m.group_id === g.id)
      const churchAdmin = isPlatformAdmin || memberships.some(m => m.group_id === null && m.church_id === g.church_id)
      const role: AppRole | null = churchAdmin ? 'church_admin' : direct?.role ?? null
      if (role) access.push({ group: g, church, role })
    }
    setState({ loading: false, error: null, isPlatformAdmin, churches, access })
  }, [user])

  useEffect(() => { void reload() }, [reload])

  const active = useMemo(
    () => state.access.find(a => a.group.id === activeId) ?? state.access[0] ?? null,
    [state.access, activeId])

  const setActiveGroupId = (id: string) => {
    setActiveId(id)
    try { localStorage.setItem(KEY, id) } catch { /* armazenamento indisponível */ }
  }
  return <Ctx.Provider value={{ ...state, active, setActiveGroupId, reload }}>{children}</Ctx.Provider>
}

export function useTenant() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useTenant fora do TenantProvider')
  return c
}
