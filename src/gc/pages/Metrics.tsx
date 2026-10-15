import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { BarChart3, Download, Instagram, Plug, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { db, friendlyError } from '../lib/db'
import { useTenant } from '../lib/tenant'
import { can } from '../lib/roles'
import { downloadText } from '../lib/csv'
import { formatDate } from '../lib/format'
import { FORMAT_SPECS } from '../studio/model'
import { computeRates, contentCsv, daysCsv, fetchSummary, fmtInt, linksCsv, sourcesCsv, summaryCsv, type ContentRow, type Summary } from '../lib/metrics'
import { LINK_TYPE_LABEL, type LinkType } from '../lib/public'
import { STATUS_LABEL as POST_STATUS } from './Studio'
import type { In, Out } from '../lib/schemas'
import { BarsChart, PeriodPicker, RateTile, StatTile, ViewsChart, useRange } from '../components/MetricsKit'
import { EmptyState, ErrorState, Field, LoadingState, PageHeader, SubmitButton } from '../components/ui-kit'

const IG_METRICS = [['followers', 'Seguidores'], ['reach', 'Alcance'], ['impressions', 'Impressões'], ['likes', 'Curtidas'], ['comments', 'Comentários'], ['saves', 'Salvamentos']] as const
interface Manual { id: string; metric: string; value: number; period_start: string; period_end: string; note: string | null; created_at: string }
const manualSchema = z.object({ value: z.coerce.number({ invalid_type_error: 'Informe um número' }).int('Use número inteiro').min(0, 'Não pode ser negativo').max(1_000_000_000), start: z.string().min(1, 'Informe o início'), end: z.string().min(1, 'Informe o fim'), note: z.string().trim().max(200).optional().or(z.literal('')) })
  .refine(v => v.end >= v.start, { path: ['end'], message: 'O fim deve ser depois do início' })

export default function Metrics() {
  const { active } = useTenant()
  const g = active!.group
  const r = useRange(g.timezone)
  const [s, setS] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!r.valid) return
    setError(null); setS(null)
    try { setS(await fetchSummary(g.id, r.range.from, r.range.to)) } catch (e) { setError(friendlyError(e)) }
  }, [g.id, r.range.from, r.range.to, r.valid])
  useEffect(() => { void load() }, [load])

  async function exportCsv(kind: 'summary' | 'links' | 'days' | 'sources' | 'content') {
    if (!s) return
    const tag = `${s.from}_${s.to}`
    if (kind === 'summary') downloadText(`resumo_${tag}.csv`, summaryCsv(s))
    else if (kind === 'links') downloadText(`cliques-por-botao_${tag}.csv`, linksCsv(s))
    else if (kind === 'days') downloadText(`visualizacoes-por-dia_${tag}.csv`, daysCsv(s))
    else if (kind === 'sources') downloadText(`origens_${tag}.csv`, sourcesCsv(s))
    else {
      const { data, error } = await db.from('posts').select('title, format, status, planned_date, published_at, created_at').eq('group_id', g.id).gte('created_at', `${s.from}T00:00:00`).lte('created_at', `${s.to}T23:59:59`).order('created_at')
      if (error) { toast.error(friendlyError(error)); return }
      downloadText(`conteudos_${tag}.csv`, contentCsv((data ?? []) as ContentRow[], POST_STATUS, Object.fromEntries(Object.entries(FORMAT_SPECS).map(([k, v]) => [k, v.label]))))
    }
    toast.success('Relatório gerado')
  }
  const rates = s ? computeRates(s) : null

  return (
    <>
      <PageHeader title="Métricas" description="Indicadores calculados a partir de registros reais. Os dados são separados por origem para que você saiba o que foi medido, o que foi registrado e o que ainda depende de integração."
        actions={<DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" disabled={!s}><Download className="mr-2 h-4 w-4" /> Exportar CSV</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => void exportCsv('summary')}>Resumo do período</DropdownMenuItem><DropdownMenuItem onSelect={() => void exportCsv('links')}>Cliques por botão</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportCsv('days')}>Visualizações por dia</DropdownMenuItem><DropdownMenuItem onSelect={() => void exportCsv('sources')}>Origem das visitas</DropdownMenuItem><DropdownMenuItem onSelect={() => void exportCsv('content')}>Conteúdos criados</DropdownMenuItem></DropdownMenuContent></DropdownMenu>} />
      <div className="mb-6"><PeriodPicker r={r} /></div>

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : !s ? (r.valid ? <LoadingState /> : null) : (
        <div className="space-y-10">
          <section aria-labelledby="m-plat" className="space-y-4">
            <div className="flex flex-wrap items-center gap-2"><h2 id="m-plat" className="text-lg font-semibold">Medido pela plataforma</h2><Badge variant="secondary">página pública</Badge></div>
            <p className="text-sm text-muted-foreground">Contagens automáticas da página do link na bio. Bots são ignorados e visitas repetidas no mesmo dia contam uma vez.</p>
            {s.views === 0 && s.clicks === 0 && s.forms === 0 ? (
              <EmptyState icon={BarChart3} title="Ainda não há medições neste período" description="Publique a página do link na bio e divulgue o endereço para começar a medir visualizações, cliques e formulários." />
            ) : <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <StatTile label="Visualizações da página" value={fmtInt(s.views)} /><StatTile label="Cliques nos botões" value={fmtInt(s.clicks)} /><StatTile label="Formulários enviados" value={fmtInt(s.forms)} />
                <RateTile label="Taxa de cliques" r={rates!.ctr} formula="Cliques ÷ visualizações (pode passar de 100% se cada visitante clicar em mais de um botão)." />
                <RateTile label="Formulários por visualização" r={rates!.formRate} formula="Formulários enviados ÷ visualizações." />
              </div>
              <div className="grid gap-4 lg:grid-cols-2"><ViewsChart data={s.views_by_day} />
                <BarsChart title="Cliques por botão" desc="Botões ativos e os que receberam cliques no período." unit="Cliques" rows={s.clicks_by_link.map(l => ({ name: l.label || LINK_TYPE_LABEL[l.type as LinkType] || l.type, value: l.clicks }))} /></div>
              <BarsChart title="Origem das visitas" desc="Parâmetro ?src= do endereço divulgado. “direto” = sem origem informada." unit="Visualizações" rows={s.views_by_source.map(v => ({ name: v.source, value: v.views }))} /></>}
          </section>

          <section aria-labelledby="m-gc" className="space-y-4">
            <div className="flex flex-wrap items-center gap-2"><h2 id="m-gc" className="text-lg font-semibold">Registrado pelo GC</h2><Badge variant="secondary">registros da equipe</Badge></div>
            <p className="text-sm text-muted-foreground">Vêm de registros feitos pela equipe (visitantes e conteúdos), nunca de estimativas. As situações dos visitantes são as registradas por pessoas.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Conteúdos criados" value={fmtInt(s.posts_created)} /><StatTile label="Publicações registradas" value={fmtInt(s.published_in_period)} hint="Contam apenas conteúdos com registro de publicação." />
              {s.visitors ? <>
                <StatTile label="Contatos válidos" value={fmtInt(s.visitors.contacts)} hint="Visitantes com consentimento, cujo primeiro contato foi no período." />
                <StatTile label="Compareceram" value={fmtInt(s.visitors.attended)} hint="Situação “Visitou”, “Retornou” ou “Integrado”." /></> : null}
            </div>
            {s.visitors && rates?.attendance && rates.returning ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <StatTile label="Retornaram" value={fmtInt(s.visitors.returned)} hint="Situação “Retornou” ou “Integrado”. Mostra zero se a equipe ainda não registrou retornos." />
                <RateTile label="Comparecimento" r={rates.attendance} formula="Compareceram ÷ contatos válidos do período." /><RateTile label="Retorno" r={rates.returning} formula="Retornaram ÷ compareceram." /></div>
            ) : <p role="status" className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">Os indicadores de visitantes ficam visíveis apenas para a liderança e a equipe de acolhimento.</p>}
            {Object.keys(s.posts_by_format).length > 0 && <BarsChart title="Conteúdos por formato" desc="Conteúdos criados no período." unit="Conteúdos" rows={Object.entries(s.posts_by_format).map(([k, v]) => ({ name: FORMAT_SPECS[k as keyof typeof FORMAT_SPECS]?.label ?? k, value: v }))} />}
          </section>

          <InstagramSection groupId={g.id} canEdit={can.manageGroup(active!.role) || active!.role === 'communicator'} tz={g.timezone} />
        </div>)}
    </>
  )
}

function InstagramSection({ groupId, canEdit, tz }: { groupId: string; canEdit: boolean; tz: string }) {
  const [rows, setRows] = useState<Manual[] | null>(null)
  const [metric, setMetric] = useState<string>('followers')
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<In<typeof manualSchema>, unknown, Out<typeof manualSchema>>({ resolver: zodResolver(manualSchema) })
  const load = useCallback(async () => { const { data } = await db.from('manual_metrics').select('id, metric, value, period_start, period_end, note, created_at').eq('group_id', groupId).order('period_end', { ascending: false }).limit(50); setRows((data ?? []) as Manual[]) }, [groupId])
  useEffect(() => { void load() }, [load])
  return (
    <section aria-labelledby="m-ig" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><h2 id="m-ig" className="text-lg font-semibold">Instagram</h2><Badge variant="outline">depende de integração oficial</Badge></div>
      <div className="flex gap-3 rounded-xl border border-dashed border-border bg-card p-4 text-sm"><Plug className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <p><strong>Integração com a Meta não conectada.</strong> Alcance, impressões, curtidas e seguidores só serão exibidos automaticamente quando forem importados pela API oficial, o que ainda não foi implementado. Nenhum número do Instagram é estimado pela plataforma.</p></div>
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-medium"><Instagram className="h-4 w-4" aria-hidden /> Registro manual</h3>
        <p className="mb-3 text-xs text-muted-foreground">Se quiser, digite números vistos no aplicativo. Eles ficam identificados como “registro manual” e não são verificados.</p>
        {canEdit && (
          <form noValidate className="mb-4 grid gap-3 sm:grid-cols-[10rem_8rem_9rem_9rem_1fr_auto] sm:items-end" onSubmit={handleSubmit(async v => {
            const { error } = await db.from('manual_metrics').insert({ group_id: groupId, metric, value: v.value, period_start: v.start, period_end: v.end, note: v.note || null })
            if (error) { toast.error(friendlyError(error)); return }
            reset({ value: undefined, start: '', end: '', note: '' } as never); toast.success('Registro manual salvo'); void load()
          })}>
            <div className="space-y-1.5"><label className="text-sm font-medium">Indicador</label><Select value={metric} onValueChange={setMetric}><SelectTrigger aria-label="Indicador"><SelectValue /></SelectTrigger><SelectContent>{IG_METRICS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
            <Field label="Valor" type="number" inputMode="numeric" min={0} error={errors.value?.message} {...register('value')} />
            <Field label="Período: início" type="date" error={errors.start?.message} {...register('start')} />
            <Field label="Período: fim" type="date" error={errors.end?.message} {...register('end')} />
            <Field label="Observação (opcional)" maxLength={200} error={errors.note?.message} {...register('note')} />
            <SubmitButton loading={isSubmitting}>Adicionar</SubmitButton>
          </form>)}
        {rows === null ? <LoadingState /> : rows.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum registro manual.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Indicador</th><th className="py-1 text-right">Valor</th><th className="py-1 pl-4">Período</th><th className="py-1">Origem do dado</th><th className="py-1"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{rows.map(m => (
              <tr key={m.id} className="border-t border-border"><td className="py-1.5">{IG_METRICS.find(x => x[0] === m.metric)?.[1] ?? m.metric}</td><td className="py-1.5 text-right tabular-nums">{fmtInt(m.value)}</td>
                <td className="py-1.5 pl-4">{formatDate(m.period_start + 'T12:00:00', tz)} a {formatDate(m.period_end + 'T12:00:00', tz)}</td><td className="py-1.5"><Badge variant="outline">Registro manual</Badge>{m.note ? <span className="ml-2 text-xs text-muted-foreground">{m.note}</span> : null}</td>
                <td className="py-1.5 text-right">{canEdit && <Button size="icon" variant="ghost" aria-label="Excluir registro" onClick={async () => { const { error } = await db.from('manual_metrics').delete().eq('id', m.id); if (error) toast.error(friendlyError(error)); else void load() }}><Trash2 className="h-4 w-4" /></Button>}</td></tr>))}</tbody></table></div>)}
      </div>
    </section>
  )
}
