import { addDays } from './metrics'

/** Datas "YYYY-MM-DD" (sem fuso): semana começa no domingo. */
export const dow = (iso: string) => new Date(iso + 'T12:00:00Z').getUTCDay()
export const weekStart = (iso: string) => addDays(iso, -dow(iso))
export const weekDays = (iso: string) => Array.from({ length: 7 }, (_, i) => addDays(weekStart(iso), i))
export function monthStart(iso: string) { return iso.slice(0, 8) + '01' }
export function addMonths(iso: string, n: number) {
  const [y, m] = iso.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1, 12))
  return d.toISOString().slice(0, 10)
}
/** Grade do mês: sempre semanas completas (domingo a sábado). */
export function monthGrid(iso: string): string[][] {
  const first = monthStart(iso); const next = addMonths(first, 1)
  const start = weekStart(first); const lastDay = addDays(next, -1); const end = addDays(weekStart(lastDay), 6)
  const weeks: string[][] = []
  for (let d = start; d <= end; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)))
  return weeks
}
export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const monthLabel = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`
export const dayLabel = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`
export const dateBR = (iso: string) => iso.split('-').reverse().join('/')

export type PostStatus = 'idea' | 'draft' | 'in_review' | 'approved' | 'scheduled' | 'published' | 'cancelled'
export const STATUS_FLOW: PostStatus[] = ['idea', 'draft', 'in_review', 'approved', 'scheduled', 'published', 'cancelled']
/** Status que exigem aprovação quando o GC ativa o fluxo (espelha a regra do banco; o banco é quem decide). */
export const APPROVAL_GATED: PostStatus[] = ['approved', 'scheduled', 'published']
export function canSetStatus(s: PostStatus, ctx: { requireApproval: boolean; isLeader: boolean; isApprover: boolean }) {
  if (s === 'published') return false    // publicação só pelo registro explícito
  return !(ctx.requireApproval && APPROVAL_GATED.includes(s) && !ctx.isLeader && !ctx.isApprover)
}
export const STATUS_TONE: Record<PostStatus, string> = {
  idea: 'bg-secondary text-foreground', draft: 'bg-secondary text-foreground', in_review: 'bg-[#FFF3CD] text-[#5c4300]', approved: 'bg-[#DDF0E4] text-[#1d5a37]',
  scheduled: 'bg-[#DCE9FB] text-[#1b3f73]', published: 'bg-[#1d5a37] text-white', cancelled: 'bg-[#F3DADA] text-[#7a1f1f] line-through',
}
