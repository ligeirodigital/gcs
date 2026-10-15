import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const DEFAULT_TZ = 'America/Fortaleza'
export const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

export const formatDate = (d: string | Date, tz: string = DEFAULT_TZ) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))
export const formatDateTime = (d: string | Date, tz: string = DEFAULT_TZ) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' }).format(new Date(d))
export const formatBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
export const formatLongDate = (d: Date) => format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })

export function meetingSummary(weekday: number | null, time: string | null) {
  if (weekday == null || !time) return null
  return `${WEEKDAYS[weekday]}, às ${time.slice(0, 5)}`
}

export function slugify(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
}

// ===== fuso horário (datetime-local <-> UTC) =====
function tzOffsetMs(date: Date, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(date).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]))
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000
}
/** "2026-10-14T19:30" interpretado no fuso `tz` -> instante UTC. */
export function zonedToUtc(local: string, tz: string = DEFAULT_TZ): Date {
  const [d, t = '00:00'] = local.split('T')
  const [y, m, day] = d.split('-').map(Number); const [hh, mm] = t.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, day, hh, mm)
  const off = tzOffsetMs(new Date(guess), tz)
  let utc = guess - off
  const off2 = tzOffsetMs(new Date(utc), tz)
  if (off2 !== off) utc = guess - off2
  return new Date(utc)
}
/** Instante -> "YYYY-MM-DDTHH:mm" no fuso `tz` (para <input type="datetime-local">). */
export function toLocalInput(iso: string | Date, tz: string = DEFAULT_TZ): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(iso)).filter(x => x.type !== 'literal').map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}
export const formatEventWhen = (iso: string, tz: string = DEFAULT_TZ) => {
  const s = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  return s.charAt(0).toUpperCase() + s.slice(1)
}
