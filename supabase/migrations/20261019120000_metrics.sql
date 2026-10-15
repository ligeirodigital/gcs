-- GC Digital — Etapa 7: métricas calculadas no servidor e dados manuais identificáveis.

-- Dados do Instagram digitados pela equipe. Sempre exibidos como "registro manual".
-- Só existirão valores reais quando importados por uma integração oficial (não implementada).
CREATE TABLE public.manual_metrics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  source       TEXT NOT NULL DEFAULT 'instagram' CHECK (source IN ('instagram')),
  metric       TEXT NOT NULL CHECK (metric IN ('followers','reach','impressions','likes','comments','saves')),
  value        INTEGER NOT NULL CHECK (value >= 0),
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL CHECK (period_end >= period_start),
  note         TEXT CHECK (note IS NULL OR char_length(note) <= 200),
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX manual_metrics_group_idx ON public.manual_metrics (group_id, period_end DESC);
ALTER TABLE public.manual_metrics ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_manual_metrics_updated BEFORE UPDATE ON public.manual_metrics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_manual_metrics_group_immutable BEFORE UPDATE ON public.manual_metrics FOR EACH ROW EXECUTE FUNCTION public.immutable_group_id();
CREATE TRIGGER trg_manual_metrics_author BEFORE INSERT ON public.manual_metrics FOR EACH ROW EXECUTE FUNCTION public.set_author();
CREATE POLICY manual_metrics_select ON public.manual_metrics FOR SELECT TO authenticated USING (public.is_group_member(group_id));
CREATE POLICY manual_metrics_insert ON public.manual_metrics FOR INSERT TO authenticated WITH CHECK (public.group_editor(group_id));
CREATE POLICY manual_metrics_update ON public.manual_metrics FOR UPDATE TO authenticated USING (public.group_editor(group_id)) WITH CHECK (public.group_editor(group_id));
CREATE POLICY manual_metrics_delete ON public.manual_metrics FOR DELETE TO authenticated USING (public.group_editor(group_id));
REVOKE ALL ON public.manual_metrics FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_metrics TO authenticated;
GRANT ALL ON public.manual_metrics TO service_role;

-- Agregados do período, no fuso do GC. Contatos de visitantes só para quem tem acesso ao acolhimento
-- (os números são agregados, sem dados pessoais). Faixa máxima: 366 dias.
CREATE OR REPLACE FUNCTION public.metrics_summary(p_group UUID, p_from DATE, p_to DATE) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE tz TEXT; t0 TIMESTAMPTZ; t1 TIMESTAMPTZ; welcome BOOLEAN; res JSONB; vis JSONB := NULL;
BEGIN
  IF NOT public.is_group_member(p_group) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 366 THEN RAISE EXCEPTION 'Período inválido' USING ERRCODE = '22023'; END IF;
  SELECT timezone INTO tz FROM public.groups WHERE id = p_group;
  t0 := p_from::timestamp AT TIME ZONE tz; t1 := (p_to + 1)::timestamp AT TIME ZONE tz;
  welcome := public.group_welcome(p_group);

  IF welcome THEN
    SELECT jsonb_build_object(
      'contacts', count(*),
      'attended', count(*) FILTER (WHERE status IN ('visited','returned','integrated')),
      'returned', count(*) FILTER (WHERE status IN ('returned','integrated')),
      'by_source', COALESCE((SELECT jsonb_object_agg(source, n) FROM (SELECT source, count(*) n FROM public.visitors
                       WHERE group_id = p_group AND first_contact_at >= t0 AND first_contact_at < t1 GROUP BY source) s), '{}'::jsonb))
      INTO vis FROM public.visitors WHERE group_id = p_group AND first_contact_at >= t0 AND first_contact_at < t1;
    vis := vis || jsonb_build_object(
      'tasks_pending', (SELECT count(*) FROM public.follow_up_tasks WHERE group_id = p_group AND completed_at IS NULL),
      'tasks_overdue', (SELECT count(*) FROM public.follow_up_tasks WHERE group_id = p_group AND completed_at IS NULL AND due_at < now()),
      'forms_new', (SELECT count(*) FROM public.form_submissions WHERE group_id = p_group AND status = 'new'));
  END IF;

  res := jsonb_build_object(
    'from', p_from, 'to', p_to,
    'views',  (SELECT count(*) FROM public.analytics_events WHERE group_id = p_group AND event_type = 'page_view'   AND created_at >= t0 AND created_at < t1),
    'clicks', (SELECT count(*) FROM public.analytics_events WHERE group_id = p_group AND event_type = 'link_click'  AND created_at >= t0 AND created_at < t1),
    'forms',  (SELECT count(*) FROM public.analytics_events WHERE group_id = p_group AND event_type = 'form_submit' AND created_at >= t0 AND created_at < t1),
    'clicks_by_link', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'label', l.label, 'type', l.type, 'active', l.is_active, 'clicks', COALESCE(c.n, 0)) ORDER BY COALESCE(c.n, 0) DESC, l.position)
        FROM public.bio_links l LEFT JOIN (SELECT link_id, count(*) n FROM public.analytics_events WHERE group_id = p_group AND event_type = 'link_click' AND created_at >= t0 AND created_at < t1 GROUP BY link_id) c ON c.link_id = l.id
        WHERE l.group_id = p_group AND (l.is_active OR c.n > 0)), '[]'::jsonb),
    'views_by_day', COALESCE((SELECT jsonb_agg(jsonb_build_object('day', d::date, 'views', COALESCE(v.n, 0)) ORDER BY d)
        FROM generate_series(p_from, p_to, interval '1 day') d
        LEFT JOIN (SELECT (created_at AT TIME ZONE tz)::date AS day, count(*) n FROM public.analytics_events
                    WHERE group_id = p_group AND event_type = 'page_view' AND created_at >= t0 AND created_at < t1 GROUP BY 1) v ON v.day = d::date), '[]'::jsonb),
    'views_by_source', COALESCE((SELECT jsonb_agg(jsonb_build_object('source', COALESCE(source, 'direto'), 'views', n) ORDER BY n DESC) FROM (
        SELECT source, count(*) n FROM public.analytics_events WHERE group_id = p_group AND event_type = 'page_view' AND created_at >= t0 AND created_at < t1 GROUP BY source ORDER BY n DESC LIMIT 8) s), '[]'::jsonb),
    'posts_created', (SELECT count(*) FROM public.posts WHERE group_id = p_group AND created_at >= t0 AND created_at < t1),
    'posts_by_format', COALESCE((SELECT jsonb_object_agg(format, n) FROM (SELECT format, count(*) n FROM public.posts WHERE group_id = p_group AND created_at >= t0 AND created_at < t1 GROUP BY format) f), '{}'::jsonb),
    'posts_status_now', COALESCE((SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) n FROM public.posts WHERE group_id = p_group GROUP BY status) s), '{}'::jsonb),
    'published_in_period', (SELECT count(*) FROM public.posts WHERE group_id = p_group AND status = 'published' AND published_at >= t0 AND published_at < t1),
    'visitors', vis);
  RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.metrics_summary(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metrics_summary(UUID, DATE, DATE) TO authenticated;
