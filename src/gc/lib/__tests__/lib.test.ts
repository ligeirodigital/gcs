import { describe, expect, it } from 'vitest'
import { customUrlSchema, normalizeSocial, sourceFromSearch, mapsUrl } from '../public'
import { toLocalInput, zonedToUtc, slugify } from '../format'
import { validateMediaFile } from '../media'

describe('fuso horário', () => {
  it('converte horário local de Fortaleza (UTC-3) para UTC e volta', () => {
    expect(zonedToUtc('2026-10-14T19:30', 'America/Fortaleza').toISOString()).toBe('2026-10-14T22:30:00.000Z')
    expect(toLocalInput('2026-10-14T22:30:00.000Z', 'America/Fortaleza')).toBe('2026-10-14T19:30')
  })
  it('respeita outros fusos e a virada do dia', () => {
    expect(zonedToUtc('2026-10-14T23:30', 'America/Fortaleza').toISOString()).toBe('2026-10-15T02:30:00.000Z')
    expect(zonedToUtc('2026-01-10T10:00', 'America/Sao_Paulo').toISOString()).toBe('2026-01-10T13:00:00.000Z')
    expect(zonedToUtc('2026-07-01T12:00', 'America/New_York').toISOString()).toBe('2026-07-01T16:00:00.000Z')
    expect(zonedToUtc('2026-12-01T12:00', 'America/New_York').toISOString()).toBe('2026-12-01T17:00:00.000Z')
  })
})
describe('redes sociais e links', () => {
  it('normaliza WhatsApp, Instagram e YouTube; rejeita domínios errados', () => {
    expect(normalizeSocial('whatsapp', '(85) 99999-0000')).toBe('https://wa.me/5585999990000')
    expect(normalizeSocial('whatsapp', '+55 85 99999-0000')).toBe('https://wa.me/5585999990000')
    expect(normalizeSocial('whatsapp', '123')).toBeNull()
    expect(normalizeSocial('instagram', '@gc.esperanca')).toBe('https://instagram.com/gc.esperanca')
    expect(normalizeSocial('instagram', 'https://www.instagram.com/gc.esperanca/')).toBe('https://www.instagram.com/gc.esperanca')
    expect(normalizeSocial('instagram', 'https://evil.com/instagram.com')).toBeNull()
    expect(normalizeSocial('instagram', 'x y')).toBeNull()
    expect(normalizeSocial('youtube', '@meucanal')).toBe('https://youtube.com/@meucanal')
    expect(normalizeSocial('youtube', 'youtube.com/watch?v=abc')).toContain('youtube.com')
    expect(normalizeSocial('youtube', 'https://evil.com')).toBeNull()
    expect(normalizeSocial('instagram', '')).toBeNull()
  })
  it('links personalizados só aceitam https, mailto e tel', () => {
    for (const ok of ['https://site.com/x', 'mailto:a@b.com', 'tel:+5585999990000']) expect(customUrlSchema.safeParse(ok).success).toBe(true)
    for (const bad of ['javascript:alert(1)', 'http://inseguro.com', 'data:text/html,x', 'ftp://x', 'https://a b.com', '//evil.com']) expect(customUrlSchema.safeParse(bad).success).toBe(false)
  })
  it('origem (?src=) é filtrada', () => {
    expect(sourceFromSearch('?src=Instagram')).toBe('instagram'); expect(sourceFromSearch('?src=a b')).toBeUndefined()
    expect(sourceFromSearch('?src=<x>')).toBeUndefined(); expect(sourceFromSearch('')).toBeUndefined()
  })
  it('gera link do Google Maps com endereço codificado', () => { expect(mapsUrl('Rua A, 10 & B')).toBe('https://www.google.com/maps/search/?api=1&query=Rua%20A%2C%2010%20%26%20B') })
})
describe('utilidades', () => {
  it('slugify remove acentos', () => { expect(slugify('GC Esperança Viva!')).toBe('gc-esperanca-viva') })
  it('valida arquivos de galeria (tipo e tamanho)', () => {
    expect(validateMediaFile({ type: 'image/png', size: 1000 })).toBeNull()
    expect(validateMediaFile({ type: 'image/gif', size: 1000 })).toMatch(/Formato/)
    expect(validateMediaFile({ type: 'image/jpeg', size: 11 * 1024 * 1024 })).toMatch(/10 MB/)
    expect(validateMediaFile({ type: 'image/jpeg', size: 0 })).toMatch(/vazio/)
  })
})
