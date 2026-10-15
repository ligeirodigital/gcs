import { db } from './db'
import { designSchema, emptyDesign, resizeDesign, uid, type Design, type PostFormat } from '../studio/model'
import { instantiateTemplate, type Brand } from '../studio/templates'

/** Copia um projeto com novos ids (páginas e elementos). */
export function cloneDesign(d: Design): Design {
  return { ...d, pages: d.pages.map(p => ({ ...p, id: uid('p'), elements: p.elements.map(e => ({ ...e, id: uid() })) })) }
}

export type TemplateSource = { kind: 'blank' } | { kind: 'builtin'; key: string } | { kind: 'group'; design: unknown; format: PostFormat }

export function buildDesign(src: TemplateSource, format: PostFormat, brand: Brand, photoMediaId?: string): Design {
  if (src.kind === 'builtin') return instantiateTemplate(src.key, format, brand, photoMediaId)
  if (src.kind === 'group') {
    const parsed = designSchema.safeParse(src.design)
    if (!parsed.success) throw new Error('O template salvo está corrompido.')
    let d = cloneDesign(parsed.data)
    if (d.format !== format) d = resizeDesign(d, format)
    return d
  }
  return emptyDesign(format)
}

/** Cria o projeto (linha em posts) no GC ativo. group_id é validado pelo RLS do banco. */
export async function createProject(groupId: string, title: string, design: Design): Promise<string> {
  const { data, error } = await db.from('posts').insert({ group_id: groupId, title, format: design.format, design, status: 'draft' }).select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}
