import { z } from 'zod'

export const slugSchema = z.string().trim().toLowerCase()
  .min(3, 'Mínimo de 3 caracteres').max(50, 'Máximo de 50 caracteres')
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use apenas letras minúsculas, números e hífens')
  .refine(s => !['admin', 'api', 'app', 'login', 'convite', 'gc', 'www', 'static', 'assets'].includes(s), 'Este endereço é reservado')

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida')

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
})
export const signupSchema = z.object({
  displayName: z.string().trim().min(2, 'Informe seu nome').max(120),
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres'),
})
export const emailSchema = z.object({ email: z.string().trim().toLowerCase().email('E-mail inválido') })
export const newPasswordSchema = z.object({
  password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres'),
  confirm: z.string(),
}).refine(v => v.password === v.confirm, { path: ['confirm'], message: 'As senhas não conferem' })

export const churchSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da igreja').max(120),
  slug: slugSchema,
  website_url: z.string().trim().url('Endereço inválido (inclua https://)').or(z.literal('')),
})
export const groupBasicSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do GC').max(120),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
})
export const brandSchema = z.object({ primary_color: color, secondary_color: color })
export const meetingSchema = z.object({
  address: z.string().trim().max(300).optional().or(z.literal('')),
  meeting_weekday: z.string().regex(/^[0-6]$/, 'Escolha o dia').or(z.literal('')),
  meeting_time: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido').or(z.literal('')),
}).refine(v => (v.meeting_weekday === '') === (v.meeting_time === ''), { path: ['meeting_time'], message: 'Informe dia e horário juntos' })
export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  role: z.enum(['gc_leader', 'communicator', 'welcome_team', 'viewer']),
})
export const profileSchema = z.object({
  display_name: z.string().trim().min(2, 'Informe seu nome').max(120),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
})

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const MAX_BRANDING_BYTES = 2 * 1024 * 1024
export function validateImage(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return 'Formato não suportado. Use PNG, JPEG ou WebP.'
  if (file.size > MAX_BRANDING_BYTES) return 'A imagem deve ter no máximo 2 MB.'
  return null
}

export type In<S extends z.ZodTypeAny> = z.input<S>
export type Out<S extends z.ZodTypeAny> = z.output<S>
