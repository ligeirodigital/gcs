import { describe, expect, it, vi } from 'vitest'
import { dedupeKey, handleSubmit, handleTrack, isBot, type Deps } from './public'

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'
const LINK = '11111111-1111-4111-8111-111111111111'
function mk(over: Partial<Deps> = {}, limitedKeys: string[] = []) {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const deps: Deps = {
    rpc: async (name, args) => {
      calls.push({ name, args })
      if (name === 'check_rate_limit') return { data: !limitedKeys.some(k => String(args._key).startsWith(k)), error: null }
      return { data: true, error: null }
    },
    env: { salt: 'segredo' }, now: () => Date.parse('2026-10-14T12:00:00Z'), ...over,
  }
  return { deps, calls }
}
const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA, 'x-forwarded-for': '203.0.113.7', ...headers }, body: JSON.stringify(body) })
const form = (over: Record<string, unknown> = {}) => ({ slug: 'gc-esperanca', kind: 'join_gc', name: 'Maria', phone: '(85) 99999-0000', consent: true, elapsedMs: 9000, ...over })

describe('detecção de bots e deduplicação', () => {
  it('identifica bots comuns e user-agent ausente', () => {
    for (const ua of [null, 'curl/8.0', 'Googlebot/2.1', 'HeadlessChrome/120', 'python-requests/2.31', 'facebookexternalhit/1.1']) expect(isBot(ua)).toBe(true)
    expect(isBot(UA)).toBe(false)
  })
  it('chave de deduplicação é estável no dia e muda com dia/ip/sal, sem expor o ip', async () => {
    const a = await dedupeKey('s', '2026-10-14', '1.1.1.1', UA)
    expect(a).toBe(await dedupeKey('s', '2026-10-14', '1.1.1.1', UA))
    expect(a).not.toBe(await dedupeKey('s', '2026-10-15', '1.1.1.1', UA))
    expect(a).not.toBe(await dedupeKey('s', '2026-10-14', '2.2.2.2', UA))
    expect(a).not.toBe(await dedupeKey('outro', '2026-10-14', '1.1.1.1', UA))
    expect(a).toMatch(/^[0-9a-f]{32}$/); expect(a).not.toContain('1.1.1.1')
  })
})

describe('track', () => {
  it('registra visualização com chave de deduplicação e origem normalizada', async () => {
    const { deps, calls } = mk()
    const r = await handleTrack(post('http://x/track', { slug: 'GC-Esperanca', type: 'page_view', source: 'Instagram' }), deps)
    expect(r.status).toBe(200)
    const rec = calls.find(c => c.name === 'record_analytics')!
    expect(rec.args).toMatchObject({ p_slug: 'gc-esperanca', p_type: 'page_view', p_source: 'instagram', p_link: null })
    expect(String(rec.args.p_dedupe)).toMatch(/^[0-9a-f]{32}$/)
    expect(JSON.stringify(rec.args)).not.toContain('203.0.113.7')
  })
  it('clique exige linkId', async () => {
    const { deps } = mk()
    expect((await handleTrack(post('http://x/track', { slug: 'gc-esperanca', type: 'link_click' }), deps)).status).toBe(400)
    expect((await handleTrack(post('http://x/track', { slug: 'gc-esperanca', type: 'link_click', linkId: LINK }), deps)).status).toBe(200)
  })
  it('bots não são contados e payload inválido é rejeitado', async () => {
    const { deps, calls } = mk()
    const r = await handleTrack(post('http://x/track', { slug: 'gc-esperanca', type: 'page_view' }, { 'user-agent': 'Googlebot/2.1' }), deps)
    expect(await r.json()).toMatchObject({ ok: true, counted: false }); expect(calls.some(c => c.name === 'record_analytics')).toBe(false)
    expect((await handleTrack(post('http://x/track', { slug: '../etc', type: 'page_view' }), deps)).status).toBe(400)
    expect((await handleTrack(post('http://x/track', { slug: 'gc-esperanca', type: 'outro' }), deps)).status).toBe(400)
    expect((await handleTrack(post('http://x/track', { slug: 'gc-esperanca', type: 'page_view', source: 'a b<script>' }), deps)).status).toBe(400)
  })
  it('aplica limite de requisições e responde CORS', async () => {
    const { deps } = mk({}, ['track:'])
    expect((await handleTrack(post('http://x/track', { slug: 'gc-esperanca', type: 'page_view' }), deps)).status).toBe(429)
    const pre = await handleTrack(new Request('http://x/track', { method: 'OPTIONS', headers: { origin: 'https://app.com' } }), mk({ env: { salt: 's', allowedOrigins: 'https://app.com' } }).deps)
    expect(pre.status).toBe(204); expect(pre.headers.get('access-control-allow-origin')).toBe('https://app.com')
    expect((await handleTrack(new Request('http://x/track'), deps)).status).toBe(405)
  })
  it('rejeita corpo grande demais', async () => {
    const { deps } = mk()
    expect((await handleTrack(post('http://x/track', { slug: 'gc-esperanca', type: 'page_view', source: 'x'.repeat(20000) }), deps)).status).toBe(400)
  })
})

describe('submit-form', () => {
  it('envia dados validados ao banco (consentimento, versão e origem)', async () => {
    const { deps, calls } = mk()
    const r = await handleSubmit(post('http://x/f', form({ source: 'instagram', consentVersion: 'v2' })), deps)
    expect(r.status).toBe(200)
    expect(calls.find(c => c.name === 'submit_public_form')!.args).toMatchObject({ p_slug: 'gc-esperanca', p_kind: 'join_gc', p_name: 'Maria', p_consent: true, p_consent_version: 'v2', p_source: 'instagram', p_email: null })
  })
  it('exige consentimento explícito e valida campos', async () => {
    const { deps, calls } = mk()
    const noConsent = await handleSubmit(post('http://x/f', form({ consent: false })), deps)
    expect(noConsent.status).toBe(422); expect((await noConsent.json()).fields.consent).toContain('aceitar')
    expect((await handleSubmit(post('http://x/f', form({ phone: 'abc' })), deps)).status).toBe(422)
    expect((await handleSubmit(post('http://x/f', form({ email: 'x' })), deps)).status).toBe(422)
    expect((await handleSubmit(post('http://x/f', form({ message: 'x'.repeat(501) })), deps)).status).toBe(422)
    expect((await handleSubmit(post('http://x/f', form({ kind: 'admin' })), deps)).status).toBe(422)
    expect(calls.some(c => c.name === 'submit_public_form')).toBe(false)
  })
  it('descarta silenciosamente honeypot e envios rápidos demais (sem gravar)', async () => {
    const { deps, calls } = mk()
    for (const over of [{ website: 'http://spam.com' }, { elapsedMs: 300 }]) {
      const r = await handleSubmit(post('http://x/f', form(over)), deps)
      expect(r.status).toBe(200); expect(await r.json()).toEqual({ ok: true })
    }
    expect(calls.some(c => c.name === 'submit_public_form')).toBe(false)
  })
  it('limita por IP e por GC', async () => {
    for (const k of ['form:ip:', 'form:slug:']) {
      const { deps, calls } = mk({}, [k])
      const r = await handleSubmit(post('http://x/f', form()), deps)
      expect(r.status).toBe(429); expect(calls.some(c => c.name === 'submit_public_form')).toBe(false)
    }
  })
  it('verifica captcha quando configurado', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ success: true })))
    const bad = vi.fn(async () => new Response(JSON.stringify({ success: false })))
    const { deps, calls } = mk({ env: { salt: 's', turnstileSecret: 'k' }, fetchFn: ok as never })
    expect((await handleSubmit(post('http://x/f', form({ turnstileToken: 't' })), deps)).status).toBe(200); expect(ok).toHaveBeenCalled()
    const m2 = mk({ env: { salt: 's', turnstileSecret: 'k' }, fetchFn: bad as never })
    expect((await handleSubmit(post('http://x/f', form()), m2.deps)).status).toBe(400)
    expect(m2.calls.some(c => c.name === 'submit_public_form')).toBe(false); expect(calls.length).toBeGreaterThan(0)
  })
  it('traduz erros do banco sem vazar detalhes e sem logar dados pessoais', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mkErr = (code: string, message = 'detalhe interno') => mk({ rpc: async n => (n === 'check_rate_limit' ? { data: true, error: null } : { data: null, error: { code, message } }) }).deps
    expect((await handleSubmit(post('http://x/f', form()), mkErr('P0002'))).status).toBe(404)
    expect((await handleSubmit(post('http://x/f', form()), mkErr('23514', 'Informe nome e telefone ou e-mail'))).status).toBe(422)
    const r = await handleSubmit(post('http://x/f', form({ name: 'Maria Segredo' })), mkErr('XX000'))
    expect(r.status).toBe(500); expect(JSON.stringify(await r.json())).not.toContain('detalhe')
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/Maria|99999/); spy.mockRestore()
  })
  it('recusa requisições sem user-agent e métodos errados', async () => {
    const { deps } = mk()
    const r = new Request('http://x/f', { method: 'POST', body: JSON.stringify(form()) })
    expect((await handleSubmit(r, deps)).status).toBe(400)
    expect((await handleSubmit(new Request('http://x/f'), deps)).status).toBe(405)
  })
})
