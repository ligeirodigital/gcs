import { FORMAT_SPECS, uid, type Design, type Element, type Page, type PostFormat, type ImageElement, type TextElement, type ShapeElement } from './model'

export interface Brand {
  groupName: string
  primary: string
  secondary: string
  hasLogo: boolean
  meeting: string | null   // ex.: "Quinta-feira, às 19:30" (somente se cadastrado)
  address: string | null   // somente se cadastrado
}
export type TemplateCategory = 'invite' | 'verse' | 'devotional' | 'reflection' | 'testimony' | 'event' | 'notice' | 'thanks' | 'meeting_photo' | 'team_photo' | 'carousel' | 'prayer' | 'other'
export const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  invite: 'Convite', verse: 'Versículo', devotional: 'Devocional', reflection: 'Reflexão', testimony: 'Testemunho', event: 'Evento',
  notice: 'Aviso', thanks: 'Agradecimento', meeting_photo: 'Foto do encontro', team_photo: 'Equipe', carousel: 'Carrossel', prayer: 'Oração', other: 'Outro',
}

export interface BuiltinTemplate { key: string; name: string; category: TemplateCategory; description: string; defaultFormat: PostFormat; build: (ctx: Ctx) => Page[] }
interface Ctx { W: number; H: number; brand: Brand }

// ===== utilidades de cor =====
export function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1, 7), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#232323' : '#FFFFFF'
}
const withAlpha = (hex: string, a: number) => hex.slice(0, 7) + Math.round(a * 255).toString(16).padStart(2, '0')

// ===== mini-DSL: posições em frações da largura/altura =====
function kit({ W, H }: Ctx) {
  const text = (name: string, fx: number, fy: number, fw: number, fh: number, content: string, o: Partial<TextElement> & { size: number }): TextElement => ({
    id: uid(), name, type: 'text', x: fx * W, y: fy * H, w: fw * W, h: fh * H, rotation: 0, opacity: 1, content,
    fontFamily: 'Space Grotesk', fontWeight: 600, color: '#232323', align: 'left', valign: 'top', lineHeight: 1.2, italic: false,
    uppercase: false, letterSpacing: 0, ...o, fontSize: o.size * W,
  })
  const rect = (name: string, fx: number, fy: number, fw: number, fh: number, fill: string, o: Partial<ShapeElement> = {}): ShapeElement => ({
    id: uid(), name, type: 'shape', shape: 'rect', x: fx * W, y: fy * H, w: fw * W, h: fh * H, rotation: 0, opacity: 1,
    fill, stroke: null, strokeWidth: 0, radius: 0, ...o,
  })
  const photo = (name: string, fx: number, fy: number, fw: number, fh: number, o: Partial<ImageElement> = {}): ImageElement => ({
    id: uid(), name, type: 'image', src: { kind: 'none' }, x: fx * W, y: fy * H, w: fw * W, h: fh * H, rotation: 0, opacity: 1,
    fit: 'cover', focalX: 0.5, focalY: 0.5, zoom: 1, radius: 0, ...o,
  })
  const logo = (fx: number, fy: number, fw: number, fh: number): ImageElement => photo('Logo', fx, fy, fw, fh, { src: { kind: 'logo' }, fit: 'contain' })
  return { text, rect, photo, logo }
}
const page = (bg: string, elements: Element[], name?: string): Page => ({ id: uid('p'), background: bg, elements, name })

const PH = {
  verse: 'Escreva aqui o texto do versículo',
  ref: 'Livro capítulo:versículo',
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    key: 'invite', name: 'Convite para o GC', category: 'invite', defaultFormat: 'feed_vertical',
    description: 'Convida novas pessoas, com dia, horário e endereço cadastrados.',
    build: ctx => {
      const { W, H, brand: b } = ctx, k = kit(ctx), ink = readableOn(b.primary)
      return [page(b.secondary, [
        k.rect('Faixa', 0, 0, 1, 0.14, b.primary),
        k.text('Rótulo', 0.08, 0.04, 0.84, 0.06, 'CONVITE', { size: 0.04, fontFamily: 'Syne', fontWeight: 800, color: ink, letterSpacing: 6, valign: 'middle' }),
        k.text('Título', 0.08, 0.22, 0.84, 0.3, 'Venha fazer parte do nosso GC', { size: 0.1, fontFamily: 'Syne', fontWeight: 800, color: '#FFFFFF', lineHeight: 1.05 }),
        k.rect('Detalhe', 0.08, 0.56, 0.18, 0.008, b.primary),
        k.text('Quando', 0.08, 0.6, 0.84, 0.08, b.meeting ?? 'Dia e horário do encontro', { size: 0.05, color: b.primary, fontWeight: 700 }),
        k.text('Onde', 0.08, 0.68, 0.84, 0.1, b.address ?? 'Endereço do encontro', { size: 0.04, color: '#FFFFFFDD', fontWeight: 500 }),
        k.text('Nome do GC', 0.08, 0.86, 0.6, 0.06, b.groupName, { size: 0.04, color: '#FFFFFF', fontWeight: 700, valign: 'middle' }),
        k.logo(0.72, 0.82, 0.2, 0.12),
      ])]
    },
  },
  {
    key: 'verse', name: 'Versículo da semana', category: 'verse', defaultFormat: 'feed_square',
    description: 'Espaço para o versículo e a referência. Confira o texto em uma fonte confiável.',
    build: ctx => {
      const b = ctx.brand, k = kit(ctx)
      return [page('#FFFFFF', [
        k.rect('Barra', 0, 0, 0.04, 1, b.primary),
        k.text('Rótulo', 0.1, 0.08, 0.8, 0.06, 'VERSÍCULO DA SEMANA', { size: 0.035, fontWeight: 700, color: '#6B6B66', letterSpacing: 5 }),
        k.text('Versículo', 0.1, 0.22, 0.8, 0.5, PH.verse, { size: 0.07, fontFamily: 'Playfair Display', fontWeight: 600, lineHeight: 1.3, valign: 'middle' }),
        k.text('Referência', 0.1, 0.76, 0.8, 0.06, PH.ref, { size: 0.04, fontWeight: 700, color: '#7A5900' }),
        k.text('Nome do GC', 0.1, 0.9, 0.6, 0.05, b.groupName, { size: 0.03, color: '#6B6B66' }),
        k.logo(0.78, 0.86, 0.12, 0.1),
      ])]
    },
  },
  {
    key: 'devotional', name: 'Devocional', category: 'devotional', defaultFormat: 'feed_vertical',
    description: 'Título, texto de apoio e chamada para reflexão.',
    build: ctx => {
      const b = ctx.brand, k = kit(ctx)
      return [page('#FAF8F2', [
        k.rect('Topo', 0, 0, 1, 0.012, b.primary),
        k.text('Rótulo', 0.08, 0.06, 0.6, 0.05, 'DEVOCIONAL', { size: 0.035, fontWeight: 700, color: '#7A5900', letterSpacing: 5 }),
        k.text('Título', 0.08, 0.13, 0.84, 0.16, 'Título do devocional', { size: 0.08, fontFamily: 'Syne', fontWeight: 800, lineHeight: 1.1 }),
        k.text('Texto', 0.08, 0.32, 0.84, 0.46, 'Escreva aqui o texto do devocional. Mantenha parágrafos curtos para facilitar a leitura no celular.', { size: 0.042, fontWeight: 400, lineHeight: 1.45, color: '#3A3A36' }),
        k.rect('Caixa', 0.08, 0.82, 0.84, 0.1, b.primary, { radius: 24 }),
        k.text('Pergunta', 0.11, 0.82, 0.78, 0.1, 'Pergunta para refletir', { size: 0.038, color: readableOn(b.primary), valign: 'middle', fontWeight: 700 }),
      ])]
    },
  },
  {
    key: 'reflection', name: 'Frase de reflexão', category: 'reflection', defaultFormat: 'feed_square',
    description: 'Frase curta de impacto sobre a cor do GC.',
    build: ctx => {
      const b = ctx.brand, k = kit(ctx), ink = readableOn(b.primary)
      return [page(b.primary, [
        k.text('Aspas', 0.08, 0.06, 0.2, 0.2, '“', { size: 0.3, fontFamily: 'Playfair Display', fontWeight: 800, color: withAlpha(ink, 0.35) }),
        k.text('Frase', 0.1, 0.25, 0.8, 0.5, 'Escreva aqui a frase de reflexão', { size: 0.085, fontFamily: 'Syne', fontWeight: 800, color: ink, valign: 'middle', lineHeight: 1.15 }),
        k.text('Nome do GC', 0.1, 0.86, 0.6, 0.06, b.groupName, { size: 0.035, color: ink, fontWeight: 700 }),
        k.logo(0.78, 0.82, 0.12, 0.12),
      ])]
    },
  },
  {
    key: 'testimony', name: 'Testemunho autorizado', category: 'testimony', defaultFormat: 'feed_vertical',
    description: 'Somente com autorização da pessoa. O texto de autorização é editável.',
    build: ctx => {
      const b = ctx.brand, k = kit(ctx)
      return [page('#FFFFFF', [
        k.rect('Fundo', 0, 0, 1, 0.34, b.secondary),
        k.photo('foto', 0.34, 0.14, 0.32, 0.32 * ctx.W / ctx.H, { radius: 9999 }),
        k.text('Rótulo', 0.08, 0.05, 0.84, 0.05, 'TESTEMUNHO', { size: 0.035, fontWeight: 700, color: b.primary, letterSpacing: 6, align: 'center' }),
        k.text('Texto', 0.1, 0.5, 0.8, 0.28, 'Escreva aqui o testemunho, exatamente como a pessoa autorizou.', { size: 0.045, fontFamily: 'Playfair Display', fontWeight: 500, align: 'center', lineHeight: 1.35, italic: true }),
        k.text('Nome', 0.1, 0.8, 0.8, 0.05, 'Nome de quem autorizou', { size: 0.04, fontWeight: 700, align: 'center' }),
        k.text('Autorização', 0.1, 0.87, 0.8, 0.05, 'Publicado com autorização da pessoa.', { size: 0.026, color: '#6B6B66', align: 'center', fontWeight: 400 }),
      ])]
    },
  },
  {
    key: 'event', name: 'Anúncio de evento', category: 'event', defaultFormat: 'feed_vertical',
    description: 'Foto de destaque, nome do evento, data e local.',
    build: ctx => {
      const b = ctx.brand, k = kit(ctx), ink = readableOn(b.primary)
      return [page('#FFFFFF', [
        k.photo('foto', 0, 0, 1, 0.52),
        k.rect('Faixa', 0, 0.52, 1, 0.48, b.secondary),
        k.rect('Selo', 0.08, 0.46, 0.34, 0.07, b.primary, { radius: 18 }),
        k.text('Selo texto', 0.08, 0.46, 0.34, 0.07, 'PRÓXIMO EVENTO', { size: 0.03, fontWeight: 800, color: ink, align: 'center', valign: 'middle', letterSpacing: 2 }),
        k.text('Nome do evento', 0.08, 0.57, 0.84, 0.17, 'Nome do evento', { size: 0.085, fontFamily: 'Syne', fontWeight: 800, color: '#FFFFFF', lineHeight: 1.05 }),
        k.text('Data e hora', 0.08, 0.75, 0.84, 0.07, 'Data e horário', { size: 0.05, fontWeight: 700, color: b.primary }),
        k.text('Local', 0.08, 0.82, 0.84, 0.08, b.address ?? 'Local do evento', { size: 0.038, fontWeight: 500, color: '#FFFFFFDD' }),
        k.logo(0.76, 0.88, 0.16, 0.09),
      ])]
    },
  },
  {
    key: 'notice', name: 'Aviso importante', category: 'notice', defaultFormat: 'feed_square',
    description: 'Comunicados curtos com destaque visual.',
    build: ctx => {
      const b = ctx.brand, k = kit(ctx), ink = readableOn(b.primary)
      return [page('#FFFFFF', [
        k.rect('Banner', 0, 0, 1, 0.2, b.primary),
        k.text('Título', 0.08, 0, 0.84, 0.2, 'AVISO IMPORTANTE', { size: 0.07, fontFamily: 'Syne', fontWeight: 800, color: ink, valign: 'middle' }),
        k.text('Aviso', 0.08, 0.28, 0.84, 0.48, 'Escreva aqui o aviso com as informações essenciais.', { size: 0.06, fontWeight: 600, lineHeight: 1.3 }),
        k.rect('Linha', 0.08, 0.8, 0.84, 0.004, '#D9D6CC'),
        k.text('Nome do GC', 0.08, 0.84, 0.6, 0.06, b.groupName, { size: 0.035, color: '#6B6B66', fontWeight: 700 }),
        k.logo(0.76, 0.82, 0.16, 0.12),
      ])]
    },
  },
  {
    key: 'thanks', name: 'Agradecimento pela presença', category: 'thanks', defaultFormat: 'feed_square',
    description: 'Foto do encontro ao fundo com mensagem de gratidão.',
    build: ctx => {
      const b = ctx.brand, k = kit(ctx)
      return [page(b.secondary, [
        k.photo('foto', 0, 0, 1, 1),
        k.rect('Véu', 0, 0, 1, 1, '#00000088'),
        k.text('Mensagem', 0.1, 0.3, 0.8, 0.3, 'Obrigado pela presença!', { size: 0.12, fontFamily: 'Syne', fontWeight: 800, color: '#FFFFFF', align: 'center', valign: 'middle', lineHeight: 1.05 }),
        k.text('Subtítulo', 0.1, 0.62, 0.8, 0.1, 'Foi muito bom ter você com a gente.', { size: 0.04, color: '#FFFFFFEE', align: 'center', fontWeight: 500 }),
        k.text('Nome do GC', 0.1, 0.86, 0.8, 0.06, b.groupName, { size: 0.035, color: b.primary, align: 'center', fontWeight: 800 }),
      ])]
    },
  },
  {
    key: 'meeting_photo', name: 'Foto do encontro', category: 'meeting_photo', defaultFormat: 'feed_vertical',
    description: 'Foto em destaque com legenda curta.',
    build: ctx => {
      const b = ctx.brand, k = kit(ctx), ink = readableOn(b.primary)
      return [page('#FFFFFF', [
        k.photo('foto', 0.05, 0.04, 0.9, 0.78, { radius: 32 }),
        k.rect('Barra', 0.05, 0.86, 0.01, 0.08, b.primary),
        k.text('Legenda', 0.08, 0.86, 0.6, 0.08, 'Legenda da foto', { size: 0.04, fontWeight: 700, valign: 'middle' }),
        k.rect('Selo', 0.72, 0.87, 0.23, 0.06, b.primary, { radius: 16 }),
        k.text('Selo texto', 0.72, 0.87, 0.23, 0.06, b.groupName, { size: 0.022, fontWeight: 800, color: ink, align: 'center', valign: 'middle' }),
      ])]
    },
  },
  {
    key: 'team_photo', name: 'Foto de equipe ou voluntários', category: 'team_photo', defaultFormat: 'feed_vertical',
    description: 'Apresenta a equipe com foto e lista de nomes.',
    build: ctx => {
      const b = ctx.brand, k = kit(ctx)
      return [page(b.secondary, [
        k.text('Título', 0.08, 0.05, 0.84, 0.1, 'Nossa equipe', { size: 0.09, fontFamily: 'Syne', fontWeight: 800, color: '#FFFFFF' }),
        k.photo('foto', 0.08, 0.18, 0.84, 0.5, { radius: 28 }),
        k.text('Nomes', 0.08, 0.72, 0.84, 0.18, 'Nome 1 · Nome 2 · Nome 3', { size: 0.04, color: '#FFFFFF', fontWeight: 500, lineHeight: 1.4 }),
        k.rect('Detalhe', 0.08, 0.92, 0.18, 0.006, b.primary),
        k.text('Agradecimento', 0.08, 0.93, 0.84, 0.05, 'Gratidão a quem serve.', { size: 0.03, color: b.primary, fontWeight: 700 }),
      ])]
    },
  },
  {
    key: 'carousel', name: 'Carrossel educativo', category: 'carousel', defaultFormat: 'carousel',
    description: 'Capa e duas páginas internas. Duplique páginas para ampliar.',
    build: ctx => {
      const b = ctx.brand, k = kit(ctx), ink = readableOn(b.primary)
      const inner = (n: number) => page('#FFFFFF', [
        k.rect('Número fundo', 0.08, 0.08, 0.14, 0.14 * ctx.W / ctx.H, b.primary, { radius: 9999 }),
        k.text('Número', 0.08, 0.08, 0.14, 0.14 * ctx.W / ctx.H, String(n), { size: 0.07, fontFamily: 'Syne', fontWeight: 800, color: ink, align: 'center', valign: 'middle' }),
        k.text('Título', 0.08, 0.28, 0.84, 0.14, `Ponto ${n}`, { size: 0.08, fontFamily: 'Syne', fontWeight: 800, lineHeight: 1.1 }),
        k.text('Texto', 0.08, 0.44, 0.84, 0.4, 'Explique o ponto com poucas linhas.', { size: 0.045, fontWeight: 400, lineHeight: 1.4, color: '#3A3A36' }),
        k.text('Nome do GC', 0.08, 0.92, 0.6, 0.04, b.groupName, { size: 0.026, color: '#6B6B66' }),
      ], `Página ${n + 1}`)
      return [
        page(b.secondary, [
          k.text('Rótulo', 0.08, 0.08, 0.84, 0.05, 'DESLIZE PARA O LADO', { size: 0.03, fontWeight: 700, color: b.primary, letterSpacing: 5 }),
          k.text('Título', 0.08, 0.3, 0.84, 0.35, 'Título do carrossel', { size: 0.11, fontFamily: 'Syne', fontWeight: 800, color: '#FFFFFF', lineHeight: 1.05 }),
          k.rect('Detalhe', 0.08, 0.68, 0.2, 0.008, b.primary),
          k.text('Subtítulo', 0.08, 0.72, 0.84, 0.1, 'Subtítulo da série', { size: 0.04, color: '#FFFFFFDD', fontWeight: 500 }),
          k.logo(0.72, 0.86, 0.2, 0.09),
        ], 'Capa'),
        inner(1), inner(2),
      ]
    },
  },
  {
    key: 'prayer', name: 'Chamada para pedir oração', category: 'prayer', defaultFormat: 'story',
    description: 'Convida a enviar pedidos de oração pelo link na bio.',
    build: ctx => {
      const b = ctx.brand, k = kit(ctx), ink = readableOn(b.primary)
      return [page(b.secondary, [
        k.text('Título', 0.1, 0.2, 0.8, 0.3, 'Como podemos orar por você?', { size: 0.11, fontFamily: 'Syne', fontWeight: 800, color: '#FFFFFF', lineHeight: 1.08, valign: 'middle' }),
        k.text('Texto', 0.1, 0.52, 0.8, 0.14, 'Envie seu pedido de oração pelo link da nossa bio.', { size: 0.045, color: '#FFFFFFDD', fontWeight: 400, lineHeight: 1.35 }),
        k.rect('Botão', 0.1, 0.72, 0.8, 0.07, b.primary, { radius: 9999 }),
        k.text('Botão texto', 0.1, 0.72, 0.8, 0.07, 'LINK NA BIO', { size: 0.04, fontWeight: 800, color: ink, align: 'center', valign: 'middle', letterSpacing: 3 }),
        k.text('Nome do GC', 0.1, 0.9, 0.8, 0.04, b.groupName, { size: 0.03, color: b.primary, fontWeight: 700, align: 'center' }),
      ])]
    },
  },
]

export function instantiateTemplate(key: string, format: PostFormat, brand: Brand, photoMediaId?: string): Design {
  const t = BUILTIN_TEMPLATES.find(x => x.key === key)
  const spec = FORMAT_SPECS[format]
  if (!t) throw new Error(`Template desconhecido: ${key}`)
  const pages = t.build({ W: spec.width, H: spec.height, brand })
  if (photoMediaId) {
    for (const p of pages) for (const e of p.elements) if (e.type === 'image' && e.name === 'foto' && e.src.kind === 'none') e.src = { kind: 'media', mediaId: photoMediaId }
  }
  return { version: 1, format, width: spec.width, height: spec.height, pages }
}

export interface EventArt { name: string; when: string; where: string | null }
/** Preenche o template de evento com dados reais (nome, data/hora e local). Não inventa informações ausentes. */
export function applyEventData(d: Design, ev: EventArt): Design {
  const set = (name: string, content: string | null) => (e: Element): Element =>
    e.type === 'text' && e.name === name && content ? { ...e, content } : e
  return { ...d, pages: d.pages.map(p => ({ ...p, elements: p.elements.map(set('Nome do evento', ev.name)).map(set('Data e hora', ev.when)).map(set('Local', ev.where)) })) }
}
