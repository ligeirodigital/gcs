import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Info } from 'lucide-react'
import { fmtInt, fmtRate, presetRange, validRange, type Preset, type Rate } from '../lib/metrics'

const INK = '#9A7200'      // série única: contraste >= 3:1 sobre o fundo claro
const GRID = '#E2E0D9', AXIS = '#5F5D57'

export function useRange(tz: string, initial: Preset = '30d') {
  const [preset, setPreset] = useState<Preset>(initial)
  const [custom, setCustom] = useState(() => presetRange('30d', tz))
  const range = useMemo(() => (preset === 'custom' ? custom : presetRange(preset, tz)), [preset, custom, tz])
  return { preset, setPreset, custom, setCustom, range, valid: validRange(range.from, range.to) }
}

export function PeriodPicker({ r }: { r: ReturnType<typeof useRange> }) {
  useEffect(() => { if (r.preset !== 'custom') r.setCustom(r.range) }, [r.preset]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Período">
      <Select value={r.preset} onValueChange={v => r.setPreset(v as Preset)}>
        <SelectTrigger className="w-44" aria-label="Período"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="7d">Últimos 7 dias</SelectItem><SelectItem value="30d">Últimos 30 dias</SelectItem><SelectItem value="90d">Últimos 90 dias</SelectItem><SelectItem value="month">Este mês</SelectItem><SelectItem value="custom">Personalizado</SelectItem></SelectContent>
      </Select>
      {r.preset === 'custom' && <>
        <Input type="date" aria-label="Data inicial" className="w-40" value={r.custom.from} onChange={e => r.setCustom({ ...r.custom, from: e.target.value })} />
        <Input type="date" aria-label="Data final" className="w-40" value={r.custom.to} onChange={e => r.setCustom({ ...r.custom, to: e.target.value })} />
        {!r.valid && <p role="alert" className="text-xs text-destructive">Período inválido (máximo de 366 dias).</p>}</>}
    </div>
  )
}

export function StatTile({ label, value, sub, hint }: { label: string; value: string; sub?: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      {hint && <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground"><Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />{hint}</p>}
    </div>
  )
}
export function RateTile({ label, r, formula }: { label: string; r: Rate; formula: string }) {
  return <StatTile label={label} value={fmtRate(r)} sub={r.den > 0 ? `${fmtInt(r.num)} de ${fmtInt(r.den)}` : 'Sem dados no período'} hint={r.small ? `Amostra pequena (n = ${r.den}): interprete com cautela. ${formula}` : formula} />
}

/** Gráfico com alternativa em tabela (acessibilidade) e cartão-título. */
function ChartCard({ title, desc, table, children }: { title: string; desc: string; table: { head: [string, string]; rows: [string, number][] }; children: React.ReactNode }) {
  const [asTable, setAsTable] = useState(false)
  return (
    <figure className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-start justify-between gap-2"><div><figcaption className="text-sm font-medium">{title}</figcaption><p className="text-xs text-muted-foreground">{desc}</p></div>
        <Button size="sm" variant="ghost" onClick={() => setAsTable(v => !v)} aria-pressed={asTable}>{asTable ? 'Ver gráfico' : 'Ver como tabela'}</Button></div>
      {asTable ? (
        <div className="max-h-64 overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">{table.head[0]}</th><th className="py-1 text-right">{table.head[1]}</th></tr></thead>
          <tbody>{table.rows.map(([k, v]) => <tr key={k} className="border-t border-border"><td className="py-1">{k}</td><td className="py-1 text-right tabular-nums">{fmtInt(v)}</td></tr>)}</tbody></table></div>
      ) : children}
    </figure>
  )
}
const tip = { contentStyle: { borderRadius: 8, border: '1px solid #E2E0D9', fontSize: 12 }, cursor: { stroke: GRID } }

export function ViewsChart({ data }: { data: { day: string; views: number }[] }) {
  const empty = data.every(d => d.views === 0)
  return (
    <ChartCard title="Visualizações por dia" desc="Visitas à página pública (contagem única por visitante/dia)." table={{ head: ['Dia', 'Visualizações'], rows: data.map(d => [d.day.split('-').reverse().join('/'), d.views]) }}>
      {empty ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma visualização no período.</p> : (
        <div className="h-56" role="img" aria-label={`Linha com ${data.length} dias; total de ${data.reduce((a, d) => a + d.views, 0)} visualizações.`}>
          <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="day" tickFormatter={(d: string) => d.slice(8) + '/' + d.slice(5, 7)} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} /><Tooltip {...tip} labelFormatter={(d: string) => d.split('-').reverse().join('/')} formatter={(v: number) => [fmtInt(v), 'Visualizações']} />
            <Line type="monotone" dataKey="views" stroke={INK} strokeWidth={2} dot={{ r: 4, stroke: '#fff', strokeWidth: 2, fill: INK }} activeDot={{ r: 6 }} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>)}
    </ChartCard>
  )
}

export function BarsChart({ title, desc, rows, unit }: { title: string; desc: string; rows: { name: string; value: number }[]; unit: string }) {
  const h = Math.max(120, rows.length * 34 + 20)
  return (
    <ChartCard title={title} desc={desc} table={{ head: ['Item', unit], rows: rows.map(r => [r.name, r.value]) }}>
      {rows.length === 0 || rows.every(r => r.value === 0) ? <p className="py-10 text-center text-sm text-muted-foreground">Sem dados no período.</p> : (
        <div style={{ height: h }} role="img" aria-label={`${title}: ${rows.map(r => `${r.name} ${r.value}`).join(', ')}`}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap={10}>
            <CartesianGrid stroke={GRID} horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12, fill: '#232323' }} tickLine={false} axisLine={{ stroke: GRID }} />
            <Tooltip {...tip} cursor={{ fill: '#F1F0EC' }} formatter={(v: number) => [fmtInt(v), unit]} />
            <Bar dataKey="value" fill={INK} barSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>)}
    </ChartCard>
  )
}
