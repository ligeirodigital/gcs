import { describe, expect, it } from 'vitest'
import {
  FORMAT_SPECS, FORMATS, addElement, addPage, duplicateElement, duplicatePage, emptyDesign, mediaIdsInDesign, movePage, newImage, newShape, newText,
  parseDesign, patchElement, removeElement, removePage, reorderElement, resizeDesign, designSchema,
} from '../model'
import { BUILTIN_TEMPLATES, instantiateTemplate, readableOn, CATEGORY_LABEL, type Brand } from '../templates'
import { wrapText } from '../layout'
import { exportDimensions, pageFileName, safeFileName } from '../export'

const brand: Brand = { groupName: 'GC Esperança', primary: '#E3AE00', secondary: '#2B2B2B', hasLogo: true, meeting: 'Quinta-feira, às 19:30', address: 'Rua das Flores, 100' }

describe('formatos', () => {
  it('têm as dimensões exigidas', () => {
    expect(FORMAT_SPECS.feed_vertical).toMatchObject({ width: 1080, height: 1350 })
    expect(FORMAT_SPECS.feed_square).toMatchObject({ width: 1080, height: 1080 })
    expect(FORMAT_SPECS.story).toMatchObject({ width: 1080, height: 1920 })
    expect(FORMAT_SPECS.carousel).toMatchObject({ width: 1080, height: 1350 })
  })
})

describe('templates iniciais', () => {
  it('são 12, com categorias distintas e todas as categorias exigidas', () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(12)
    const cats = BUILTIN_TEMPLATES.map(t => t.category)
    for (const c of ['invite', 'verse', 'devotional', 'reflection', 'testimony', 'event', 'notice', 'thanks', 'meeting_photo', 'team_photo', 'carousel', 'prayer'])
      expect(cats).toContain(c)
    expect(new Set(BUILTIN_TEMPLATES.map(t => t.key)).size).toBe(12)
    cats.forEach(c => expect(CATEGORY_LABEL[c]).toBeTruthy())
  })
  for (const t of BUILTIN_TEMPLATES) {
    for (const f of FORMATS) {
      it(`${t.key} em ${f} gera projeto válido e dentro da página`, () => {
        const d = instantiateTemplate(t.key, f, brand)
        expect(designSchema.safeParse(d).success).toBe(true)
        expect(d.width).toBe(FORMAT_SPECS[f].width)
        for (const p of d.pages) for (const e of p.elements) {
          expect(e.x).toBeGreaterThanOrEqual(-1); expect(e.y).toBeGreaterThanOrEqual(-1)
          expect(e.x + e.w).toBeLessThanOrEqual(d.width + 1); expect(e.y + e.h).toBeLessThanOrEqual(d.height + 1)
        }
      })
    }
  }
  it('carrossel tem capa e páginas internas', () => {
    expect(instantiateTemplate('carousel', 'carousel', brand).pages.length).toBeGreaterThanOrEqual(3)
  })
  it('usa dados cadastrados e não inventa horário/endereço quando ausentes', () => {
    const withData = JSON.stringify(instantiateTemplate('invite', 'feed_vertical', brand))
    expect(withData).toContain('Quinta-feira, às 19:30'); expect(withData).toContain('Rua das Flores, 100')
    const without = JSON.stringify(instantiateTemplate('invite', 'feed_vertical', { ...brand, meeting: null, address: null }))
    expect(without).toContain('Dia e horário do encontro'); expect(without).not.toContain('Quinta')
  })
  it('versículo não traz citação bíblica pré-preenchida', () => {
    const s = JSON.stringify(instantiateTemplate('verse', 'feed_square', brand))
    expect(s).toContain('Livro capítulo:versículo')
  })
  it('foto escolhida é encaixada no espaço "foto"', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    expect(mediaIdsInDesign(instantiateTemplate('event', 'feed_vertical', brand, id))).toEqual([id])
    expect(mediaIdsInDesign(instantiateTemplate('event', 'feed_vertical', brand))).toEqual([])
  })
  it('texto tem contraste legível sobre a cor de destaque', () => {
    expect(readableOn('#E3AE00')).toBe('#232323'); expect(readableOn('#1A237E')).toBe('#FFFFFF')
  })
})

describe('operações do projeto', () => {
  it('adiciona, edita, duplica, reordena e remove elementos', () => {
    let d = emptyDesign('feed_square')
    const t = newText(d, { content: 'Olá' }); d = addElement(d, 0, t)
    d = addElement(d, 0, newShape(d, 'rect'))
    d = patchElement(d, 0, t.id, { content: 'Mudou' } as never)
    expect((d.pages[0].elements[0] as { content: string }).content).toBe('Mudou')
    const dup = duplicateElement(d, 0, t.id); d = dup.design
    expect(d.pages[0].elements).toHaveLength(3); expect(dup.newId).not.toBe(t.id)
    d = reorderElement(d, 0, t.id, 'front'); expect(d.pages[0].elements.at(-1)?.id).toBe(t.id)
    d = reorderElement(d, 0, t.id, 'back'); expect(d.pages[0].elements[0].id).toBe(t.id)
    d = removeElement(d, 0, t.id); expect(d.pages[0].elements).toHaveLength(2)
    expect(designSchema.safeParse(d).success).toBe(true)
  })
  it('duplica, move e remove páginas (sem remover a última) respeitando o limite', () => {
    let d = emptyDesign('carousel'); d = addElement(d, 0, newText(d))
    d = duplicatePage(d, 0); expect(d.pages).toHaveLength(2)
    expect(d.pages[1].elements[0].id).not.toBe(d.pages[0].elements[0].id)
    const first = d.pages[0].id; d = movePage(d, 0, 1); expect(d.pages[1].id).toBe(first)
    d = removePage(d, 0); d = removePage(d, 0); expect(d.pages).toHaveLength(1)
    for (let i = 0; i < 30; i++) d = addPage(d)
    expect(d.pages).toHaveLength(20)
  })
  it('troca de formato reposiciona proporcionalmente', () => {
    let d = emptyDesign('feed_square'); d = addElement(d, 0, newText(d, { x: 0, y: 540, w: 1080, h: 100 }))
    const r = resizeDesign(d, 'story')
    expect(r.height).toBe(1920); expect(r.pages[0].elements[0].y).toBeCloseTo(960)
  })
  it('valida projetos corrompidos', () => {
    expect(parseDesign({ version: 2 }).ok).toBe(false)
    const d = emptyDesign('story')
    expect(parseDesign(JSON.parse(JSON.stringify(d))).ok).toBe(true)
    const bad = JSON.parse(JSON.stringify(addElement(d, 0, newImage(d, { kind: 'media', mediaId: 'nao-uuid' }))))
    expect(parseDesign(bad).ok).toBe(false)
    const badColor = JSON.parse(JSON.stringify(addElement(d, 0, newText(d, { color: 'red' }))))
    expect(parseDesign(badColor).ok).toBe(false)
  })
})

describe('quebra de texto', () => {
  const m = (s: string) => s.length * 10
  it('quebra por palavras, parágrafos e palavras gigantes', () => {
    expect(wrapText('uma frase de teste', 100, m)).toEqual(['uma frase', 'de teste'])
    expect(wrapText('a\n\nb', 100, m)).toEqual(['a', '', 'b'])
    expect(wrapText('abcdefghijklmno', 50, m)).toEqual(['abcde', 'fghij', 'klmno'])
  })
})

describe('exportação', () => {
  it('calcula a resolução de saída', () => {
    const d = emptyDesign('story')
    expect(exportDimensions(d, 1080)).toMatchObject({ width: 1080, height: 1920, scale: 1 })
    expect(exportDimensions(d, 2160)).toMatchObject({ width: 2160, height: 3840, scale: 2 })
    expect(exportDimensions(d, 720)).toMatchObject({ width: 720, height: 1280 })
  })
  it('gera nomes de arquivo seguros e numerados', () => {
    expect(safeFileName('Convite — GC Esperança!')).toBe('convite-gc-esperanca')
    expect(safeFileName('???')).toBe('arte')
    expect(pageFileName('Dicas', 0, 1, 'png')).toBe('dicas.png')
    expect(pageFileName('Dicas', 2, 5, 'jpeg')).toBe('dicas-03.jpg')
  })
})
