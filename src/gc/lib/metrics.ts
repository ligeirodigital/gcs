import { db } from './db'
import { toCsv } from './csv'
import { STATUS_LABEL as VISITOR_STATUS } from './visitors'

export const MIN_SAMPLE = 10   // abaixo disso a taxa é exibida com aviso de amostra pequena

export interface LinkMetric { id: string; label: string; type: string; active: boolean; clicks: number }
export interface Summary {
  from: string; to: string; views: number; clicks: number; forms: number
  clicks_by_link: LinkMetric[]; views_by_day: { day: string; views: number }[]; views_by_source: { source: string; views: number }[]
  posts_created: number; posts_by_format: Record<string, number>; posts_status_now: Record<string, number>; published_in_period: number
  visitors: null | { contacts: number; attended: number; returned: number; by_source: Record<string, number>; tasks_pending: number; tasks_overdue: number; forms_new: number }
}

export async function fetchSummary(groupId: string, from: string, to: string): Promise<Summary> {
  const { data, error } = await db.rpc('metrics_summary', { p_group: groupId, p_from: from, p_to: to })
  if (error) throw error
  return data as Summary
}

// ===== taxas com denominador explícito =====
export interface Rate { value: number | null; num: number; den: number; small: boolean }
export function rate(num: number, den: number): Rate {
  if (!den || den <= 0) return { value: null, num, den: den || 0, small: false }
  return { value: num / den, num, den, small: den < MIN_SAMPLE }
}
export const fmtRate = (r: Rate) => (r.value === null ? '—' : `${(r.value * 100).toFixed(1).replace('.', ',')}%`)
export const fmtInt = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('pt-BR').format(n))

export function computeRates(s: Summary) {
  return {
    ctr: rate(s.clicks, s.views),                                   // cliques ÷ visualizações
    formRate: rate(s.forms, s.views),                               // formulários ÷ visualizações
    attendance: s.visitors ? rate(s.visitors.attended, s.visitors.contacts) : null,   // compareceram ÷ contatos do período
    returning: s.visitors ? rate(s.visitors.returned, s.visitors.attended) : null,    // retornaram ÷ compareceram
  }
}

// ===== períodos (datas no fuso do GC) =====
export type Preset = '7d' | '30d' | '90d' | 'month' | 'custom'
const ymd = (d: Date, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
export function addDays(iso: string, n: number) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
export function presetRange(p: Exclude<Preset, 'custom'>, tz: string, now = new Date()): { from: string; to: string } {
  const today = ymd(now, tz)
  if (p === 'month') return { from: today.slice(0, 8) + '01', to: today }
  const n = p === '7d' ? 6 : p === '30d' ? 29 : 89
  return { from: addDays(today, -n), to: today }
}
export const validRange = (from: string, to: string) => !!from && !!to && from <= to && new Date(to).getTime() - new Date(from).getTime() <= 366 * 86400000

// ===== relatórios CSV =====
export function summaryCsv(s: Summary) {
  const r = computeRates(s)
  const rows: [string, string, string][] = [
    ['Período', `${s.from} a ${s.to}`, ''],
    ['Medido pela plataforma', 'Visualizações da página', String(s.views)], ['Medido pela plataforma', 'Cliques nos links', String(s.clicks)],
    ['Medido pela plataforma', 'Formulários enviados', String(s.forms)],
    ['Medido pela plataforma', 'Taxa de cliques (cliques ÷ visualizações)', fmtRate(r.ctr)], ['Medido pela plataforma', 'Formulários ÷ visualizações', fmtRate(r.formRate)],
    ['Registrado pelo GC', 'Conteúdos criados', String(s.posts_created)], ['Registrado pelo GC', 'Conteúdos publicados (registro)', String(s.published_in_period)],
  ]
  if (s.visitors && r.attendance && r.returning) rows.push(
    ['Registrado pelo GC', 'Contatos válidos (com consentimento)', String(s.visitors.contacts)], ['Registrado pelo GC', 'Compareceram', String(s.visitors.attended)],
    ['Registrado pelo GC', 'Retornaram', String(s.visitors.returned)], ['Registrado pelo GC', 'Comparecimento (compareceram ÷ contatos)', fmtRate(r.attendance)],
    ['Registrado pelo GC', 'Retorno (retornaram ÷ compareceram)', fmtRate(r.returning)])
  return toCsv(rows, [{ header: 'Grupo', value: r => r[0] }, { header: 'Indicador', value: r => r[1] }, { header: 'Valor', value: r => r[2] }])
}
export const linksCsv = (s: Summary) => toCsv(s.clicks_by_link, [{ header: 'Botão', value: l => l.label }, { header: 'Tipo', value: l => l.type }, { header: 'Ativo', value: l => (l.active ? 'sim' : 'não') }, { header: 'Cliques', value: l => l.clicks }])
export const daysCsv = (s: Summary) => toCsv(s.views_by_day, [{ header: 'Dia', value: d => d.day }, { header: 'Visualizações', value: d => d.views }])
export const sourcesCsv = (s: Summary) => toCsv(s.views_by_source, [{ header: 'Origem', value: d => d.source }, { header: 'Visualizações', value: d => d.views }])
export function visitorStatusLabel(k: string) { return (VISITOR_STATUS as Record<string, string>)[k] ?? k }
export interface ContentRow { title: string; format: string; status: string; planned_date: string | null; published_at: string | null; created_at: string }
export const contentCsv = (rows: ContentRow[], statusLabel: Record<string, string>, formatLabel: Record<string, string>) =>
  toCsv(rows, [{ header: 'Título', value: r => r.title }, { header: 'Formato', value: r => formatLabel[r.format] ?? r.format }, { header: 'Situação', value: r => statusLabel[r.status] ?? r.status },
    { header: 'Data planejada', value: r => r.planned_date }, { header: 'Publicado em', value: r => r.published_at }, { header: 'Criado em', value: r => r.created_at }])
