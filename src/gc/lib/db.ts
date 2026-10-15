import { supabase } from '@/integrations/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'

// O arquivo gerado src/integrations/supabase/types.ts ainda não conhece as tabelas do GC Digital.
// Depois de aplicar as migrations, rode `supabase gen types typescript` para substituí-lo
// e troque este cliente por `supabase` tipado.
export const db = supabase as unknown as SupabaseClient

export type AppRole = 'church_admin' | 'gc_leader' | 'communicator' | 'welcome_team' | 'viewer'

export interface Church {
  id: string; name: string; slug: string; logo_path: string | null; primary_color: string | null
  website_url: string | null; timezone: string
}
export interface Group {
  id: string; church_id: string; name: string; slug: string; description: string | null
  logo_path: string | null; cover_path: string | null; primary_color: string; secondary_color: string
  address: string | null; meeting_weekday: number | null; meeting_time: string | null; timezone: string
  onboarding_completed_at: string | null; require_approval?: boolean
}
export interface Membership { id: string; user_id: string; church_id: string; group_id: string | null; role: AppRole }
export interface Profile { id: string; display_name: string; phone: string | null }

export function brandingUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return supabase.storage.from('branding').getPublicUrl(path).data.publicUrl
}

/** Traduz erros do Postgres/Supabase em mensagens compreensíveis. */
export function friendlyError(err: unknown): string {
  const e = err as { message?: string; code?: string } | null
  const msg = e?.message ?? ''
  if (e?.code === '23505') return 'Já existe um registro com esse valor (por exemplo, endereço público em uso).'
  if (/exige aprovação/i.test(msg)) return msg
  if (e?.code === '42501' || /row-level security|permission denied/i.test(msg)) return 'Você não tem permissão para esta ação.'
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Falha de conexão. Verifique sua internet e tente novamente.'
  if (e?.code === '23514') return 'Algum campo possui um valor inválido.'
  return msg || 'Ocorreu um erro inesperado. Tente novamente.'
}
