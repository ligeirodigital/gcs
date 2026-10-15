import { supabase } from '@/integrations/supabase/client'
import { z } from 'zod'

export type LinkType = 'join_gc' | 'know_church' | 'prayer_request' | 'contact_leadership' | 'next_meeting' | 'directions' | 'instagram' | 'whatsapp' | 'youtube' | 'custom'
export const FORM_TYPES: LinkType[] = ['join_gc', 'know_church', 'prayer_request', 'contact_leadership']
export const EXTERNAL_TYPES: LinkType[] = ['instagram', 'whatsapp', 'youtube', 'custom']
export const LINK_TYPE_LABEL: Record<LinkType, string> = {
  join_gc: 'Participar do GC', know_church: 'Quero conhecer a igreja', prayer_request: 'Pedir oração', contact_leadership: 'Falar com a liderança',
  next_meeting: 'Próximo encontro', directions: 'Como chegar', instagram: 'Instagram', whatsapp: 'WhatsApp', youtube: 'YouTube', custom: 'Link externo',
}
export const LINK_TYPES = Object.keys(LINK_TYPE_LABEL) as LinkType[]

export interface PublicEvent { id: string; name: string; description: string | null; starts_at: string; ends_at: string | null; address: string | null; registration_url: string | null }
export interface PublicData {
  group: { name: string; slug: string; description: string | null; logo_path: string | null; cover_path: string | null; primary_color: string; secondary_color: string; timezone: string }
  page: { headline: string | null; bio: string | null; socials: { instagram?: string; youtube?: string; whatsapp?: string }; contact: { email?: string; phone?: string } }
  meeting: { weekday: number | null; time: string | null; address: string | null } | null
  links: { id: string; type: LinkType; label: string; url: string | null }[]
  events: PublicEvent[]
}

export async function fetchPublicPage(slug: string): Promise<PublicData | null> {
  const { data, error } = await supabase.rpc('get_public_page' as never, { p_slug: slug } as never)
  if (error) throw error
  return (data as PublicData | null) ?? null
}

const FN = (name: string) => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`
const SRC = /^[a-z0-9_-]{1,40}$/
export function sourceFromSearch(search: string): string | undefined {
  const s = new URLSearchParams(search).get('src')?.toLowerCase()
  return s && SRC.test(s) ? s : undefined
}

/** Métricas medidas pela plataforma. Falhas nunca atrapalham a navegação. */
export function track(slug: string, type: 'page_view' | 'link_click', linkId?: string, source?: string) {
  try {
    void fetch(FN('track'), { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, type, linkId, source }) }).catch(() => undefined)
  } catch { /* ignorado */ }
}

export interface FormPayload { slug: string; kind: LinkType; name?: string; phone?: string; email?: string; message?: string; consent: boolean; source?: string; website?: string; elapsedMs: number }
export type SubmitResult = { ok: true } | { ok: false; message: string; fields?: Record<string, string> }
export async function submitForm(p: FormPayload): Promise<SubmitResult> {
  try {
    const r = await fetch(FN('submit-form'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...p, consentVersion: CONSENT_VERSION }) })
    const j = await r.json().catch(() => ({}))
    if (r.ok && j.ok) return { ok: true }
    if (r.status === 422) return { ok: false, message: 'Confira os campos destacados.', fields: j.fields }
    if (r.status === 429) return { ok: false, message: j.message ?? 'Muitas tentativas. Tente novamente mais tarde.' }
    if (r.status === 404) return { ok: false, message: 'Esta página não está mais disponível.' }
    return { ok: false, message: 'Não foi possível enviar agora. Tente novamente em instantes.' }
  } catch { return { ok: false, message: 'Sem conexão. Verifique sua internet e tente novamente.' } }
}
export const CONSENT_VERSION = 'v1'

// ===== normalização de redes sociais e links =====
const digits = (s: string) => s.replace(/\D/g, '')
export function normalizeSocial(kind: 'instagram' | 'whatsapp' | 'youtube', input: string): string | null {
  const v = input.trim()
  if (!v) return null
  if (kind === 'whatsapp') {
    const d = digits(v.replace(/^https?:\/\/(wa\.me|api\.whatsapp\.com\/send\?phone=)\//i, ''))
    if (d.length < 10 || d.length > 15) return null
    return `https://wa.me/${d.length <= 11 ? '55' + d : d}`
  }
  if (kind === 'instagram') {
    if (/^https?:\/\//i.test(v)) { try { const u = new URL(v); return /(^|\.)instagram\.com$/i.test(u.hostname) ? u.origin + u.pathname.replace(/\/$/, '') : null } catch { return null } }
    const h = v.replace(/^@/, '')
    return /^[A-Za-z0-9._]{1,30}$/.test(h) ? `https://instagram.com/${h}` : null
  }
  if (/^@[A-Za-z0-9._-]{2,40}$/.test(v)) return `https://youtube.com/${v}`
  try { const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`); return /(^|\.)(youtube\.com|youtu\.be)$/i.test(u.hostname) ? u.toString() : null } catch { return null }
}
export const customUrlSchema = z.string().trim().max(500).regex(/^(https:\/\/|mailto:|tel:)[^\s]+$/i, 'Use um endereço iniciado por https://, mailto: ou tel:')
export function mapsUrl(address: string) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` }
