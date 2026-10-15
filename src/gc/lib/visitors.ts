export type VisitorStatus = 'new' | 'first_contact_done' | 'invited' | 'confirmed' | 'visited' | 'returned' | 'integrated' | 'not_interested'
export type VisitorSource = 'instagram' | 'bio_link' | 'member_referral' | 'in_person' | 'event' | 'other'

export const STATUS_ORDER: VisitorStatus[] = ['new', 'first_contact_done', 'invited', 'confirmed', 'visited', 'returned', 'integrated', 'not_interested']
export const STATUS_LABEL: Record<VisitorStatus, string> = {
  new: 'Novo contato', first_contact_done: 'Primeiro contato realizado', invited: 'Convite enviado', confirmed: 'Confirmou presença',
  visited: 'Visitou o encontro', returned: 'Retornou', integrated: 'Integrado à comunidade', not_interested: 'Sem interesse no momento',
}
export const SOURCE_LABEL: Record<VisitorSource, string> = {
  instagram: 'Instagram', bio_link: 'Link na bio', member_referral: 'Indicação de um membro', in_person: 'Visita presencial', event: 'Evento', other: 'Outro',
}
export const SOURCES = Object.keys(SOURCE_LABEL) as VisitorSource[]
export const CHANNEL_LABEL: Record<string, string> = { phone: 'Telefone', whatsapp: 'WhatsApp', email: 'E-mail', in_person: 'Pessoalmente', other: 'Outro' }
export const KIND_LABEL: Record<string, string> = { contact_attempt: 'Tentativa de contato', note: 'Nota', result: 'Resultado', status_change: 'Alteração' }

export interface VisitorLite { id: string; status: VisitorStatus }
export interface TaskLite { due_at: string | null; completed_at: string | null }

export function groupByStatus<T extends VisitorLite>(list: T[]): Record<VisitorStatus, T[]> {
  const out = Object.fromEntries(STATUS_ORDER.map(s => [s, [] as T[]])) as Record<VisitorStatus, T[]>
  for (const v of list) (out[v.status] ?? out.new).push(v)
  return out
}
export const isOverdue = (t: TaskLite, now = Date.now()) => !t.completed_at && !!t.due_at && new Date(t.due_at).getTime() < now
export const isDueSoon = (iso: string | null, now = Date.now()) => !!iso && new Date(iso).getTime() - now < 86_400_000 && new Date(iso).getTime() >= now

/** Texto legível para entradas de histórico geradas pelo servidor ("status:new>invited", "owner:changed"). */
export function describeHistory(kind: string, content: string): string {
  if (kind !== 'status_change') return content
  const s = content.match(/^status:(\w+)>(\w+)$/)
  if (s) return `Situação: ${STATUS_LABEL[s[1] as VisitorStatus] ?? s[1]} → ${STATUS_LABEL[s[2] as VisitorStatus] ?? s[2]}`
  if (content === 'owner:removed') return 'Responsável removido'
  if (content === 'owner:changed') return 'Responsável alterado'
  return 'Alteração registrada'
}

/** Direito de acesso (LGPD): reúne os dados do visitante em um arquivo portátil. */
export function buildVisitorExport(v: Record<string, unknown>, interactions: Record<string, unknown>[], tasks: Record<string, unknown>[]) {
  const { id: _id, group_id: _g, created_by: _c, ...visitor } = v
  return { exportedAt: new Date().toISOString(), visitor, interactions: interactions.map(({ id: _i, group_id: _gi, visitor_id: _vi, created_by: _cb, ...r }) => r), tasks: tasks.map(({ id: _t, group_id: _gt, visitor_id: _vt, created_by: _ct, assignee_id: _a, completed_by: _cby, ...r }) => r) }
}
