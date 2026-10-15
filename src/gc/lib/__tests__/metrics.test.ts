import { describe, expect, it } from 'vitest'
import { MIN_SAMPLE, addDays, computeRates, daysCsv, fmtRate, linksCsv, presetRange, rate, summaryCsv, validRange, type Summary } from '../metrics'

const base: Summary = { from: '2026-10-01', to: '2026-10-07', views: 200, clicks: 50, forms: 10, clicks_by_link: [{ id: '1', label: '=cmd|x', type: 'custom', active: true, clicks: 50 }],
  views_by_day: [{ day: '2026-10-01', views: 5 }], views_by_source: [], posts_created: 4, posts_by_format: {}, posts_status_now: {}, published_in_period: 1,
  visitors: { contacts: 20, attended: 8, returned: 2, by_source: {}, tasks_pending: 0, tasks_overdue: 0, forms_new: 0 } }

describe('taxas', () => {
  it('usam denominadores corretos e nunca dividem por zero', () => {
    expect(rate(5, 0)).toEqual({ value: null, num: 5, den: 0, small: false }); expect(fmtRate(rate(5, 0))).toBe('—'); expect(fmtRate(rate(0, 0))).toBe('—')
    expect(rate(1, 4).value).toBe(0.25); expect(fmtRate(rate(1, 3))).toBe('33,3%'); expect(fmtRate(rate(0, 50))).toBe('0,0%')
  })
  it('sinaliza amostra pequena', () => { expect(rate(1, MIN_SAMPLE - 1).small).toBe(true); expect(rate(1, MIN_SAMPLE).small).toBe(false) })
  it('calcula cada indicador sobre o denominador certo', () => {
    const r = computeRates(base)
    expect([r.ctr.num, r.ctr.den]).toEqual([50, 200]); expect([r.formRate.num, r.formRate.den]).toEqual([10, 200])
    expect([r.attendance!.num, r.attendance!.den]).toEqual([8, 20]); expect([r.returning!.num, r.returning!.den]).toEqual([2, 8])
    expect(fmtRate(r.attendance!)).toBe('40,0%'); expect(fmtRate(r.returning!)).toBe('25,0%')
  })
  it('sem acesso a visitantes, não há taxas de acolhimento (nada inventado)', () => {
    const r = computeRates({ ...base, visitors: null }); expect(r.attendance).toBeNull(); expect(r.returning).toBeNull()
    expect(fmtRate(computeRates({ ...base, views: 0, clicks: 0, forms: 0 }).ctr)).toBe('—')
  })
})
describe('períodos', () => {
  const now = new Date('2026-10-15T15:00:00Z')
  it('gera intervalos inclusivos no fuso do GC', () => {
    expect(presetRange('7d', 'America/Fortaleza', now)).toEqual({ from: '2026-10-09', to: '2026-10-15' })
    expect(presetRange('30d', 'America/Fortaleza', now)).toEqual({ from: '2026-09-16', to: '2026-10-15' })
    expect(presetRange('month', 'America/Fortaleza', now)).toEqual({ from: '2026-10-01', to: '2026-10-15' })
    expect(presetRange('7d', 'America/Fortaleza', new Date('2026-10-16T01:30:00Z')).to).toBe('2026-10-15')   // 22:30 em Fortaleza ainda é dia 15
  })
  it('soma dias e valida faixa', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01'); expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(validRange('2026-10-01', '2026-10-02')).toBe(true); expect(validRange('2026-10-03', '2026-10-02')).toBe(false); expect(validRange('2025-01-01', '2026-10-02')).toBe(false); expect(validRange('', '2026-10-02')).toBe(false)
  })
})
describe('relatórios CSV', () => {
  it('separam fontes de dados e neutralizam fórmulas', () => {
    const csv = summaryCsv(base)
    expect(csv).toContain('Medido pela plataforma,Visualizações da página,200'); expect(csv).toContain('Registrado pelo GC,Compareceram,8'); expect(csv).toContain('Comparecimento (compareceram ÷ contatos),40,0%'.replace('40,0%', '"40,0%"'))
    expect(linksCsv(base)).toContain("'=cmd|x"); expect(daysCsv(base)).toContain('2026-10-01,5')
    expect(summaryCsv({ ...base, visitors: null })).not.toContain('Compareceram')
  })
})
