-- GC Digital — Etapa 4: página pública (link na bio), formulários públicos e métricas medidas pela plataforma.
-- O público NUNCA lê tabelas: só a função get_public_page (campos explicitamente liberados).
-- Escritas públicas (formulários, métricas) são feitas somente por Edge Functions com service role,
-- que validam, limitam requisições e filtram spam antes de chamar as funções abaixo.

ALTER TABLE public.bio_pages ADD COLUMN show_meeting BOOLEAN NOT NULL DEFAULT true;   -- dia/horário do encontro

CREATE TYPE public.submission_kind AS ENUM ('join_gc','know_church','prayer_request','contact_leadership');

CREATE TABLE public.form_submissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  kind         public.submission_kind NOT NULL,
  name         TEXT CHECK (name IS NULL OR char_length(name) <= 120),
  phone        TEXT CHECK (phone IS NULL OR char_length(phone) <= 30),
  email        TEXT CHECK (email IS NULL OR (char_length(email) <= 160 AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  message      TEXT CHECK (message IS NULL OR char_length(message) <= 500),
  consent_given BOOLEAN NOT NULL DEFAULT false,
  consent_at   TIMESTAMPTZ,
  consent_text_version TEXT,
  source       TEXT CHECK (source IS NULL OR char_length(source) <= 40),
  status       TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','handled')),
  handled_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_at   TIMESTAMPTZ,
  visitor_id   UUID,
  retention_until DATE NOT NULL DEFAULT (current_date + 180),
  anonymized_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, group_id),
  CHECK (anonymized_at IS NOT NULL OR (consent_given AND consent_at IS NOT NULL)),
  FOREIGN KEY (visitor_id, group_id) REFERENCES public.visitors (id, group_id) ON DELETE SET NULL (visitor_id)
);
CREATE INDEX form_submissions_group_idx ON public.form_submissions (group_id, status, created_at DESC);
CREATE INDEX form_submissions_retention_idx ON public.form_submissions (retention_until) WHERE anonymized_at IS NULL;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_form_submissions_updated BEFORE UPDATE ON public.form_submissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_form_submissions_group_immutable BEFORE UPDATE ON public.form_submissions FOR EACH ROW EXECUTE FUNCTION public.immutable_group_id();

-- Equipe de acolhimento/líder: lê e marca como atendido. Inserção só pelo servidor.
CREATE POLICY form_submissions_select ON public.form_submissions FOR SELECT TO authenticated USING (public.group_welcome(group_id));
CREATE POLICY form_submissions_update ON public.form_submissions FOR UPDATE TO authenticated
  USING (public.group_welcome(group_id)) WITH CHECK (public.group_welcome(group_id));
CREATE POLICY form_submissions_delete ON public.form_submissions FOR DELETE TO authenticated USING (public.is_group_leader(group_id));
REVOKE ALL ON public.form_submissions FROM anon, authenticated;
GRANT SELECT, DELETE ON public.form_submissions TO authenticated;
GRANT UPDATE (status) ON public.form_submissions TO authenticated;
GRANT ALL ON public.form_submissions TO service_role;

CREATE OR REPLACE FUNCTION public.submissions_handled() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'handled' AND OLD.status <> 'handled' THEN NEW.handled_by := auth.uid(); NEW.handled_at := now();
  ELSIF NEW.status = 'new' THEN NEW.handled_by := NULL; NEW.handled_at := NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_submissions_handled BEFORE UPDATE ON public.form_submissions FOR EACH ROW EXECUTE FUNCTION public.submissions_handled();

-- ============ leitura pública controlada ============
CREATE OR REPLACE FUNCTION public.get_public_page(p_slug TEXT) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE g public.groups; bp public.bio_pages; res JSONB;
BEGIN
  SELECT * INTO g FROM public.groups WHERE slug = lower(p_slug);
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO bp FROM public.bio_pages WHERE group_id = g.id AND is_published;
  IF NOT FOUND THEN RETURN NULL; END IF;
  res := jsonb_build_object(
    'group', jsonb_build_object('name', g.name, 'slug', g.slug, 'description', g.description, 'logo_path', g.logo_path,
              'cover_path', g.cover_path, 'primary_color', g.primary_color, 'secondary_color', g.secondary_color, 'timezone', g.timezone),
    'page', jsonb_build_object('headline', bp.headline, 'bio', bp.bio, 'socials', bp.socials, 'contact', bp.contact),
    'meeting', CASE WHEN bp.show_meeting OR bp.show_address THEN jsonb_build_object(
                 'weekday', CASE WHEN bp.show_meeting THEN g.meeting_weekday END,
                 'time', CASE WHEN bp.show_meeting THEN g.meeting_time END,
                 'address', CASE WHEN bp.show_address THEN g.address END) END,
    'links', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'type', l.type, 'label', l.label,
                 'url', CASE WHEN l.type IN ('instagram','whatsapp','youtube','custom') THEN l.url END) ORDER BY l.position, l.created_at)
               FROM public.bio_links l WHERE l.bio_page_id = bp.id AND l.is_active), '[]'::jsonb),
    'events', CASE WHEN bp.show_events THEN COALESCE((SELECT jsonb_agg(x ORDER BY x->>'starts_at') FROM (
                 SELECT jsonb_build_object('id', e.id, 'name', e.name, 'description', e.description, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
                        'address', CASE WHEN e.show_address_publicly THEN e.address END, 'registration_url', e.registration_url) AS x
                 FROM public.events e WHERE e.group_id = g.id AND e.status = 'published' AND COALESCE(e.ends_at, e.starts_at + interval '3 hours') >= now()
                 ORDER BY e.starts_at LIMIT 6) s), '[]'::jsonb) ELSE '[]'::jsonb END);
  RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.get_public_page(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_page(TEXT) TO anon, authenticated;

-- ============ escrita pública (somente service role, via Edge Functions) ============
CREATE OR REPLACE FUNCTION public.record_analytics(p_slug TEXT, p_type TEXT, p_link UUID, p_source TEXT, p_dedupe TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE g UUID; ok BOOLEAN; n INTEGER;
BEGIN
  IF p_type NOT IN ('page_view','link_click') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
  SELECT bp.group_id INTO g FROM public.groups gr JOIN public.bio_pages bp ON bp.group_id = gr.id AND bp.is_published WHERE gr.slug = lower(p_slug);
  IF g IS NULL THEN RETURN false; END IF;
  IF p_type = 'link_click' THEN
    SELECT EXISTS (SELECT 1 FROM public.bio_links l JOIN public.bio_pages bp ON bp.id = l.bio_page_id
                    WHERE l.id = p_link AND l.group_id = g AND l.is_active) INTO ok;
    IF NOT ok THEN RETURN false; END IF;
  ELSE p_link := NULL; END IF;
  INSERT INTO public.analytics_events (group_id, event_type, link_id, source, dedupe_key)
  VALUES (g, p_type, p_link, left(lower(NULLIF(p_source,'')), 40), p_dedupe) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;

CREATE OR REPLACE FUNCTION public.submit_public_form(p_slug TEXT, p_kind public.submission_kind, p_name TEXT, p_phone TEXT, p_email TEXT,
  p_message TEXT, p_consent BOOLEAN, p_consent_version TEXT, p_source TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE g UUID; v UUID; sid UUID; nm TEXT := NULLIF(trim(p_name),''); ph TEXT := NULLIF(trim(p_phone),''); em TEXT := NULLIF(lower(trim(p_email)),'');
BEGIN
  SELECT bp.group_id INTO g FROM public.groups gr JOIN public.bio_pages bp ON bp.group_id = gr.id AND bp.is_published WHERE gr.slug = lower(p_slug);
  IF g IS NULL THEN RAISE EXCEPTION 'Página não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF p_consent IS NOT TRUE THEN RAISE EXCEPTION 'O consentimento é obrigatório' USING ERRCODE = '23514'; END IF;
  IF p_kind IN ('join_gc','know_church') AND (nm IS NULL OR (ph IS NULL AND em IS NULL)) THEN
    RAISE EXCEPTION 'Informe nome e telefone ou e-mail' USING ERRCODE = '23514'; END IF;
  IF p_kind = 'contact_leadership' AND (ph IS NULL AND em IS NULL OR NULLIF(trim(p_message),'') IS NULL) THEN
    RAISE EXCEPTION 'Informe uma forma de contato e a mensagem' USING ERRCODE = '23514'; END IF;
  IF p_kind = 'prayer_request' AND NULLIF(trim(p_message),'') IS NULL THEN RAISE EXCEPTION 'Escreva o pedido de oração' USING ERRCODE = '23514'; END IF;

  -- duplicata evidente (mesmo contato e tipo nas últimas 24 h): confirma sem gravar de novo
  IF (ph IS NOT NULL OR em IS NOT NULL) AND EXISTS (
       SELECT 1 FROM public.form_submissions s WHERE s.group_id = g AND s.kind = p_kind AND s.created_at > now() - interval '24 hours'
          AND ((ph IS NOT NULL AND s.phone = ph) OR (em IS NOT NULL AND s.email = em))) THEN
    RETURN jsonb_build_object('ok', true, 'deduped', true);
  END IF;

  IF p_kind IN ('join_gc','know_church') THEN
    INSERT INTO public.visitors (group_id, name, phone, email, source, consent_given, consent_at, consent_text_version)
    VALUES (g, nm, ph, em, 'bio_link', true, now(), p_consent_version) RETURNING id INTO v;
  END IF;
  INSERT INTO public.form_submissions (group_id, kind, name, phone, email, message, consent_given, consent_at, consent_text_version, source, visitor_id)
  VALUES (g, p_kind, nm, ph, em, NULLIF(trim(p_message),''), true, now(), p_consent_version, left(lower(NULLIF(p_source,'')), 40), v) RETURNING id INTO sid;
  INSERT INTO public.analytics_events (group_id, event_type, source) VALUES (g, 'form_submit', left(lower(NULLIF(p_source,'')), 40));
  RETURN jsonb_build_object('ok', true, 'deduped', false);
END $$;

REVOKE ALL ON FUNCTION public.record_analytics, public.submit_public_form FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_analytics(TEXT, TEXT, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_public_form(TEXT, public.submission_kind, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO service_role;

-- Retenção: agora também anonimiza formulários vencidos (pedidos de oração, contatos).
CREATE OR REPLACE FUNCTION public.purge_expired_visitors() RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r RECORD; n INTEGER := 0; m INTEGER;
BEGIN
  FOR r IN SELECT id FROM public.visitors WHERE anonymized_at IS NULL AND retention_until < current_date LOOP
    PERFORM public._anonymize_visitor_row(r.id); n := n + 1;
  END LOOP;
  UPDATE public.form_submissions SET name = NULL, phone = NULL, email = NULL, message = NULL, anonymized_at = now()
   WHERE anonymized_at IS NULL AND retention_until < current_date;
  GET DIAGNOSTICS m = ROW_COUNT;
  RETURN n + m;
END $$;
