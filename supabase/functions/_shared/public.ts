// Lógica das Edge Functions públicas (track e submit-form), sem dependências de Deno para ser testável.
// O acesso ao banco é injetado (Deps) e usa SOMENTE funções RPC restritas ao service role.
import { z } from 'zod'

export interface Deps {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>
  env: { salt: string; turnstileSecret?: string; allowedOrigins?: string }
  now?: () => number
  fetchFn?: typeof fetch
}

const BOT_UA = /bot|crawl|spider|slurp|headless|phantom|puppeteer|playwright|selenium|curl|wget|python-requests|httpclient|axios|node-fetch|facebookexternalhit|preview|monitor|lighthouse|scrapy|go-http/i
export const isBot = (ua: string | null) => !ua || ua.length < 10 || BOT_UA.test(ua)

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
}
/** Chave de deduplicação: hash com sal secreto + dia (UTC); não guarda IP nem user-agent em claro. */
export async function dedupeKey(salt: string, day: string, ip: string, ua: string) {
  return (await sha256Hex(`${salt}|${day}|${ip}|${ua}`)).slice(0, 32)
}
export const clientIp = (req: Request) =>
  (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown').trim()

export function corsHeaders(req: Request, allowed?: string): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const list = (allowed ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const allow = list.length === 0 ? '*' : list.includes(origin) ? origin : list[0]
  return { 'access-control-allow-origin': allow, 'access-control-allow-headers': 'content-type, apikey, authorization, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin' }
}
const json = (req: Request, deps: Deps, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...corsHeaders(req, deps.env.allowedOrigins) } })

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).min(3).max(50)
const source = z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{1,40}$/).optional().or(z.literal('').transform(() => undefined))

export const trackSchema = z.object({
  slug, type: z.enum(['page_view', 'link_click']), linkId: z.string().uuid().optional(), source,
}).refine(v => v.type === 'page_view' || !!v.linkId, { message: 'linkId obrigatório', path: ['linkId'] })

export const SUBMISSION_KINDS = ['join_gc', 'know_church', 'prayer_request', 'contact_leadership'] as const
export const submitSchema = z.object({
  slug, kind: z.enum(SUBMISSION_KINDS),
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().regex(/^[+()\d\s-]{8,20}$/, 'Telefone inválido').optional().or(z.literal('')),
  email: z.string().trim().toLowerCase().email('E-mail inválido').max(160).optional().or(z.literal('')),
  message: z.string().trim().max(500, 'Máximo de 500 caracteres').optional(),
  consent: z.literal(true, { errorMap: () => ({ message: 'É necessário aceitar o uso dos dados para receber retorno.' }) }),
  consentVersion: z.string().trim().max(20).default('v1'),
  source,
  website: z.string().max(200).optional(),         // honeypot (campo oculto; humanos não preenchem)
  elapsedMs: z.number().int().min(0).max(86_400_000).optional(),
  turnstileToken: z.string().max(2048).optional(),
})

async function limited(deps: Deps, key: string, max: number, windowSec: number): Promise<boolean> {
  const { data, error } = await deps.rpc('check_rate_limit', { _key: key, _max: max, _window_seconds: windowSec })
  return !error && data === false      // em erro do limitador, não bloqueia (falha aberta controlada)
}

async function readJson(req: Request): Promise<unknown | null> {
  const len = Number(req.headers.get('content-length') ?? '0')
  if (len > 8_192) return null
  try { const t = await req.text(); return t.length > 8_192 ? null : JSON.parse(t) } catch { return null }
}

export async function handleTrack(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req, deps.env.allowedOrigins) })
  if (req.method !== 'POST') return json(req, deps, { ok: false }, 405)
  const ua = req.headers.get('user-agent'), ip = clientIp(req)
  const body = await readJson(req)
  const p = trackSchema.safeParse(body)
  if (!p.success) return json(req, deps, { ok: false, error: 'invalid' }, 400)
  if (isBot(ua)) return json(req, deps, { ok: true, counted: false })           // bots não entram nas métricas
  const day = new Date((deps.now ?? Date.now)()).toISOString().slice(0, 10)
  const ipKey = (await sha256Hex(`${deps.env.salt}|rl|${ip}`)).slice(0, 24)
  if (await limited(deps, `track:${ipKey}`, 120, 60)) return json(req, deps, { ok: false, error: 'rate_limited' }, 429)
  const key = await dedupeKey(deps.env.salt, day, ip, ua ?? '')
  const { data, error } = await deps.rpc('record_analytics', { p_slug: p.data.slug, p_type: p.data.type, p_link: p.data.linkId ?? null, p_source: p.data.source ?? null, p_dedupe: key })
  if (error) return json(req, deps, { ok: false, error: 'server' }, 500)
  return json(req, deps, { ok: true, counted: data === true })
}

export async function handleSubmit(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req, deps.env.allowedOrigins) })
  if (req.method !== 'POST') return json(req, deps, { ok: false }, 405)
  const ua = req.headers.get('user-agent'), ip = clientIp(req)
  if (!ua) return json(req, deps, { ok: false, error: 'invalid' }, 400)
  const body = await readJson(req)
  const p = submitSchema.safeParse(body)
  if (!p.success) {
    const fields: Record<string, string> = {}
    for (const i of p.error.issues) fields[String(i.path[0] ?? 'form')] ??= i.message
    return json(req, deps, { ok: false, error: 'validation', fields }, 422)
  }
  const v = p.data
  // spam: honeypot preenchido ou envio rápido demais => finge sucesso, não grava nada
  if ((v.website ?? '') !== '' || (v.elapsedMs !== undefined && v.elapsedMs < 2500)) return json(req, deps, { ok: true })

  const ipKey = (await sha256Hex(`${deps.env.salt}|rl|${ip}`)).slice(0, 24)
  if (await limited(deps, `form:ip:${ipKey}`, 5, 600) || await limited(deps, `form:slug:${v.slug}`, 60, 3600))
    return json(req, deps, { ok: false, error: 'rate_limited', message: 'Muitas tentativas. Tente novamente mais tarde.' }, 429)

  if (deps.env.turnstileSecret) {
    const f = deps.fetchFn ?? fetch
    const r = await f('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: deps.env.turnstileSecret, response: v.turnstileToken ?? '', remoteip: ip }) })
    const j = await r.json().catch(() => ({ success: false })) as { success?: boolean }
    if (!j.success) return json(req, deps, { ok: false, error: 'captcha', message: 'Não foi possível validar o envio. Tente novamente.' }, 400)
  }

  const { error } = await deps.rpc('submit_public_form', {
    p_slug: v.slug, p_kind: v.kind, p_name: v.name ?? null, p_phone: v.phone || null, p_email: v.email || null,
    p_message: v.message ?? null, p_consent: v.consent, p_consent_version: v.consentVersion, p_source: v.source ?? null,
  })
  if (error) {
    if (error.code === 'P0002') return json(req, deps, { ok: false, error: 'not_found' }, 404)
    if (error.code === '23514') return json(req, deps, { ok: false, error: 'validation', fields: { form: error.message } }, 422)
    console.error('submit-form: falha ao gravar', error.code)       // sem dados pessoais nos logs
    return json(req, deps, { ok: false, error: 'server' }, 500)
  }
  return json(req, deps, { ok: true })
}
