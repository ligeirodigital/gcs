-- GC Digital — Etapa 5: histórico auditável do acompanhamento.
-- Mudanças de situação e de responsável são registradas pelo servidor (não pelo navegador),
-- sem copiar dados pessoais. A equipe só cria contatos, notas e resultados.

ALTER TABLE public.visitor_interactions DROP CONSTRAINT visitor_interactions_kind_check;
ALTER TABLE public.visitor_interactions ADD CONSTRAINT visitor_interactions_kind_check
  CHECK (kind IN ('contact_attempt','note','result','status_change'));

DROP POLICY visitor_interactions_insert ON public.visitor_interactions;
CREATE POLICY visitor_interactions_insert ON public.visitor_interactions FOR INSERT TO authenticated
  WITH CHECK (public.group_welcome(group_id) AND kind IN ('contact_attempt','note','result'));

CREATE OR REPLACE FUNCTION public.visitors_history() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.anonymized_at IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.visitor_interactions (group_id, visitor_id, kind, content, created_by)
    VALUES (NEW.group_id, NEW.id, 'status_change', 'status:' || OLD.status || '>' || NEW.status, auth.uid());
  END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    INSERT INTO public.visitor_interactions (group_id, visitor_id, kind, content, created_by)
    VALUES (NEW.group_id, NEW.id, 'status_change', CASE WHEN NEW.owner_id IS NULL THEN 'owner:removed' ELSE 'owner:changed' END, auth.uid());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_visitors_history AFTER UPDATE ON public.visitors FOR EACH ROW EXECUTE FUNCTION public.visitors_history();
