import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Church, ExternalLink, Globe, HandHeart, Instagram, Mail, MapPin, MessageCircle, Phone, UserPlus, Youtube, X, type LucideIcon } from 'lucide-react'
import { brandingUrl } from '../lib/db'
import { WEEKDAYS, formatEventWhen } from '../lib/format'
import { FORM_TYPES, mapsUrl, submitForm, type LinkType, type PublicData, type PublicEvent } from '../lib/public'
import { readableOn } from '../studio/templates'

const ICON: Record<LinkType, LucideIcon> = {
  join_gc: UserPlus, know_church: Church, prayer_request: HandHeart, contact_leadership: MessageCircle, next_meeting: CalendarDays,
  directions: MapPin, instagram: Instagram, whatsapp: MessageCircle, youtube: Youtube, custom: Globe,
}

interface Props {
  data: PublicData
  /** Em modo prévia (painel), cliques e envios não são registrados. */
  preview?: boolean
  source?: string
  onClickLink?: (id: string) => void
}

export function PublicPage({ data, preview = false, source, onClickLink }: Props) {
  const { group: g, page, meeting, links, events } = data
  const [form, setForm] = useState<LinkType | null>(null)
  const [showMeeting, setShowMeeting] = useState(false)
  const cover = brandingUrl(g.cover_path), logo = brandingUrl(g.logo_path)
  const ink = readableOn(g.primary_color)
  const schedule = meeting?.weekday != null && meeting.time ? `${WEEKDAYS[meeting.weekday]}, às ${meeting.time.slice(0, 5)}` : null
  const next = events[0]
  const socials = Object.entries(page.socials ?? {}).filter(([, v]) => !!v) as [keyof typeof ICON, string][]

  const Head = preview ? 'div' : 'header', Main = preview ? 'div' : 'main', Foot = preview ? 'div' : 'footer'
  const visible = links.filter(l => l.type !== 'directions' || !!meeting?.address)

  function activate(l: PublicData['links'][number], e: React.MouseEvent) {
    if (!preview) onClickLink?.(l.id)
    if (l.type === 'next_meeting') { e.preventDefault(); setShowMeeting(v => !v) }
    else if (FORM_TYPES.includes(l.type)) { e.preventDefault(); setForm(l.type) }
    else if (preview) e.preventDefault()
  }
  const hrefFor = (l: PublicData['links'][number]) => l.type === 'directions' ? mapsUrl(meeting?.address ?? '') : l.url ?? '#'
  const external = (l: PublicData['links'][number]) => l.type === 'directions' || ['instagram', 'whatsapp', 'youtube', 'custom'].includes(l.type)

  return (
    <div className="min-h-full w-full text-[#232323]" style={{ background: '#FAFAF8' }}>
      <Head className="relative">
        <div className="h-36 w-full" style={{ background: cover ? undefined : g.secondary_color }}>
          {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="-mt-12 flex flex-col items-center px-5 text-center">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white text-2xl font-bold shadow" style={{ background: g.primary_color, color: ink }}>
            {logo ? <img src={logo} alt={`Logo de ${g.name}`} className="h-full w-full object-cover" /> : g.name.slice(0, 2).toUpperCase()}
          </div>
          <h1 className="mt-3 text-2xl font-bold leading-tight">{g.name}</h1>
          {page.headline && <p className="mt-1 text-sm font-medium" style={{ color: '#5f5d57' }}>{page.headline}</p>}
          {(page.bio || g.description) && <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#3A3A36]">{page.bio || g.description}</p>}
        </div>
      </Head>

      <Main className="mx-auto mt-6 max-w-md space-y-3 px-5 pb-10">
        {socials.length > 0 && (
          <ul className="flex justify-center gap-3" aria-label="Redes sociais">
            {socials.map(([k, v]) => { const Icon = ICON[k as LinkType] ?? Globe
              return <li key={k}><a href={preview ? undefined : v} target="_blank" rel="noopener noreferrer" aria-label={String(k)} onClick={e => preview && e.preventDefault()}
                className="flex h-11 w-11 items-center justify-center rounded-full border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2" style={{ borderColor: g.primary_color }}><Icon className="h-5 w-5" aria-hidden /></a></li> })}
          </ul>)}

        {visible.length === 0 && <p className="rounded-xl border border-dashed border-[#cfccc2] p-4 text-center text-sm text-[#5f5d57]">Nenhum botão ativo.</p>}
        {visible.map(l => {
          const Icon = ICON[l.type]
          const ext = external(l)
          return (
            <a key={l.id} href={hrefFor(l)} {...(ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})} onClick={e => activate(l, e)} role={ext ? undefined : 'button'}
              className="flex min-h-[52px] items-center gap-3 rounded-2xl px-5 py-3 text-base font-semibold shadow-sm transition active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ background: g.primary_color, color: ink }}>
              <Icon className="h-5 w-5 shrink-0" aria-hidden /><span className="flex-1">{l.label}</span>{ext && <ExternalLink className="h-4 w-4 opacity-60" aria-hidden />}
            </a>)
        })}

        {(showMeeting || false) && (
          <section className="rounded-2xl border border-[#e2e0d9] bg-white p-4 text-sm" aria-live="polite">
            <h2 className="mb-1 font-semibold">Próximo encontro</h2>
            {next ? <p>{next.name} — {formatEventWhen(next.starts_at, g.timezone)}{next.address ? ` · ${next.address}` : ''}</p>
              : schedule ? <p>{schedule}{meeting?.address ? ` · ${meeting.address}` : ''}</p>
              : <p className="text-[#5f5d57]">Em breve divulgaremos o próximo encontro.</p>}
          </section>)}

        {meeting && (schedule || meeting.address) && (
          <section className="rounded-2xl border border-[#e2e0d9] bg-white p-4 text-sm">
            <h2 className="mb-1 font-semibold">Onde e quando nos reunimos</h2>
            {schedule && <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4" aria-hidden /> {schedule}</p>}
            {meeting.address && <p className="mt-1 flex items-center gap-2"><MapPin className="h-4 w-4" aria-hidden /> {meeting.address}</p>}
          </section>)}

        {events.length > 0 && (
          <section aria-labelledby="ev-h" className="space-y-2 pt-2">
            <h2 id="ev-h" className="text-sm font-semibold uppercase tracking-wide text-[#5f5d57]">Próximos eventos</h2>
            {events.map(ev => <EventCard key={ev.id} ev={ev} tz={g.timezone} color={g.primary_color} />)}
          </section>)}

        {(page.contact?.email || page.contact?.phone) && (
          <section className="flex flex-wrap justify-center gap-4 pt-2 text-sm">
            {page.contact.email && <a className="flex items-center gap-1 underline" href={`mailto:${page.contact.email}`} onClick={e => preview && e.preventDefault()}><Mail className="h-4 w-4" aria-hidden /> {page.contact.email}</a>}
            {page.contact.phone && <a className="flex items-center gap-1 underline" href={`tel:${page.contact.phone.replace(/[^\d+]/g, '')}`} onClick={e => preview && e.preventDefault()}><Phone className="h-4 w-4" aria-hidden /> {page.contact.phone}</a>}
          </section>)}

        <Foot className="pt-4 text-center text-xs text-[#6B6B66]">
          <a className="underline" href="/privacidade" target="_blank" rel="noopener noreferrer" onClick={e => preview && e.preventDefault()}>Política de privacidade</a>
          <span className="mx-1">·</span>Feito com GC Digital
        </Foot>
      </Main>

      {form && <FormDialog kind={form} slug={g.slug} source={source} preview={preview} color={g.primary_color} ink={ink} onClose={() => setForm(null)} />}
    </div>
  )
}

function EventCard({ ev, tz, color }: { ev: PublicEvent; tz: string; color: string }) {
  return (
    <article className="rounded-2xl border border-[#e2e0d9] bg-white p-4 text-sm" style={{ borderLeft: `6px solid ${color}` }}>
      <h3 className="font-semibold">{ev.name}</h3>
      <p className="mt-0.5 text-[#3A3A36]">{formatEventWhen(ev.starts_at, tz)}</p>
      {ev.address && <p className="mt-0.5 flex items-center gap-1 text-[#3A3A36]"><MapPin className="h-3.5 w-3.5" aria-hidden /> {ev.address}</p>}
      {ev.description && <p className="mt-2 text-[#3A3A36]">{ev.description}</p>}
      {ev.registration_url && <a className="mt-3 inline-block rounded-lg border-2 px-3 py-1.5 font-semibold" style={{ borderColor: color }} href={ev.registration_url} target="_blank" rel="noopener noreferrer">Inscrição</a>}
    </article>
  )
}

const FORM_COPY: Record<string, { title: string; intro: string; message?: string; needName: boolean; needContact: boolean; ok: string }> = {
  join_gc: { title: 'Quero participar do GC', intro: 'Deixe seus dados e alguém da equipe entrará em contato.', needName: true, needContact: true, ok: 'Recebemos seu contato! Em breve alguém da equipe falará com você.' },
  know_church: { title: 'Quero conhecer a igreja', intro: 'Deixe seus dados e retornaremos com informações.', needName: true, needContact: true, ok: 'Recebemos seu contato! Em breve retornaremos.' },
  prayer_request: { title: 'Pedir oração', intro: 'Escreva seu pedido. Nome e contato são opcionais; compartilhe somente o que desejar.', message: 'Seu pedido de oração', needName: false, needContact: false, ok: 'Recebemos seu pedido. Estaremos orando.' },
  contact_leadership: { title: 'Falar com a liderança', intro: 'Envie uma mensagem e informe como podemos responder.', message: 'Sua mensagem', needName: false, needContact: true, ok: 'Mensagem enviada! A liderança responderá em breve.' },
}

function FormDialog({ kind, slug, source, preview, color, ink, onClose }: { kind: LinkType; slug: string; source?: string; preview: boolean; color: string; ink: string; onClose: () => void }) {
  const c = FORM_COPY[kind]
  const opened = useRef(Date.now())
  const [v, setV] = useState({ name: '', phone: '', email: '', message: '', website: '' })
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<{ message?: string; fields?: Record<string, string> }>({})
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [onClose])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const fields: Record<string, string> = {}
    if (c.needName && !v.name.trim()) fields.name = 'Informe seu nome.'
    if (c.needContact && !v.phone.trim() && !v.email.trim()) fields.phone = 'Informe um telefone ou e-mail.'
    if (c.message && !v.message.trim()) fields.message = 'Escreva a mensagem.'
    if (!consent) fields.consent = 'É necessário aceitar o uso dos dados para receber retorno.'
    if (Object.keys(fields).length) { setErr({ fields }); return }
    if (preview) { setErr({ message: 'Prévia: o formulário não é enviado neste modo.' }); return }
    setBusy(true); setErr({})
    const r = await submitForm({ slug, kind, name: v.name || undefined, phone: v.phone || undefined, email: v.email || undefined, message: v.message || undefined, consent, source, website: v.website, elapsedMs: Date.now() - opened.current })
    setBusy(false)
    if ('message' in r) setErr({ message: r.message, fields: r.fields }); else setDone(true)
  }
  const field = (id: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> & { value: string }, key: keyof typeof v, req = false) => (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">{label}{req ? '' : ' (opcional)'}</label>
      <input id={id} {...props} onChange={e => setV({ ...v, [key]: e.target.value })} aria-invalid={!!err.fields?.[key]}
        className="h-11 w-full rounded-lg border border-[#b9b6aa] bg-white px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a67c00]" />
      {err.fields?.[key] && <p role="alert" className="text-xs text-[#c62828]">{err.fields[key]}</p>}
    </div>)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={c.title}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-[#FAFAF8] p-5 text-[#232323] shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-3"><h2 className="text-lg font-bold">{c.title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded p-1 focus-visible:outline-none focus-visible:ring-2"><X className="h-5 w-5" /></button></div>
        {done ? (
          <div role="status" className="space-y-4 py-4 text-center"><p>{c.ok}</p>
            <button type="button" onClick={onClose} className="h-11 rounded-xl px-6 font-semibold" style={{ background: color, color: ink }}>Fechar</button></div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-3">
            <p className="text-sm text-[#3A3A36]">{c.intro}</p>
            {(c.needName || kind === 'prayer_request' || kind === 'contact_leadership') && field('f-name', 'Nome', { value: v.name, autoFocus: true, autoComplete: 'name', maxLength: 120 }, 'name', c.needName)}
            {field('f-phone', 'Telefone / WhatsApp', { value: v.phone, type: 'tel', autoComplete: 'tel', inputMode: 'tel', maxLength: 20 }, 'phone', c.needContact && !v.email)}
            {field('f-email', 'E-mail', { value: v.email, type: 'email', autoComplete: 'email', maxLength: 160 }, 'email')}
            {c.message && (
              <div className="space-y-1"><label htmlFor="f-msg" className="text-sm font-medium">{c.message}</label>
                <textarea id="f-msg" rows={4} maxLength={500} value={v.message} onChange={e => setV({ ...v, message: e.target.value })} aria-invalid={!!err.fields?.message}
                  className="w-full rounded-lg border border-[#b9b6aa] bg-white p-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a67c00]" />
                <p className="text-right text-xs text-[#6B6B66]">{v.message.length}/500</p>
                {err.fields?.message && <p role="alert" className="text-xs text-[#c62828]">{err.fields.message}</p>}</div>)}
            {/* honeypot: invisível para pessoas */}
            <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Não preencha<input tabIndex={-1} autoComplete="off" value={v.website} onChange={e => setV({ ...v, website: e.target.value })} /></label></div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" aria-invalid={!!err.fields?.consent} />
              <span>Concordo que meus dados sejam usados pela equipe deste GC apenas para retornar este contato, conforme a <a className="underline" href="/privacidade" target="_blank" rel="noopener noreferrer">política de privacidade</a>.</span></label>
            {err.fields?.consent && <p role="alert" className="text-xs text-[#c62828]">{err.fields.consent}</p>}
            {err.fields?.form && <p role="alert" className="text-sm text-[#c62828]">{err.fields.form}</p>}
            {err.message && <p role="alert" className="rounded-lg bg-[#fdecea] p-3 text-sm text-[#8a1c1c]">{err.message}</p>}
            <button type="submit" disabled={busy} className="h-12 w-full rounded-xl text-base font-semibold disabled:opacity-60" style={{ background: color, color: ink }}>{busy ? 'Enviando…' : 'Enviar'}</button>
          </form>)}
      </div>
    </div>
  )
}
