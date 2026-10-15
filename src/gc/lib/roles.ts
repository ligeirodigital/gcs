import type { AppRole } from './db'

export const ROLE_LABEL: Record<AppRole, string> = {
  church_admin: 'Administrador da igreja',
  gc_leader: 'Líder do GC',
  communicator: 'Comunicação',
  welcome_team: 'Equipe de acolhimento',
  viewer: 'Consulta',
}
export const ROLE_HELP: Record<AppRole, string> = {
  church_admin: 'Administra todos os GCs da igreja.',
  gc_leader: 'Administra o GC, a equipe e a identidade pública.',
  communicator: 'Cria e edita conteúdos, artes e calendário.',
  welcome_team: 'Acompanha visitantes e tarefas de acolhimento.',
  viewer: 'Consulta informações sem editar.',
}
export const GROUP_ROLES: AppRole[] = ['gc_leader', 'communicator', 'welcome_team', 'viewer']

/** Apenas conveniência de interface; a autorização real é feita pelo banco (RLS/RPC). */
export const can = {
  manageGroup: (r?: AppRole) => r === 'church_admin' || r === 'gc_leader',
  welcome: (r?: AppRole) => r === 'church_admin' || r === 'gc_leader' || r === 'welcome_team',
  deleteVisitors: (r?: AppRole) => r === 'church_admin' || r === 'gc_leader',
  manageChurch: (r?: AppRole) => r === 'church_admin',
}
