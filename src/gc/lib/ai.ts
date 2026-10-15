import { supabase } from '@/integrations/supabase/client'
import type { PostFormat } from '../studio/model'

export type AiMode = 'caption' | 'invite' | 'campaign_ideas' | 'reels_script' | 'stories_sequence' | 'carousel' | 'devotional' | 'editorial_calendar' | 'bio_cta'
export const AI_MODES: { key: AiMode; label: string; hint: string }[] = [
  { key: 'caption', label: 'Legenda para Instagram', hint: 'Gancho, texto e chamada para ação.' },
  { key: 'invite', label: 'Convite para encontro', hint: 'Usa o evento cadastrado.' },
  { key: 'campaign_ideas', label: 'Ideias de campanha', hint: '4 a 6 ideias com primeira peça.' },
  { key: 'reels_script', label: 'Roteiro de Reels', hint: 'Cenas, falas e chamada final.' },
  { key: 'stories_sequence', label: 'Sequência de Stories', hint: '4 a 7 Stories com interação.' },
  { key: 'carousel', label: 'Carrossel educativo', hint: 'Capa, páginas e chamada final.' },
  { key: 'devotional', label: 'Devocional', hint: 'Reflexão, pergunta e oração.' },
  { key: 'editorial_calendar', label: 'Calendário editorial', hint: 'Sugestão de 2 semanas.' },
  { key: 'bio_cta', label: 'Chamadas para a bio', hint: '6 variações curtas.' },
]
export const TONES = [['acolhedor', 'Acolhedor'], ['jovem', 'Jovem'], ['inspirador', 'Inspirador'], ['direto', 'Direto'], ['descontraido', 'Descontraído'], ['formal', 'Formal']] as const
export const AI_FORMATS = [['feed', 'Post de feed'], ['reels', 'Reels'], ['stories', 'Stories'], ['carrossel', 'Carrossel'], ['texto', 'Somente texto']] as const
export const LENGTHS = [['curto', 'Curto'], ['medio', 'Médio'], ['longo', 'Longo']] as const

export interface AiRequestBody {
  groupId: string; mode: AiMode; objective?: string; audience?: string; tone: string; format: string; theme?: string
  eventId?: string; eventNote?: string; cta?: string; length: string
}
export type AiResult = { ok: true; text: string; missing_info: string[]; bible_references: string[]; model: string }
export type AiFailure = { ok: false; error: string; message: string }

/** Chama a Edge Function. Nunca fabrica texto: qualquer falha volta como erro. */
export async function generateContent(body: AiRequestBody): Promise<AiResult | AiFailure> {
  const { data, error } = await supabase.functions.invoke('ai-generate', { body })
  if (!error && data?.ok) return data as AiResult
  let payload: Partial<AiFailure> | null = data && typeof data === 'object' ? data : null
  const ctx = (error as { context?: Response } | null)?.context
  if (!payload && ctx && typeof ctx.json === 'function') payload = await ctx.json().catch(() => null)
  if (payload?.error) return { ok: false, error: payload.error, message: payload.message ?? 'Não foi possível gerar o conteúdo.' }
  return { ok: false, error: 'network', message: 'Não foi possível falar com o serviço de IA. Verifique sua conexão e tente novamente.' }
}

export const formatForPost = (f: string): PostFormat => (f === 'stories' || f === 'reels' ? 'story' : f === 'carrossel' ? 'carousel' : f === 'feed' ? 'feed_vertical' : 'feed_square')
export function titleFrom(text: string, fallback: string) {
  const first = text.split('\n').map(s => s.trim()).find(Boolean) ?? ''
  const clean = first.replace(/^[#*\-\s"“]+|["”*]+$/g, '').slice(0, 80)
  return clean.length >= 3 ? clean : fallback
}
