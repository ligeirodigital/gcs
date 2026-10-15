# GC Digital — configuração (Etapa 1)

1. **Aplicar migrations** (em ordem): `20261014120000_gc_core_multitenancy.sql` e, depois do passo 2, `20261014120100_agency_site_admin_lockdown.sql`.
2. **Cadastrar o administrador da plataforma** (processo confiável, SQL Editor do Supabase; não existe caminho pelo navegador):
   ```sql
   INSERT INTO public.platform_admins (user_id) SELECT id FROM auth.users WHERE email = 'SEU_EMAIL';
   ```
   Faça isso **antes** da migration `..._agency_site_admin_lockdown`, que restringe o `/admin` do site da agência a esse administrador.
3. **Auth** (Dashboard → Authentication): manter confirmação de e-mail ligada (o aceite de convite exige e-mail verificado) e incluir
   `https://SEU_DOMINIO/app/redefinir-senha` e `https://SEU_DOMINIO/app` em *Redirect URLs*. Configurar SMTP próprio para produção.
4. Regenerar `src/integrations/supabase/types.ts` (`supabase gen types typescript`).
5. **Etapa 2**: aplicar `20261015120000_gc_content_events_visitors.sql` (cria o bucket privado `media`, 10 MB, PNG/JPEG/WebP).
6. **Retenção LGPD**: agendar `select public.purge_expired_visitors();` (pg_cron ou Edge Function agendada com service role), ex.: diariamente. Prazo padrão: 12 meses (`visitors.retention_until`).
7. **Etapa 3**: aplicar `20261016120000_group_member_names.sql`. Os 12 templates nativos ficam no código (`src/gc/studio/templates.ts`); templates do GC ficam na tabela `templates`.
8. **Etapa 4**: aplicar `20261017120000_public_pages_and_forms.sql` e publicar as Edge Functions:
   ```
   supabase functions deploy track submit-form --no-verify-jwt
   supabase secrets set ANALYTICS_SALT=$(openssl rand -hex 32) ALLOWED_ORIGINS=https://SEU_DOMINIO
   # opcional (captcha): supabase secrets set TURNSTILE_SECRET=...
   ```
   As funções usam o service role (`SUPABASE_SERVICE_ROLE_KEY`, injetado pelo Supabase no servidor; nunca vai ao navegador).
   Sem `TURNSTILE_SECRET` o captcha fica desligado: a proteção é honeypot + tempo mínimo + limite por IP (5/10 min) e por GC (60/h).
9. A política de privacidade (`/privacidade`) é um texto-base: revise com a assessoria jurídica da igreja.
11. **Etapa 5**: aplicar `20261018120000_visitor_history.sql` (histórico de situação/responsável gravado pelo servidor).
13. **Etapa 6 (IA)**: `supabase functions deploy ai-generate` (esta função EXIGE JWT) e `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`.
    Opcional: `AI_MODEL` (padrão `claude-opus-5-5`; o conteúdo dos GCs vai ao provedor escolhido, então informe isso na política de privacidade).
    Sem a chave, o assistente mostra "integração não configurada" e não gera nada. Limites: 20 gerações/hora por usuário e 200/dia por GC.
15. **Etapa 7**: aplicar `20261019120000_metrics.sql` (função `metrics_summary` e tabela `manual_metrics`). Nenhuma configuração externa adicional.
16. Testes de autorização/isolamento (PostgreSQL local, sem Supabase): `npm run test:db`.
6. Testes de unidade do estúdio (modelo, templates, exportação): `npm test`.

## Verificações automáticas deste repositório
- `npm run test:db` — migrations + testes de autorização/isolamento em PostgreSQL local (5 arquivos em `supabase/tests`).
- `npm test` — testes de unidade (estúdio, Edge Functions, formulários públicos, IA, métricas, calendário, CSV).
- Acessibilidade: as telas foram verificadas com axe-core (WCAG 2.0/2.1 A e AA + boas práticas) em desktop e celular, sem violações.
