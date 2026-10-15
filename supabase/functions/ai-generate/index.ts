import { createClient } from '@supabase/supabase-js'
import Anthropic from 'npm:@anthropic-ai/sdk@0.134.0'
import { handleGenerate, outputSchema, type GroupContext } from '../_shared/ai.ts'

const url = Deno.env.get('SUPABASE_URL')!
const anon = Deno.env.get('SUPABASE_ANON_KEY')!
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const asUser = (token: string) => createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
const apiKey = Deno.env.get('ANTHROPIC_API_KEY') || undefined
const anthropic = apiKey ? new Anthropic({ apiKey }) : null

Deno.serve(req => handleGenerate(req, {
  env: { anthropicKey: apiKey, model: Deno.env.get('AI_MODEL') ?? 'claude-opus-5-5', allowedOrigins: Deno.env.get('ALLOWED_ORIGINS') ?? undefined },
  authUser: async token => { const { data, error } = await admin.auth.getUser(token); return error || !data.user ? null : { id: data.user.id } },
  canEdit: async (token, groupId) => { const { data, error } = await asUser(token).rpc('group_editor', { _group: groupId }); return !error && data === true },
  context: async (token, groupId, eventId): Promise<GroupContext | null> => {
    const db = asUser(token)                                  // RLS: só lê dados do GC ao qual o usuário pertence
    const { data: g } = await db.from('groups').select('name, description, address, meeting_weekday, meeting_time, timezone').eq('id', groupId).maybeSingle()
    if (!g) return null
    let event: GroupContext['event'] = null
    if (eventId) {
      const { data: e } = await db.from('events').select('name, description, address, starts_at').eq('id', eventId).eq('group_id', groupId).maybeSingle()
      if (e) event = { name: e.name, description: e.description, address: e.address,
        when: new Intl.DateTimeFormat('pt-BR', { timeZone: g.timezone, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(e.starts_at)) }
    }
    return { name: g.name, description: g.description, address: g.address, timezone: g.timezone, event,
      meeting: g.meeting_weekday != null && g.meeting_time ? `${WEEKDAYS[g.meeting_weekday]}, às ${String(g.meeting_time).slice(0, 5)}` : null }
  },
  rateLimit: async (key, max, windowSec) => { const { data, error } = await admin.rpc('check_rate_limit', { _key: key, _max: max, _window_seconds: windowSec }); return error ? true : data === true },
  log: async row => { await admin.from('ai_generations').insert(row) },
  generate: async ({ system, user, model, maxTokens }) => {
    const res = await anthropic!.messages.create({
      model, max_tokens: maxTokens, system,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: outputSchema } },
      messages: [{ role: 'user', content: user }],
    } as never) as { content: { type: string; text?: string }[]; usage: { input_tokens: number; output_tokens: number } }
    const text = res.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('')
    return { text, usage: res.usage }
  },
}))
