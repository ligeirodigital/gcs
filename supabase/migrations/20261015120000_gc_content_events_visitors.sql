-- GC Digital — Etapa 2: entidades restantes, RLS por operação/perfil, armazenamento privado.
-- Regras gerais: toda tabela de GC tem group_id (imutável, validado por RLS); referências entre tabelas
-- do mesmo GC usam chave estrangeira composta (id, group_id) para impedir vínculos entre GCs.

-- ============ tipos ============
CREATE TYPE public.post_format AS ENUM ('feed_vertical','feed_square','story','carousel');
CREATE TYPE public.post_status AS ENUM ('idea','draft','in_review','approved','scheduled','published','cancelled');
CREATE TYPE public.event_status AS ENUM ('draft','published','cancelled','done');
CREATE TYPE public.visitor_source AS ENUM ('instagram','bio_link','member_referral','in_person','event','other');
CREATE TYPE public.visitor_status AS ENUM ('new','first_contact_done','invited','confirmed','visited','returned','integrated','not_interested');

ALTER TABLE public.groups ADD COLUMN require_approval BOOLEAN NOT NULL DEFAULT false;
GRANT UPDATE (require_approval) ON public.groups TO authenticated;

-- ============ helpers ============
CREATE OR REPLACE FUNCTION public.group_editor(_group UUID)       -- conteúdo: líder ou comunicação
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.has_group_role(_group, ARRAY['gc_leader','communicator']::public.app_role[]) $$;
CREATE OR REPLACE FUNCTION public.group_welcome(_group UUID)      -- acolhimento: líder ou equipe de acolhimento
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.has_group_role(_group, ARRAY['gc_leader','welcome_team']::public.app_role[]) $$;
REVOKE ALL ON FUNCTION public.group_editor, public.group_welcome FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.group_editor(UUID), public.group_welcome(UUID) TO authenticated;

-- group_id nunca muda
CREATE OR REPLACE FUNCTION public.immutable_group_id() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN RAISE EXCEPTION 'group_id é imutável'; END IF;
  RETURN NEW;
END $$;
-- autoria vem do servidor, nunca do cliente
CREATE OR REPLACE FUNCTION public.set_author() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END $$;
-- usuário referenciado (responsável/aprovador) precisa ser membro do mesmo GC
CREATE OR REPLACE FUNCTION public.check_member_of(_group UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _user IS NULL OR EXISTS (
    SELECT 1 FROM public.groups g JOIN public.memberships m
      ON (m.group_id = g.id OR (m.group_id IS NULL AND m.church_id = g.church_id))
    WHERE g.id = _group AND m.user_id = _user) $$;
REVOKE ALL ON FUNCTION public.check_member_of FROM PUBLIC, anon, authenticated;

-- ============ templates ============
-- group_id NULL = modelo nativo da plataforma (somente leitura para GCs; escrito por admin global).
CREATE TABLE public.templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  category   TEXT NOT NULL CHECK (category IN ('invite','verse','devotional','reflection','testimony','event','notice','thanks','meeting_photo','team_photo','carousel','prayer','other')),
  format     public.post_format NOT NULL,
  design     JSONB NOT NULL DEFAULT '{"pages":[]}'::jsonb,   -- elementos posicionáveis (posição, tamanho, estilo, conteúdo)
  is_builtin BOOLEAN GENERATED ALWAYS AS (group_id IS NULL) STORED,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, group_id)
);
CREATE INDEX templates_group_idx ON public.templates (group_id, category);

-- ============ eventos ============
CREATE TABLE public.events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id         UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  name             TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  description      TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
  starts_at        TIMESTAMPTZ NOT NULL,
  ends_at          TIMESTAMPTZ CHECK (ends_at IS NULL OR ends_at >= starts_at),
  address          TEXT CHECK (address IS NULL OR char_length(address) <= 300),
  responsible_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  image_media_id   UUID,
  registration_url TEXT CHECK (registration_url IS NULL OR registration_url ~* '^https?://'),
  status           public.event_status NOT NULL DEFAULT 'draft',
  show_address_publicly BOOLEAN NOT NULL DEFAULT false,      -- liberação explícita para a página pública
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, group_id)
);
CREATE INDEX events_group_start_idx ON public.events (group_id, starts_at);

-- ============ galeria ============
CREATE TABLE public.media_assets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,                         -- bucket privado "media": <group_id>/<arquivo>
  title        TEXT CHECK (title IS NULL OR char_length(title) <= 160),
  mime_type    TEXT NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp')),
  size_bytes   BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  width        INTEGER CHECK (width > 0), height INTEGER CHECK (height > 0),
  category     TEXT CHECK (category IS NULL OR char_length(category) <= 60),
  album        TEXT CHECK (album IS NULL OR char_length(album) <= 80),
  event_id     UUID,
  taken_on     DATE,
  kind         TEXT NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo','export')),   -- 'export' = arte exportada do estúdio
  uploaded_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, group_id),
  CHECK (storage_path LIKE group_id::text || '/%'),
  FOREIGN KEY (event_id, group_id) REFERENCES public.events (id, group_id) ON DELETE SET NULL (event_id)
);
CREATE INDEX media_group_idx ON public.media_assets (group_id, created_at DESC);
ALTER TABLE public.events ADD FOREIGN KEY (image_media_id, group_id) REFERENCES public.media_assets (id, group_id) ON DELETE SET NULL (image_media_id);

-- ============ conteúdos ============
CREATE TABLE public.posts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  title          TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  format         public.post_format NOT NULL,
  objective      TEXT CHECK (objective IS NULL OR char_length(objective) <= 300),
  caption        TEXT CHECK (caption IS NULL OR char_length(caption) <= 5000),
  design         JSONB,                                      -- projeto editável do estúdio (nunca só imagem achatada)
  template_id    UUID REFERENCES public.templates(id) ON DELETE SET NULL,
  art_media_id   UUID,
  event_id       UUID,
  status         public.post_status NOT NULL DEFAULT 'idea',
  planned_date   DATE,
  assignee_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approver_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes          TEXT CHECK (notes IS NULL OR char_length(notes) <= 2000),
  published_at   TIMESTAMPTZ,                                -- registro REAL da publicação (manual ou integração)
  published_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_url  TEXT CHECK (published_url IS NULL OR published_url ~* '^https?://'),
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, group_id),
  CHECK (status <> 'published' OR published_at IS NOT NULL),
  FOREIGN KEY (art_media_id, group_id) REFERENCES public.media_assets (id, group_id) ON DELETE SET NULL (art_media_id),
  FOREIGN KEY (event_id, group_id) REFERENCES public.events (id, group_id) ON DELETE SET NULL (event_id)
);
CREATE INDEX posts_group_date_idx ON public.posts (group_id, planned_date);
CREATE INDEX posts_group_status_idx ON public.posts (group_id, status);

CREATE TABLE public.post_versions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  post_id    UUID NOT NULL,
  version    INTEGER NOT NULL,
  design     JSONB,
  caption    TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, version),
  FOREIGN KEY (post_id, group_id) REFERENCES public.posts (id, group_id) ON DELETE CASCADE
);

-- ============ página pública ============
CREATE TABLE public.bio_pages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL UNIQUE REFERENCES public.groups(id) ON DELETE CASCADE,
  is_published BOOLEAN NOT NULL DEFAULT false,
  headline     TEXT CHECK (headline IS NULL OR char_length(headline) <= 120),
  bio          TEXT CHECK (bio IS NULL OR char_length(bio) <= 600),
  socials      JSONB NOT NULL DEFAULT '{}'::jsonb,
  contact      JSONB NOT NULL DEFAULT '{}'::jsonb,
  show_address BOOLEAN NOT NULL DEFAULT false,
  show_events  BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, group_id)
);

CREATE TABLE public.bio_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  bio_page_id UUID NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('join_gc','know_church','prayer_request','contact_leadership','next_meeting','directions','instagram','whatsapp','youtube','custom')),
  label       TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  url         TEXT CHECK (url IS NULL OR url ~* '^(https?://|mailto:|tel:)'),
  position    INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, group_id),
  FOREIGN KEY (bio_page_id, group_id) REFERENCES public.bio_pages (id, group_id) ON DELETE CASCADE
);
CREATE INDEX bio_links_page_idx ON public.bio_links (bio_page_id, position);

-- ============ acolhimento (dados pessoais: acesso mínimo e LGPD) ============
CREATE TABLE public.visitors (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  name              TEXT CHECK (name IS NULL OR char_length(name) BETWEEN 1 AND 120),
  phone             TEXT CHECK (phone IS NULL OR char_length(phone) <= 30),
  email             TEXT CHECK (email IS NULL OR (char_length(email) <= 160 AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  source            public.visitor_source NOT NULL DEFAULT 'other',
  event_id          UUID,
  first_contact_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  consent_given     BOOLEAN NOT NULL DEFAULT false,
  consent_at        TIMESTAMPTZ,
  consent_text_version TEXT,                                 -- versão da política/termo aceito
  owner_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status            public.visitor_status NOT NULL DEFAULT 'new',   -- sempre registro humano, nunca inferência
  next_action       TEXT CHECK (next_action IS NULL OR char_length(next_action) <= 200),
  next_action_at    TIMESTAMPTZ,
  retention_until   DATE NOT NULL DEFAULT (current_date + 365),     -- prazo de retenção padrão: 12 meses
  anonymized_at     TIMESTAMPTZ,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, group_id),
  CHECK (anonymized_at IS NOT NULL OR (consent_given AND consent_at IS NOT NULL)),   -- sem consentimento, sem registro
  FOREIGN KEY (event_id, group_id) REFERENCES public.events (id, group_id) ON DELETE SET NULL (event_id)
);
CREATE INDEX visitors_group_status_idx ON public.visitors (group_id, status);
CREATE INDEX visitors_retention_idx ON public.visitors (retention_until) WHERE anonymized_at IS NULL;

CREATE TABLE public.follow_up_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  visitor_id   UUID NOT NULL,
  title        TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  due_at       TIMESTAMPTZ,
  assignee_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  result       TEXT CHECK (result IS NULL OR char_length(result) <= 300),
  next_step    TEXT CHECK (next_step IS NULL OR char_length(next_step) <= 300),
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (visitor_id, group_id) REFERENCES public.visitors (id, group_id) ON DELETE CASCADE
);
CREATE INDEX tasks_group_open_idx ON public.follow_up_tasks (group_id, due_at) WHERE completed_at IS NULL;

CREATE TABLE public.visitor_interactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  visitor_id UUID NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('contact_attempt','note','result')),
  channel    TEXT CHECK (channel IS NULL OR channel IN ('phone','whatsapp','email','in_person','other')),
  content    TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),   -- notas objetivas, não prontuário
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (visitor_id, group_id) REFERENCES public.visitors (id, group_id) ON DELETE CASCADE
);
CREATE INDEX interactions_visitor_idx ON public.visitor_interactions (visitor_id, created_at DESC);

-- ============ métricas medidas pela plataforma (escritas só pelo servidor) ============
CREATE TABLE public.analytics_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL CHECK (event_type IN ('page_view','link_click','form_submit')),
  link_id     UUID REFERENCES public.bio_links(id) ON DELETE SET NULL,
  source      TEXT CHECK (source IS NULL OR char_length(source) <= 40),     -- origem (ex.: instagram), sem URL completa
  dedupe_key  TEXT,            -- hash diário com sal rotativo calculado pela Edge Function; sem IP/UA em claro
  day         DATE NOT NULL DEFAULT current_date,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX analytics_dedupe_uq ON public.analytics_events
  (group_id, event_type, COALESCE(link_id, '00000000-0000-0000-0000-000000000000'::uuid), dedupe_key, day) WHERE dedupe_key IS NOT NULL;
CREATE INDEX analytics_group_day_idx ON public.analytics_events (group_id, day, event_type);

CREATE TABLE public.ai_generations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  mode        TEXT NOT NULL CHECK (char_length(mode) <= 40),
  params      JSONB NOT NULL DEFAULT '{}'::jsonb,          -- parâmetros do formulário; sem dados pessoais
  provider    TEXT, model TEXT,
  status      TEXT NOT NULL CHECK (status IN ('succeeded','failed','not_configured')),
  input_tokens INTEGER, output_tokens INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_group_idx ON public.ai_generations (group_id, created_at DESC);

-- limitação de requisições para endpoints públicos (usada por Edge Functions com service role)
CREATE TABLE public.rate_limits (
  key          TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits         INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);
CREATE OR REPLACE FUNCTION public.check_rate_limit(_key TEXT, _max INTEGER, _window_seconds INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE w TIMESTAMPTZ := to_timestamp(floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds); h INTEGER;
BEGIN
  INSERT INTO public.rate_limits (key, window_start) VALUES (_key, w)
  ON CONFLICT (key, window_start) DO UPDATE SET hits = public.rate_limits.hits + 1 RETURNING hits INTO h;
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day';
  RETURN h <= _max;
END $$;
REVOKE ALL ON FUNCTION public.check_rate_limit FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

-- ============ triggers ============
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['templates','events','media_assets','posts','post_versions','bio_pages','bio_links','visitors',
                            'follow_up_tasks','visitor_interactions','analytics_events','ai_generations'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_group_immutable BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.immutable_group_id()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['templates','events','posts','visitors','follow_up_tasks','visitor_interactions'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_author BEFORE INSERT ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.set_author()', t);
  END LOOP;
END $$;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.media_set_uploader() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN NEW.uploaded_by := auth.uid(); RETURN NEW; END $$;
CREATE TRIGGER trg_media_uploader BEFORE INSERT ON public.media_assets FOR EACH ROW EXECUTE FUNCTION public.media_set_uploader();

-- responsáveis e aprovadores precisam pertencer ao GC
CREATE OR REPLACE FUNCTION public.validate_people() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME = 'posts' THEN
    IF NOT public.check_member_of(NEW.group_id, NEW.assignee_id) OR NOT public.check_member_of(NEW.group_id, NEW.approver_id) THEN
      RAISE EXCEPTION 'Responsável/aprovador deve ser membro do GC' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'events' THEN
    IF NOT public.check_member_of(NEW.group_id, NEW.responsible_id) THEN RAISE EXCEPTION 'Responsável deve ser membro do GC' USING ERRCODE = '23514'; END IF;
  ELSE
    IF NOT public.check_member_of(NEW.group_id, NEW.owner_id) THEN RAISE EXCEPTION 'Responsável deve ser membro do GC' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_posts_people    BEFORE INSERT OR UPDATE ON public.posts    FOR EACH ROW EXECUTE FUNCTION public.validate_people();
CREATE TRIGGER trg_events_people   BEFORE INSERT OR UPDATE ON public.events   FOR EACH ROW EXECUTE FUNCTION public.validate_people();
CREATE TRIGGER trg_visitors_people BEFORE INSERT OR UPDATE ON public.visitors FOR EACH ROW EXECUTE FUNCTION public.validate_people();

-- Fluxo de aprovação configurável: com require_approval, só líder ou aprovador designado move o post
-- para aprovado/agendado/publicado. Publicado exige registro real (published_at), gravado com autor.
CREATE OR REPLACE FUNCTION public.posts_workflow() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE req BOOLEAN;
BEGIN
  IF NEW.status IN ('approved','scheduled','published') AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN
    SELECT require_approval INTO req FROM public.groups WHERE id = NEW.group_id;
    IF req AND NOT (public.is_group_leader(NEW.group_id) OR COALESCE(auth.uid() = NEW.approver_id, false)) THEN
      RAISE EXCEPTION 'Este GC exige aprovação por líder ou aprovador designado' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
    NEW.published_by := auth.uid();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_posts_workflow BEFORE INSERT OR UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.posts_workflow();

CREATE OR REPLACE FUNCTION public.posts_snapshot() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.design IS DISTINCT FROM OLD.design OR NEW.caption IS DISTINCT FROM OLD.caption THEN
    INSERT INTO public.post_versions (group_id, post_id, version, design, caption, created_by)
    SELECT OLD.group_id, OLD.id, COALESCE(max(version), 0) + 1, OLD.design, OLD.caption, auth.uid()
      FROM public.post_versions WHERE post_id = OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_posts_snapshot AFTER UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.posts_snapshot();

-- Consentimento: carimba a data no servidor
CREATE OR REPLACE FUNCTION public.visitors_consent() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.consent_given AND NEW.consent_at IS NULL THEN NEW.consent_at := now(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_visitors_consent BEFORE INSERT OR UPDATE ON public.visitors FOR EACH ROW EXECUTE FUNCTION public.visitors_consent();

-- conclusão de tarefa: autor/hora gravados no servidor
CREATE OR REPLACE FUNCTION public.tasks_complete() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN NEW.completed_at := now(); NEW.completed_by := auth.uid();
  ELSIF NEW.completed_at IS NULL THEN NEW.completed_by := NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_tasks_complete BEFORE UPDATE ON public.follow_up_tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_complete();

-- ============ políticas RLS ============
-- templates
CREATE POLICY templates_select ON public.templates FOR SELECT TO authenticated USING (group_id IS NULL OR public.is_group_member(group_id));
CREATE POLICY templates_insert ON public.templates FOR INSERT TO authenticated WITH CHECK (
  (group_id IS NOT NULL AND public.group_editor(group_id)) OR (group_id IS NULL AND public.is_platform_admin()));
CREATE POLICY templates_update ON public.templates FOR UPDATE TO authenticated
  USING ((group_id IS NOT NULL AND public.group_editor(group_id)) OR (group_id IS NULL AND public.is_platform_admin()))
  WITH CHECK ((group_id IS NOT NULL AND public.group_editor(group_id)) OR (group_id IS NULL AND public.is_platform_admin()));
CREATE POLICY templates_delete ON public.templates FOR DELETE TO authenticated USING (
  (group_id IS NOT NULL AND public.group_editor(group_id)) OR (group_id IS NULL AND public.is_platform_admin()));

-- tabelas de conteúdo: todos os membros leem; líder/comunicação escrevem
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['events','media_assets','posts','bio_pages','bio_links'] LOOP
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$s FOR SELECT TO authenticated USING (public.is_group_member(group_id))', t);
    EXECUTE format('CREATE POLICY %1$s_insert ON public.%1$s FOR INSERT TO authenticated WITH CHECK (public.group_editor(group_id))', t);
    EXECUTE format('CREATE POLICY %1$s_update ON public.%1$s FOR UPDATE TO authenticated USING (public.group_editor(group_id)) WITH CHECK (public.group_editor(group_id))', t);
    EXECUTE format('CREATE POLICY %1$s_delete ON public.%1$s FOR DELETE TO authenticated USING (public.group_editor(group_id))', t);
  END LOOP;
  -- acolhimento: apenas líder e equipe de acolhimento (comunicação e consulta NÃO acessam contatos)
  FOREACH t IN ARRAY ARRAY['visitors','follow_up_tasks','visitor_interactions'] LOOP
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$s FOR SELECT TO authenticated USING (public.group_welcome(group_id))', t);
    EXECUTE format('CREATE POLICY %1$s_insert ON public.%1$s FOR INSERT TO authenticated WITH CHECK (public.group_welcome(group_id))', t);
    EXECUTE format('CREATE POLICY %1$s_update ON public.%1$s FOR UPDATE TO authenticated USING (public.group_welcome(group_id)) WITH CHECK (public.group_welcome(group_id))', t);
  END LOOP;
END $$;
-- exclusão definitiva de dados de visitantes: somente líder (equipe de acolhimento usa anonimização)
CREATE POLICY visitors_delete ON public.visitors FOR DELETE TO authenticated USING (public.is_group_leader(group_id));
CREATE POLICY follow_up_tasks_delete ON public.follow_up_tasks FOR DELETE TO authenticated USING (public.group_welcome(group_id));
-- histórico de interações é imutável para a equipe (sem UPDATE/DELETE direto): remove-se pela anonimização/exclusão do visitante
DROP POLICY visitor_interactions_update ON public.visitor_interactions;

-- somente leitura (escritas feitas por triggers/Edge Functions)
CREATE POLICY post_versions_select ON public.post_versions FOR SELECT TO authenticated USING (public.group_editor(group_id));
CREATE POLICY analytics_select ON public.analytics_events FOR SELECT TO authenticated USING (public.is_group_member(group_id));
CREATE POLICY ai_select ON public.ai_generations FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_group_leader(group_id));

-- ============ privilégios ============
REVOKE ALL ON public.templates, public.events, public.media_assets, public.posts, public.post_versions, public.bio_pages, public.bio_links,
  public.visitors, public.follow_up_tasks, public.visitor_interactions, public.analytics_events, public.ai_generations, public.rate_limits FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates, public.events, public.media_assets, public.posts, public.bio_pages, public.bio_links,
  public.follow_up_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitors TO authenticated;
GRANT SELECT, INSERT ON public.visitor_interactions TO authenticated;
GRANT SELECT ON public.post_versions, public.analytics_events, public.ai_generations TO authenticated;
GRANT ALL ON public.templates, public.events, public.media_assets, public.posts, public.post_versions, public.bio_pages, public.bio_links,
  public.visitors, public.follow_up_tasks, public.visitor_interactions, public.analytics_events, public.ai_generations, public.rate_limits TO service_role;

-- ============ LGPD: correção, anonimização e retenção ============
-- Anonimiza dados pessoais mantendo o registro agregado (status/origem) para métricas.
CREATE OR REPLACE FUNCTION public._anonymize_visitor_row(_id UUID) RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  WITH v AS (
    UPDATE public.visitors SET name = NULL, phone = NULL, email = NULL, next_action = NULL, owner_id = NULL, anonymized_at = now()
     WHERE id = _id AND anonymized_at IS NULL RETURNING id),
  i AS (DELETE FROM public.visitor_interactions WHERE visitor_id IN (SELECT id FROM v))
  UPDATE public.follow_up_tasks SET title = 'Tarefa removida (dados anonimizados)', result = NULL, next_step = NULL, assignee_id = NULL
   WHERE visitor_id IN (SELECT id FROM v)
$$;
REVOKE ALL ON FUNCTION public._anonymize_visitor_row FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.anonymize_visitor(p_id UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE g UUID;
BEGIN
  SELECT group_id INTO g FROM public.visitors WHERE id = p_id;
  IF g IS NULL OR NOT public.group_welcome(g) THEN RAISE EXCEPTION 'Visitante não encontrado' USING ERRCODE = 'P0002'; END IF;
  PERFORM public._anonymize_visitor_row(p_id);
  PERFORM public.write_audit((SELECT church_id FROM public.groups WHERE id = g), g, 'anonymize', 'visitor', p_id, '{}');
END $$;
REVOKE ALL ON FUNCTION public.anonymize_visitor FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anonymize_visitor(UUID) TO authenticated;

-- Retenção: deve ser agendada (pg_cron ou Edge Function agendada) com service role.
CREATE OR REPLACE FUNCTION public.purge_expired_visitors() RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r RECORD; n INTEGER := 0;
BEGIN
  FOR r IN SELECT id FROM public.visitors WHERE anonymized_at IS NULL AND retention_until < current_date LOOP
    PERFORM public._anonymize_visitor_row(r.id); n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.purge_expired_visitors FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_visitors() TO service_role;

-- auditoria de operações sensíveis em visitantes (sem gravar dados pessoais)
CREATE OR REPLACE FUNCTION public.audit_visitor_change() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.visitors;
BEGIN
  r := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  IF TG_OP = 'UPDATE' AND NEW.anonymized_at IS NOT NULL AND OLD.anonymized_at IS NULL THEN RETURN NEW; END IF;  -- já auditado
  PERFORM public.write_audit((SELECT church_id FROM public.groups WHERE id = r.group_id), r.group_id, lower(TG_OP), 'visitor', r.id, '{}');
  RETURN r;
END $$;
CREATE TRIGGER trg_visitors_audit AFTER INSERT OR DELETE ON public.visitors FOR EACH ROW EXECUTE FUNCTION public.audit_visitor_change();

-- ============ armazenamento privado da galeria ============
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('media', 'media', false, 10485760, ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760, allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp'];

-- caminho: <group_id>/<arquivo>  (cast só após validar o formato do uuid)
CREATE OR REPLACE FUNCTION public.media_path_group(_name TEXT) RETURNS UUID LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN (storage.foldername(_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND array_length(storage.foldername(_name), 1) = 1
         THEN ((storage.foldername(_name))[1])::uuid END $$;
GRANT EXECUTE ON FUNCTION public.media_path_group(TEXT) TO authenticated;

CREATE POLICY media_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'media' AND public.media_path_group(name) IS NOT NULL AND public.is_group_member(public.media_path_group(name)));
CREATE POLICY media_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media' AND public.media_path_group(name) IS NOT NULL AND public.group_editor(public.media_path_group(name)));
CREATE POLICY media_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'media' AND public.media_path_group(name) IS NOT NULL AND public.group_editor(public.media_path_group(name)))
  WITH CHECK (bucket_id = 'media' AND public.media_path_group(name) IS NOT NULL AND public.group_editor(public.media_path_group(name)));
CREATE POLICY media_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'media' AND public.media_path_group(name) IS NOT NULL AND public.group_editor(public.media_path_group(name)));
