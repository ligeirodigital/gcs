import { describe, expect, it } from 'vitest'
import { addMonths, canSetStatus, dayLabel, monthGrid, monthLabel, monthStart, weekDays, weekStart } from '../calendar'

describe('calendário', () => {
  it('gera grade do mês com semanas completas (domingo a sábado)', () => {
    const g = monthGrid('2026-10-15')
    expect(g.every(w => w.length === 7)).toBe(true); expect(g[0][0]).toBe('2026-09-27'); expect(g.at(-1)![6]).toBe('2026-10-31'); expect(g).toHaveLength(5)
    const f = monthGrid('2026-02-10'); expect(f[0][0]).toBe('2026-02-01'); expect(f.at(-1)![6]).toBe('2026-02-28')
    expect(monthGrid('2026-05-01').flat()).toContain('2026-05-31')
  })
  it('navega entre meses e semanas, inclusive virada de ano', () => {
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01'); expect(addMonths('2026-01-31', -1)).toBe('2025-12-01'); expect(monthStart('2026-10-15')).toBe('2026-10-01')
    expect(weekStart('2026-10-15')).toBe('2026-10-11'); expect(weekDays('2026-10-15')[6]).toBe('2026-10-17')
  })
  it('formata rótulos em português', () => { expect(monthLabel('2026-10-15')).toBe('outubro de 2026'); expect(dayLabel('2026-10-05')).toBe('05/10') })
  it('aprovação: quem não é líder/aprovador não avança status protegidos; publicado só por registro', () => {
    const no = { requireApproval: true, isLeader: false, isApprover: false }
    expect(canSetStatus('approved', no)).toBe(false); expect(canSetStatus('scheduled', no)).toBe(false); expect(canSetStatus('in_review', no)).toBe(true)
    expect(canSetStatus('approved', { ...no, isApprover: true })).toBe(true); expect(canSetStatus('approved', { ...no, isLeader: true })).toBe(true)
    expect(canSetStatus('approved', { ...no, requireApproval: false })).toBe(true)
    expect(canSetStatus('published', { requireApproval: false, isLeader: true, isApprover: true })).toBe(false)
  })
})
