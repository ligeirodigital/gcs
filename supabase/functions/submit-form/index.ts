import { createClient } from '@supabase/supabase-js'
import { handleSubmit } from '../_shared/public.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
Deno.serve(req => handleSubmit(req, {
  rpc: (name, args) => admin.rpc(name, args) as never,
  env: { salt: Deno.env.get('ANALYTICS_SALT') ?? '', turnstileSecret: Deno.env.get('TURNSTILE_SECRET') ?? undefined, allowedOrigins: Deno.env.get('ALLOWED_ORIGINS') ?? undefined },
}))
