import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, Copy, Loader2, Save, Settings2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { db, friendlyError } from '../lib/db'
import { useTenant } from '../lib/tenant'
import { can } from '../lib/roles'
import { formatDateTime } from '../lib/format'
import { AI_FORMATS, AI_MODES, LENGTHS, TONES, formatForPost, generateContent, titleFrom, type AiMode, type AiResult } from '../lib/ai'
import { EmptyState, PageHeader } from '../components/ui-kit'

const NONE = '__none__'
interface EventOpt { id: string; name: string; starts_at: string }
interface Hist { id: string; mode: string; status: string; created_at: string }
const STATUS_TXT: Record<string, string> = { succeeded: 'Gerado', failed: 'Falhou', not_configured: 'IA não configurada' }

export default function AiAssistant() {
  const { active } = useTenant()
  const g = active!.group
  const navigate = useNavigate()
  const canUse = can.manageGroup(active!.role) || active!.role === 'communicator'
  const [mode, setMode] = useState<AiMode>('caption')
  const [f, setF] = useState({ objective: '', audience: '', tone: 'acolhedor', format: 'feed', theme: '', eventId: '', eventNote: '', cta: '', length: 'medio' })
  const [events, setEvents] = useState<EventOpt[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AiResult | null>(null)
  const [text, setText] = useState('')
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<{ error: string; message: string } | null>(null)
  const [hist, setHist] = useState<Hist[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => { void db.from('events').select('id, name, starts_at').eq('group_id', g.id).gte('starts_at', new Date(Date.now() - 86400000).toISOString()).order('starts_at').limit(30).then(({ data }) => setEvents((data ?? []) as EventOpt[])) }, [g.id])
  const loadHist = useCallback(() => db.from('ai_generations').select('id, mode, status, created_at').eq('group_id', g.id).order('created_at', { ascending: false }).limit(8).then(({ data }) => setHist((data ?? []) as Hist[])), [g.id])
  useEffect(() => { void loadHist() }, [loadHist])

  if (!canUse) return (<><PageHeader title="Assistente de conteúdo" /><EmptyState icon={Sparkles} title="Disponível para a equipe de comunicação" description="Somente líderes e a equipe de comunicação geram conteúdo com IA." /></>)

  const set = (k: keyof typeof f, v: string) => setF(s => ({ ...s, [k]: v }))
  async function generate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const r = await generateContent({ groupId: g.id, mode, objective: f.objective || undefined, audience: f.audience || undefined, tone: f.tone, format: f.format, theme: f.theme || undefined,
      eventId: f.eventId || undefined, eventNote: f.eventNote || undefined, cta: f.cta || undefined, length: f.length })
    setBusy(false); void loadHist()
    if ('text' in r) { setResult(r); setText(r.text); setChecked({}) } else { setResult(null); setError({ error: r.error, message: r.message }) }
  }
  async function saveDraft() {
    if (!result) return
    setSaving(true)
    const label = AI_MODES.find(m => m.key === mode)!.label
    const { data, error } = await db.from('posts').insert({ group_id: g.id, title: titleFrom(text, label), format: formatForPost(f.format), objective: f.objective || null, caption: text.slice(0, 5000), status: 'draft',
      notes: `Gerado com IA (${label}). Revise fatos, datas e referências bíblicas antes de publicar.` }).select('id').single()
    setSaving(false)
    if (error) { toast.error(friendlyError(error)); return }
    toast.success('Salvo como rascunho'); void data; navigate('/app/estudio')
  }

  return (
    <>
      <PageHeader title="Assistente de conteúdo" description="Gera textos em português a partir dos dados cadastrados do seu GC. A IA não inventa horários, endereços, nomes ou citações: o que faltar vem marcado entre colchetes. Revise sempre antes de publicar." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <form onSubmit={generate} className="space-y-4 rounded-xl border border-border bg-card p-5">
          <fieldset className="space-y-2"><legend className="text-sm font-medium">O que você precisa?</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {AI_MODES.map(m => (
                <label key={m.key} className={`flex cursor-pointer flex-col rounded-lg border-2 p-2 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${mode === m.key ? 'border-primary bg-accent' : 'border-border'}`}>
                  <input type="radio" name="mode" className="sr-only" checked={mode === m.key} onChange={() => setMode(m.key)} /><span className="font-medium">{m.label}</span><span className="text-xs text-muted-foreground">{m.hint}</span></label>))}
            </div></fieldset>
          <div className="space-y-1"><Label htmlFor="ai-obj">Objetivo da publicação</Label><Input id="ai-obj" maxLength={300} value={f.objective} onChange={e => set('objective', e.target.value)} placeholder="Ex.: convidar pessoas novas para o próximo encontro" /></div>
          <div className="space-y-1"><Label htmlFor="ai-aud">Público pretendido</Label><Input id="ai-aud" maxLength={200} value={f.audience} onChange={e => set('audience', e.target.value)} placeholder="Ex.: jovens e universitários da região" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Tom de voz</Label><Select value={f.tone} onValueChange={v => set('tone', v)}><SelectTrigger aria-label="Tom de voz"><SelectValue /></SelectTrigger><SelectContent>{TONES.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Formato</Label><Select value={f.format} onValueChange={v => set('format', v)}><SelectTrigger aria-label="Formato"><SelectValue /></SelectTrigger><SelectContent>{AI_FORMATS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="space-y-1"><Label htmlFor="ai-theme">Tema</Label><Input id="ai-theme" maxLength={500} value={f.theme} onChange={e => set('theme', e.target.value)} placeholder="Ex.: amizade e comunidade" /></div>
          <div className="space-y-1"><Label>Evento cadastrado</Label>
            <Select value={f.eventId || NONE} onValueChange={v => set('eventId', v === NONE ? '' : v)}><SelectTrigger aria-label="Evento cadastrado"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>Nenhum</SelectItem>{events.map(ev => <SelectItem key={ev.id} value={ev.id}>{ev.name} — {formatDateTime(ev.starts_at, g.timezone)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label htmlFor="ai-note">Data/informações do evento (se não estiver cadastrado)</Label><Textarea id="ai-note" rows={2} maxLength={800} value={f.eventNote} onChange={e => set('eventNote', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="ai-cta">Chamada para ação</Label><Input id="ai-cta" maxLength={200} value={f.cta} onChange={e => set('cta', e.target.value)} placeholder="Ex.: Clique no link da bio" /></div>
            <div className="space-y-1"><Label>Comprimento</Label><Select value={f.length} onValueChange={v => set('length', v)}><SelectTrigger aria-label="Comprimento"><SelectValue /></SelectTrigger><SelectContent>{LENGTHS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <Button type="submit" className="w-full" disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{busy ? 'Gerando…' : 'Gerar conteúdo'}</Button>
        </form>

        <section aria-live="polite" className="space-y-4">
          {error && (
            <div role="alert" className="space-y-2 rounded-xl border border-border bg-card p-5">
              <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4 text-primary-ink" aria-hidden /> {error.error === 'not_configured' ? 'Integração de IA não configurada' : 'Não foi possível gerar'}</p>
              <p className="text-sm">{error.message}</p>
              {error.error === 'not_configured' && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Settings2 className="h-3.5 w-3.5" aria-hidden /> Nenhum texto foi gerado nem simulado.</p>}
              {error.error === 'missing_data' && <Button asChild size="sm" variant="outline"><Link to="/app/eventos">Cadastrar evento</Link></Button>}
            </div>)}
          {!result && !error && !busy && <EmptyState icon={Sparkles} title="O resultado aparece aqui" description="Escolha o tipo de conteúdo, preencha o que souber e clique em Gerar. Você poderá editar, copiar ou salvar como rascunho." />}
          {result && (
            <div className="space-y-4 rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-medium">Resultado (editável)</h2><span className="text-xs text-muted-foreground">Gerado por IA · {result.model}</span></div>
              <Textarea aria-label="Texto gerado" rows={16} value={text} onChange={e => setText(e.target.value)} />
              {result.missing_info.length > 0 && (
                <div role="status" className="rounded-lg bg-accent p-3 text-sm"><p className="font-medium">Dados que faltaram (marcados entre colchetes no texto):</p>
                  <ul className="ml-5 list-disc">{result.missing_info.map(m => <li key={m}>{m}</li>)}</ul>
                  <p className="mt-1 text-xs">Complete em <Link className="underline" to="/app/configuracoes">Configurações</Link> ou <Link className="underline" to="/app/eventos">Eventos</Link> e gere de novo, ou substitua manualmente.</p></div>)}
              {result.bible_references.length > 0 && (
                <div className="rounded-lg border border-border p-3 text-sm"><p className="font-medium">Referências bíblicas citadas — NÃO verificadas</p>
                  <p className="text-xs text-muted-foreground">A IA não confere versículos. Consulte uma Bíblia confiável antes de publicar e marque abaixo quando conferir.</p>
                  <ul className="mt-2 space-y-1">{result.bible_references.map(r => (
                    <li key={r}><label className="flex items-center gap-2"><Checkbox checked={!!checked[r]} onCheckedChange={c => setChecked(s => ({ ...s, [r]: c === true }))} /> <span>{r}</span>
                      <span className={`text-xs ${checked[r] ? 'text-success' : 'text-destructive'}`}>{checked[r] ? 'conferida por mim' : 'não verificada'}</span></label></li>))}</ul></div>)}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => navigator.clipboard.writeText(text).then(() => toast.success('Texto copiado'), () => toast.error('Não foi possível copiar'))}><Copy className="mr-1 h-4 w-4" /> Copiar</Button>
                <Button disabled={saving || !text.trim()} onClick={() => void saveDraft()}><Save className="mr-1 h-4 w-4" /> {saving ? 'Salvando…' : 'Salvar como rascunho'}</Button>
                <Button variant="ghost" disabled={busy} onClick={e => void generate(e as never)}>Gerar outra versão</Button>
              </div>
            </div>)}
          {hist.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4"><h2 className="mb-2 text-sm font-medium">Gerações recentes (somente metadados)</h2>
              <ul className="space-y-1 text-xs text-muted-foreground">{hist.map(h => <li key={h.id}>{formatDateTime(h.created_at, g.timezone)} · {AI_MODES.find(m => m.key === h.mode)?.label ?? h.mode} · {STATUS_TXT[h.status] ?? h.status}</li>)}</ul></div>)}
        </section>
      </div>
    </>
  )
}
