import { describe, expect, it } from 'vitest'
import { csvCell, toCsv } from '../csv'
import { STATUS_ORDER, STATUS_LABEL, SOURCE_LABEL, buildVisitorExport, describeHistory, groupByStatus, isDueSoon, isOverdue } from '../visitors'

describe('situações e origens', () => {
  it('cobrem todas as situações e origens do módulo', () => {
    expect(STATUS_ORDER).toHaveLength(8)
    expect(Object.values(STATUS_LABEL)).toEqual(['Novo contato', 'Primeiro contato realizado', 'Convite enviado', 'Confirmou presença', 'Visitou o encontro', 'Retornou', 'Integrado à comunidade', 'Sem interesse no momento'])
    expect(Object.values(SOURCE_LABEL)).toEqual(['Instagram', 'Link na bio', 'Indicação de um membro', 'Visita presencial', 'Evento', 'Outro'])
  })
  it('agrupa por situação (kanban) mantendo colunas vazias', () => {
    const g = groupByStatus([{ id: '1', status: 'new' as const }, { id: '2', status: 'invited' as const }, { id: '3', status: 'new' as const }])
    expect(g.new.map(v => v.id)).toEqual(['1', '3']); expect(g.invited).toHaveLength(1); expect(g.integrated).toEqual([])
    expect(Object.keys(g)).toHaveLength(8)
  })
})
describe('tarefas', () => {
  const now = Date.parse('2026-10-14T12:00:00Z')
  it('detecta atraso apenas em tarefas abertas com prazo vencido', () => {
    expect(isOverdue({ due_at: '2026-10-13T12:00:00Z', completed_at: null }, now)).toBe(true)
    expect(isOverdue({ due_at: '2026-10-13T12:00:00Z', completed_at: '2026-10-13T13:00:00Z' }, now)).toBe(false)
    expect(isOverdue({ due_at: '2026-10-15T12:00:00Z', completed_at: null }, now)).toBe(false)
    expect(isOverdue({ due_at: null, completed_at: null }, now)).toBe(false)
  })
  it('detecta vencimento nas próximas 24 h', () => { expect(isDueSoon('2026-10-14T20:00:00Z', now)).toBe(true); expect(isDueSoon('2026-10-20T20:00:00Z', now)).toBe(false); expect(isDueSoon(null, now)).toBe(false) })
})
describe('histórico', () => {
  it('traduz entradas do servidor e preserva texto da equipe', () => {
    expect(describeHistory('status_change', 'status:new>invited')).toBe('Situação: Novo contato → Convite enviado')
    expect(describeHistory('status_change', 'owner:changed')).toBe('Responsável alterado')
    expect(describeHistory('note', 'Preferiu contato à noite')).toBe('Preferiu contato à noite')
  })
})
describe('exportação de dados do visitante (LGPD)', () => {
  it('remove ids internos e inclui histórico e tarefas', () => {
    const e = buildVisitorExport({ id: 'x', group_id: 'g', name: 'Maria', created_by: 'u' }, [{ id: 'i', group_id: 'g', visitor_id: 'x', content: 'ok', created_by: 'u' }], [{ id: 't', title: 'Ligar', group_id: 'g', visitor_id: 'x' }])
    expect(e.visitor).toEqual({ name: 'Maria' }); expect(e.interactions[0]).toEqual({ content: 'ok' }); expect(e.tasks[0]).toEqual({ title: 'Ligar' })
  })
})
describe('CSV', () => {
  it('escapa aspas, vírgulas e quebras de linha', () => { expect(csvCell('a,b')).toBe('"a,b"'); expect(csvCell('diz "oi"')).toBe('"diz ""oi"""'); expect(csvCell('l1\nl2')).toBe('"l1\nl2"'); expect(csvCell(null)).toBe('') })
  it('neutraliza injeção de fórmulas', () => { for (const s of ['=1+1', '+55', '-2', '@cmd', '\tx']) expect(csvCell(s).replace(/^"/, '')).toMatch(/^'/) })
  it('gera cabeçalho com BOM e linhas CRLF', () => {
    const csv = toCsv([{ n: 'Ana', c: 3 }], [{ header: 'Nome', value: r => r.n }, { header: 'Contagem', value: r => r.c }])
    expect(csv).toBe('﻿Nome,Contagem\r\nAna,3')
  })
})
