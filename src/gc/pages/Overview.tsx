import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, CheckCircle2, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { db, friendlyError } from '../lib/db'
import { useTenant } from '../lib/tenant'
import { can } from '../lib/roles'
import { formatEventWhen, meetingSummary } from '../lib/format'
import { fetchSummary, fmtInt, type Summary } from '../lib/metrics'
import { PeriodPicker, StatTile, useRange } from '../components/MetricsKit'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui-kit'

interface Ev { id: string; name: string; starts_at: string; address: string | null; status: string }

export default function Overview() {
  const { active } = useTenant()
  const g = active!.group
  const r = useRange(g.timezone)
  const [s, setS] = useState<Summary | null>(null)
  const [events, setEvents] = useState<Ev[] | null>(null)
  const [members, setMembers] = useState<number | null>(null)
  const [hasBio, setHasBio] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!r.valid) return
    setError(null); setS(null)
    try { setS(await fetchSummary(g.id, r.range.from, r.range.to)) } catch (e) { setError(friendlyError(e)) }
  }, [g.id, r.range.from, r.range.to, r.valid])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    void db.from('events').select('id, name, starts_at, address, status').eq('group_id', g.id).in('status', ['published', 'draft']).gte('starts_at', new Date().toISOString()).order('starts_at').limit(5).then(({ data }) => setEvents((data ?? []) as Ev[]))
    void db.from('memberships').select('id', { count: 'exact', head: true }).eq('group_id', g.id).then(({ count }) => setMembers(count ?? 0))
    void db.from('bio_pages').select('is_published').eq('group_id', g.id).maybeSingle().then(({ data }) => setHasBio(!!(data as { is_published: boolean } | null)?.is_published))
  }, [g.id])

  const nextEvent = events?.find(e => e.status === 'published') ?? events?.[0]
  const fixed = meetingSummary(g.meeting_weekday, g.meeting_time)
  const steps = [
    { done: !!g.logo_path, label: 'Enviar a logo do GC', to: '/app/configuracoes' },
    { done: !!g.address && g.meeting_weekday !== null, label: 'Informar endereço e horário dos encontros', to: '/app/configuracoes' },
    { done: hasBio === true, label: 'Publicar a página do link na bio', to: '/app/link-na-bio' },
    { done: (members ?? 0) > 1, label: 'Convidar colaboradores', to: '/app/equipe' },
  ]
  const pending = steps.filter(x => !x.done)
  const st = s?.posts_status_now ?? {}

  return (
    <>
      <PageHeader title={`Visão geral de ${g.name}`} description={active!.church.name} actions={<PeriodPicker r={r} />} />
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <section aria-labelledby="ov-next" className="rounded-xl border border-border bg-card p-5">
          <h2 id="ov-next" className="mb-2 flex items-center gap-2 font-medium"><CalendarDays className="h-4 w-4" aria-hidden /> Próximo encontro</h2>
          {events === null ? <p className="text-sm text-muted-foreground">Carregando…</p> : nextEvent ? (
            <><p className="text-base font-semibold">{nextEvent.name}</p><p className="text-sm text-muted-foreground">{formatEventWhen(nextEvent.starts_at, g.timezone)}{nextEvent.address ? ` · ${nextEvent.address}` : ''}</p>
              {nextEvent.status === 'draft' && <p className="mt-1 text-xs text-muted-foreground">Rascunho: ainda não aparece na página pública.</p>}</>
          ) : fixed ? <><p className="text-base font-semibold">{fixed}</p>{g.address && <p className="text-sm text-muted-foreground">{g.address}</p>}<p className="mt-1 text-xs text-muted-foreground">Encontro fixo cadastrado. Nenhum evento programado.</p></>
            : <p className="text-sm text-muted-foreground">Nenhum encontro cadastrado. <Link className="underline" to="/app/eventos">Cadastrar evento</Link> ou <Link className="underline" to="/app/configuracoes">informar o horário fixo</Link>.</p>}
        </section>
        <section aria-labelledby="ov-up" className="rounded-xl border border-border bg-card p-5">
          <h2 id="ov-up" className="mb-2 font-medium">Calendário dos próximos eventos</h2>
          {events === null ? <p className="text-sm text-muted-foreground">Carregando…</p> : events.length === 0 ? <p className="text-sm text-muted-foreground">Sem eventos futuros. <Link className="underline" to="/app/eventos">Cadastrar</Link></p> : (
            <ul className="space-y-1 text-sm">{events.map(e => <li key={e.id} className="flex justify-between gap-3"><span className="truncate">{e.name}</span><span className="shrink-0 text-muted-foreground">{formatEventWhen(e.starts_at, g.timezone)}</span></li>)}</ul>)}
        </section>
      </div>

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : !s ? (r.valid ? <LoadingState /> : null) : (
        <section aria-label="Indicadores do período" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Conteúdos criados" value={fmtInt(s.posts_created)} sub="no período" />
            <StatTile label="Em rascunho" value={fmtInt((st.draft ?? 0) + (st.idea ?? 0))} sub="agora" />
            <StatTile label="Aguardando aprovação" value={fmtInt(st.in_review ?? 0)} sub="agora" />
            <StatTile label="Publicados" value={fmtInt(s.published_in_period)} sub="registrados no período" />
            <StatTile label="Visualizações da página" value={fmtInt(s.views)} sub="medido pela plataforma" />
            <StatTile label="Cliques nos links da bio" value={fmtInt(s.clicks)} sub="medido pela plataforma" />
            <StatTile label="Formulários recebidos" value={fmtInt(s.forms)} sub="medido pela plataforma" />
            {s.visitors ? <StatTile label="Tarefas de acolhimento pendentes" value={fmtInt(s.visitors.tasks_pending)} sub={s.visitors.tasks_overdue ? `${s.visitors.tasks_overdue} atrasada(s)` : 'nenhuma atrasada'} /> : null}
            {s.visitors && <>
              <StatTile label="Visitantes cadastrados" value={fmtInt(s.visitors.contacts)} sub="no período" />
              <StatTile label="Visitantes que retornaram" value={fmtInt(s.visitors.returned)} sub={s.visitors.returned === 0 ? 'nenhum retorno registrado' : 'registrado pela equipe'} /></>}
          </div>
          {s.views === 0 && s.clicks === 0 && s.forms === 0 && s.posts_created === 0 && !s.visitors?.contacts && (
            <EmptyState icon={CalendarDays} title="Ainda não há dados neste período" description="Os números aparecem conforme você cria conteúdos, divulga a página pública e registra visitantes."
              action={<div className="flex flex-wrap justify-center gap-2"><Button asChild><Link to="/app/estudio">Criar conteúdo</Link></Button><Button asChild variant="outline"><Link to="/app/link-na-bio">Configurar página pública</Link></Button></div>} />)}
          <p className="text-xs text-muted-foreground">Detalhes, taxas e relatórios em <Link className="underline" to="/app/metricas">Métricas</Link>. Dados do Instagram dependem de integração oficial e não são exibidos aqui.</p>
        </section>)}

      {pending.length > 0 && can.manageGroup(active!.role) && (
        <section aria-labelledby="ov-steps" className="mt-6 rounded-xl border border-border bg-card p-5">
          <h2 id="ov-steps" className="mb-2 font-medium">Para configurar</h2>
          <ul className="space-y-1.5 text-sm">{steps.map(x => (
            <li key={x.label} className="flex items-center gap-2">{x.done ? <CheckCircle2 className="h-4 w-4 text-success" aria-label="Concluído" /> : <Circle className="h-4 w-4 text-muted-foreground" aria-label="Pendente" />}
              <Link to={x.to} className={x.done ? 'text-muted-foreground line-through' : 'underline-offset-4 hover:underline'}>{x.label}</Link></li>))}</ul>
        </section>)}
    </>
  )
}
