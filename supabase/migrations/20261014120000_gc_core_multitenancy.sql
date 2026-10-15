-- GC Digital — Etapa 1: núcleo multi-GC (igrejas, GCs, perfis, vínculos, convites, auditoria)
-- Todas as escritas sensíveis (papéis, convites, criação de igreja) passam por funções
-- SECURITY DEFINER que validam a autorização no banco. O navegador nunca é prova de permissão.

-- ============ tipos ============
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('church_admin','gc_leader','communicator','welcome_team','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.invitation_status AS ENUM ('pending','accepted','declined','revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ administradores globais ============
-- Sem políticas e sem GRANT: só é alterada por processo administrativo confiável
-- (SQL editor / service role). Nenhum cliente consegue ler ou escrever.
CREATE TABLE public.platform_admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admins FROM anon, authenticated;
GRANT ALL ON public.platform_admins TO service_role;

-- ============ perfis ============
CREATE TABLE public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '' CHECK (char_length(display_name) <= 120),
  phone        TEXT CHECK (phone IS NULL OR char_length(phone) <= 30),
  avatar_path  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name',''), split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ igrejas ============
CREATE TABLE public.churches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  slug          TEXT NOT NULL UNIQUE
                CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 50),
  logo_path     TEXT,
  primary_color TEXT CHECK (primary_color IS NULL OR primary_color ~ '^#[0-9a-fA-F]{6}$'),
  website_url   TEXT CHECK (website_url IS NULL OR website_url ~* '^https?://'),
  timezone      TEXT NOT NULL DEFAULT 'America/Fortaleza',
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.churches ENABLE ROW LEVEL SECURITY;

-- ============ GCs ============
CREATE TABLE public.groups (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id               UUID NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  slug                    TEXT NOT NULL UNIQUE
                          CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 50
                                 AND slug NOT IN ('admin','api','app','login','convite','gc','www','static','assets')),
  description             TEXT CHECK (description IS NULL OR char_length(description) <= 1000),
  logo_path               TEXT,
  cover_path              TEXT,
  primary_color           TEXT NOT NULL DEFAULT '#D4A017' CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  secondary_color         TEXT NOT NULL DEFAULT '#2B2B2B' CHECK (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  address                 TEXT CHECK (address IS NULL OR char_length(address) <= 300),
  meeting_weekday         SMALLINT CHECK (meeting_weekday BETWEEN 0 AND 6), -- 0 = domingo
  meeting_time            TIME,
  timezone                TEXT NOT NULL DEFAULT 'America/Fortaleza',
  onboarding_completed_at TIMESTAMPTZ,
  created_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, church_id)
);
CREATE INDEX groups_church_idx ON public.groups (church_id);
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- ============ vínculos ============
-- church_admin: group_id NULL (vale para todos os GCs da igreja). Demais papéis: group_id obrigatório.
CREATE TABLE public.memberships (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  church_id  UUID NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  group_id   UUID,
  role       public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (group_id, church_id) REFERENCES public.groups (id, church_id) ON DELETE CASCADE,
  CHECK ((role = 'church_admin') = (group_id IS NULL))
);
CREATE UNIQUE INDEX memberships_user_group_uq ON public.memberships (user_id, group_id) WHERE group_id IS NOT NULL;
CREATE UNIQUE INDEX memberships_user_church_admin_uq ON public.memberships (user_id, church_id) WHERE group_id IS NULL;
CREATE INDEX memberships_group_idx ON public.memberships (group_id);
CREATE INDEX memberships_church_idx ON public.memberships (church_id);
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

-- ============ convites ============
CREATE TABLE public.invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   UUID NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  group_id    UUID,
  email       TEXT NOT NULL CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role        public.app_role NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,            -- apenas o hash SHA-256 é armazenado
  status      public.invitation_status NOT NULL DEFAULT 'pending',
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
  responded_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (group_id, church_id) REFERENCES public.groups (id, church_id) ON DELETE CASCADE,
  CHECK ((role = 'church_admin') = (group_id IS NULL))
);
CREATE UNIQUE INDEX invitations_pending_uq
  ON public.invitations (church_id, COALESCE(group_id, '00000000-0000-0000-0000-000000000000'::uuid), email)
  WHERE status = 'pending';
CREATE INDEX invitations_group_idx ON public.invitations (group_id);
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- ============ auditoria ============
CREATE TABLE public.audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id  UUID REFERENCES public.churches(id) ON DELETE SET NULL,
  group_id   UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  actor_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  UUID,
  metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,   -- nunca gravar dados pessoais sensíveis
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_group_idx ON public.audit_logs (group_id, created_at DESC);
CREATE INDEX audit_logs_church_idx ON public.audit_logs (church_id, created_at DESC);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============ updated_at ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_profiles_updated    BEFORE UPDATE ON public.profiles    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_churches_updated    BEFORE UPDATE ON public.churches    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_groups_updated      BEFORE UPDATE ON public.groups      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_memberships_updated BEFORE UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_invitations_updated BEFORE UPDATE ON public.invitations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_audit_logs_updated  BEFORE UPDATE ON public.audit_logs  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ funções de autorização (usadas pelas políticas RLS) ============
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.has_church_admin(_church UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid() AND m.church_id = _church AND m.group_id IS NULL AND m.role = 'church_admin')
$$;

CREATE OR REPLACE FUNCTION public.is_church_member(_church UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.memberships m WHERE m.user_id = auth.uid() AND m.church_id = _church)
$$;

-- Verdadeiro se o usuário é admin global, church_admin da igreja do GC, ou tem um dos papéis no GC.
CREATE OR REPLACE FUNCTION public.has_group_role(_group UUID, _roles public.app_role[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_platform_admin() OR EXISTS (
    SELECT 1
    FROM public.groups g
    JOIN public.memberships m ON m.user_id = auth.uid()
     AND ((m.group_id = g.id AND m.role = ANY (_roles))
          OR (m.group_id IS NULL AND m.church_id = g.church_id AND m.role = 'church_admin'))
    WHERE g.id = _group)
$$;

CREATE OR REPLACE FUNCTION public.is_group_member(_group UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.has_group_role(_group, ARRAY['gc_leader','communicator','welcome_team','viewer']::public.app_role[])
$$;

CREATE OR REPLACE FUNCTION public.is_group_leader(_group UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.has_group_role(_group, ARRAY['gc_leader']::public.app_role[])
$$;

-- ============ auditoria interna ============
CREATE OR REPLACE FUNCTION public.write_audit(_church UUID, _group UUID, _action TEXT, _entity TEXT, _entity_id UUID, _meta JSONB DEFAULT '{}')
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.audit_logs (church_id, group_id, actor_id, action, entity, entity_id, metadata)
  VALUES (_church, _group, auth.uid(), _action, _entity, _entity_id, COALESCE(_meta, '{}'::jsonb))
$$;
REVOKE ALL ON FUNCTION public.write_audit FROM PUBLIC, anon, authenticated;

-- Trigger: auditoria de alterações em igrejas/GCs (somente ids e tipo de operação)
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r RECORD;
BEGIN
  r := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  IF TG_TABLE_NAME = 'groups' THEN
    PERFORM public.write_audit(r.church_id, CASE WHEN TG_OP='DELETE' THEN NULL ELSE r.id END, lower(TG_OP), 'group', r.id, '{}');
  ELSE
    PERFORM public.write_audit(CASE WHEN TG_OP='DELETE' THEN NULL ELSE r.id END, NULL, lower(TG_OP), 'church', r.id, '{}');
  END IF;
  RETURN r;
END $$;
CREATE TRIGGER trg_groups_audit   AFTER INSERT OR UPDATE OR DELETE ON public.groups   FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER trg_churches_audit AFTER UPDATE OR DELETE          ON public.churches FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- Impede mover um GC para outra igreja.
CREATE OR REPLACE FUNCTION public.groups_immutable_church()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.church_id <> OLD.church_id THEN RAISE EXCEPTION 'church_id é imutável'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_groups_immutable BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.groups_immutable_church();

-- created_by sempre vem do servidor.
CREATE OR REPLACE FUNCTION public.set_created_by()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN NEW.created_by := auth.uid(); RETURN NEW; END $$;
CREATE TRIGGER trg_groups_created_by BEFORE INSERT ON public.groups FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

-- ============ políticas RLS ============
-- profiles
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (
  id = auth.uid() OR public.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = profiles.id
      AND ((m.group_id IS NOT NULL AND public.is_group_leader(m.group_id))
           OR (m.group_id IS NULL AND public.has_church_admin(m.church_id)))));
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- churches (criação somente via create_church)
CREATE POLICY churches_select ON public.churches FOR SELECT TO authenticated USING (public.is_church_member(id));
CREATE POLICY churches_update ON public.churches FOR UPDATE TO authenticated
  USING (public.has_church_admin(id)) WITH CHECK (public.has_church_admin(id));
CREATE POLICY churches_delete ON public.churches FOR DELETE TO authenticated USING (public.is_platform_admin());

-- groups
CREATE POLICY groups_select ON public.groups FOR SELECT TO authenticated
  USING (public.is_group_member(id) OR public.has_church_admin(church_id));
CREATE POLICY groups_insert ON public.groups FOR INSERT TO authenticated WITH CHECK (public.has_church_admin(church_id));
CREATE POLICY groups_update ON public.groups FOR UPDATE TO authenticated
  USING (public.is_group_leader(id)) WITH CHECK (public.is_group_leader(id));
CREATE POLICY groups_delete ON public.groups FOR DELETE TO authenticated USING (public.has_church_admin(church_id));

-- memberships: leitura apenas; escrita somente por funções administrativas
CREATE POLICY memberships_select ON public.memberships FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR public.has_church_admin(church_id)
  OR (group_id IS NOT NULL AND public.is_group_leader(group_id)));

-- invitations: leitura por quem administra; escrita somente por funções
CREATE POLICY invitations_select ON public.invitations FOR SELECT TO authenticated USING (
  public.has_church_admin(church_id) OR (group_id IS NOT NULL AND public.is_group_leader(group_id)));

-- audit_logs: leitura por administração; nunca escrita direta
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated USING (
  (group_id IS NOT NULL AND public.is_group_leader(group_id))
  OR (church_id IS NOT NULL AND public.has_church_admin(church_id))
  OR public.is_platform_admin());

-- ============ privilégios (defesa em profundidade além da RLS) ============
REVOKE ALL ON public.profiles, public.churches, public.groups, public.memberships, public.invitations, public.audit_logs FROM anon, authenticated;
GRANT SELECT ON public.profiles, public.churches, public.groups, public.memberships, public.invitations, public.audit_logs TO authenticated;
GRANT UPDATE (display_name, phone, avatar_path) ON public.profiles TO authenticated;
GRANT UPDATE (name, logo_path, primary_color, website_url, timezone) ON public.churches TO authenticated;
GRANT DELETE ON public.churches TO authenticated;
GRANT INSERT (church_id, name, slug, description, logo_path, cover_path, primary_color, secondary_color,
              address, meeting_weekday, meeting_time, timezone) ON public.groups TO authenticated;
GRANT UPDATE (name, slug, description, logo_path, cover_path, primary_color, secondary_color,
              address, meeting_weekday, meeting_time, timezone, onboarding_completed_at) ON public.groups TO authenticated;
GRANT DELETE ON public.groups TO authenticated;
GRANT ALL ON public.profiles, public.churches, public.groups, public.memberships, public.invitations, public.audit_logs TO service_role;

-- ============ funções administrativas (RPC) ============
CREATE OR REPLACE FUNCTION public.slug_available(p_slug TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.groups WHERE slug = lower(p_slug))
$$;

CREATE OR REPLACE FUNCTION public.create_church(p_name TEXT, p_slug TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Somente administradores da plataforma podem criar igrejas' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.churches (name, slug, created_by) VALUES (trim(p_name), lower(trim(p_slug)), auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.memberships (user_id, church_id, group_id, role) VALUES (auth.uid(), v_id, NULL, 'church_admin');
  PERFORM public.write_audit(v_id, NULL, 'create', 'church', v_id, '{}');
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.create_invitation(p_email TEXT, p_role public.app_role, p_church UUID, p_group UUID)
RETURNS TABLE (id UUID, token TEXT) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_church UUID; v_token TEXT; v_id UUID; v_email TEXT := lower(trim(p_email));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501'; END IF;
  IF p_role = 'church_admin' THEN
    IF NOT public.has_church_admin(p_church) THEN
      RAISE EXCEPTION 'Sem permissão para convidar administradores da igreja' USING ERRCODE = '42501';
    END IF;
    v_church := p_church; p_group := NULL;
  ELSE
    SELECT g.church_id INTO v_church FROM public.groups g WHERE g.id = p_group;
    IF v_church IS NULL OR NOT public.is_group_leader(p_group) THEN
      RAISE EXCEPTION 'Sem permissão para convidar para este GC' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.invitations i SET status = 'revoked', responded_at = now()
   WHERE i.status = 'pending' AND i.church_id = v_church AND i.email = v_email
     AND i.group_id IS NOT DISTINCT FROM p_group;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.invitations (church_id, group_id, email, role, token_hash, invited_by)
  VALUES (v_church, p_group, v_email, p_role, encode(sha256(convert_to(v_token,'utf8')),'hex'), auth.uid())
  RETURNING invitations.id INTO v_id;

  PERFORM public.write_audit(v_church, p_group, 'invite', 'invitation', v_id, jsonb_build_object('role', p_role));
  RETURN QUERY SELECT v_id, v_token;
END $$;

CREATE OR REPLACE FUNCTION public.preview_invitation(p_token TEXT)
RETURNS TABLE (church_name TEXT, group_name TEXT, role public.app_role, email_hint TEXT, status public.invitation_status, expired BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.name, g.name, i.role,
         left(split_part(i.email,'@',1),1) || '***@' || split_part(i.email,'@',2),
         i.status, i.expires_at < now()
  FROM public.invitations i
  JOIN public.churches c ON c.id = i.church_id
  LEFT JOIN public.groups g ON g.id = i.group_id
  WHERE auth.uid() IS NOT NULL AND i.token_hash = encode(sha256(convert_to(p_token,'utf8')),'hex')
$$;

-- Resolve o convite exigindo e-mail verificado idêntico ao convidado (impede reutilização por terceiros).
CREATE OR REPLACE FUNCTION public._claim_invitation(p_token TEXT, p_new_status public.invitation_status)
RETURNS public.invitations LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_inv public.invitations; v_email TEXT; v_confirmed TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501'; END IF;
  SELECT lower(u.email), u.email_confirmed_at INTO v_email, v_confirmed FROM auth.users u WHERE u.id = auth.uid();
  SELECT * INTO v_inv FROM public.invitations
   WHERE token_hash = encode(sha256(convert_to(p_token,'utf8')),'hex') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convite inválido' USING ERRCODE = 'P0002'; END IF;
  IF v_inv.status <> 'pending' THEN RAISE EXCEPTION 'Este convite já foi utilizado ou cancelado' USING ERRCODE = 'P0001'; END IF;
  IF v_inv.expires_at < now() THEN RAISE EXCEPTION 'Este convite expirou' USING ERRCODE = 'P0001'; END IF;
  IF v_confirmed IS NULL OR v_email IS DISTINCT FROM v_inv.email THEN
    RAISE EXCEPTION 'Este convite foi enviado para outro e-mail' USING ERRCODE = '42501';
  END IF;
  UPDATE public.invitations SET status = p_new_status, responded_at = now(),
         accepted_by = CASE WHEN p_new_status = 'accepted' THEN auth.uid() END
   WHERE id = v_inv.id;
  RETURN v_inv;
END $$;
REVOKE ALL ON FUNCTION public._claim_invitation FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_inv public.invitations;
BEGIN
  v_inv := public._claim_invitation(p_token, 'accepted');
  INSERT INTO public.memberships (user_id, church_id, group_id, role)
  VALUES (auth.uid(), v_inv.church_id, v_inv.group_id, v_inv.role)
  ON CONFLICT DO NOTHING;
  PERFORM public.write_audit(v_inv.church_id, v_inv.group_id, 'accept_invite', 'invitation', v_inv.id, jsonb_build_object('role', v_inv.role));
  RETURN COALESCE(v_inv.group_id, v_inv.church_id);
END $$;

CREATE OR REPLACE FUNCTION public.decline_invitation(p_token TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_inv public.invitations;
BEGIN
  v_inv := public._claim_invitation(p_token, 'declined');
  PERFORM public.write_audit(v_inv.church_id, v_inv.group_id, 'decline_invite', 'invitation', v_inv.id, '{}');
END $$;

CREATE OR REPLACE FUNCTION public.revoke_invitation(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_inv public.invitations;
BEGIN
  SELECT * INTO v_inv FROM public.invitations WHERE id = p_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND OR NOT (public.has_church_admin(v_inv.church_id)
        OR (v_inv.group_id IS NOT NULL AND public.is_group_leader(v_inv.group_id))) THEN
    RAISE EXCEPTION 'Convite não encontrado' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.invitations SET status = 'revoked', responded_at = now() WHERE id = p_id;
  PERFORM public.write_audit(v_inv.church_id, v_inv.group_id, 'revoke_invite', 'invitation', p_id, '{}');
END $$;

CREATE OR REPLACE FUNCTION public.set_member_role(p_membership UUID, p_role public.app_role)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_m public.memberships;
BEGIN
  SELECT * INTO v_m FROM public.memberships WHERE id = p_membership FOR UPDATE;
  IF NOT FOUND OR v_m.group_id IS NULL OR p_role = 'church_admin' THEN
    RAISE EXCEPTION 'Operação inválida' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_group_leader(v_m.group_id) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;
  IF v_m.user_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode alterar o seu próprio papel' USING ERRCODE = '42501';
  END IF;
  UPDATE public.memberships SET role = p_role WHERE id = p_membership;
  PERFORM public.write_audit(v_m.church_id, v_m.group_id, 'change_role', 'membership', p_membership,
                             jsonb_build_object('from', v_m.role, 'to', p_role));
END $$;

CREATE OR REPLACE FUNCTION public.remove_member(p_membership UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_m public.memberships;
BEGIN
  SELECT * INTO v_m FROM public.memberships WHERE id = p_membership FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo não encontrado' USING ERRCODE = 'P0002'; END IF;
  IF v_m.group_id IS NULL THEN
    IF NOT public.has_church_admin(v_m.church_id) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
  ELSIF NOT (public.is_group_leader(v_m.group_id) OR v_m.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.memberships WHERE id = p_membership;
  PERFORM public.write_audit(v_m.church_id, v_m.group_id, 'remove_member', 'membership', p_membership,
                             jsonb_build_object('role', v_m.role));
END $$;

REVOKE ALL ON FUNCTION public.create_church, public.create_invitation, public.preview_invitation,
  public.accept_invitation, public.decline_invitation, public.revoke_invitation,
  public.set_member_role, public.remove_member, public.slug_available FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_church(TEXT, TEXT), public.create_invitation(TEXT, public.app_role, UUID, UUID),
  public.preview_invitation(TEXT), public.accept_invitation(TEXT), public.decline_invitation(TEXT),
  public.revoke_invitation(UUID), public.set_member_role(UUID, public.app_role),
  public.remove_member(UUID), public.slug_available(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.is_platform_admin, public.has_church_admin, public.is_church_member,
  public.has_group_role, public.is_group_member, public.is_group_leader FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(), public.has_church_admin(UUID), public.is_church_member(UUID),
  public.has_group_role(UUID, public.app_role[]), public.is_group_member(UUID), public.is_group_leader(UUID) TO authenticated;

-- ============ armazenamento de identidade visual (logo/capa) ============
-- Bucket público porque logos e capas aparecem na página pública do GC. Fotos de encontros
-- (Etapa 2/3) usarão um bucket PRIVADO separado.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('branding', 'branding', true, 2097152, ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp'];

-- Caminhos permitidos: group/<uuid>/arquivo  (líder do GC)  e  church/<uuid>/arquivo  (admin da igreja)
CREATE OR REPLACE FUNCTION public.branding_path_allowed(_name TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE p TEXT[] := storage.foldername(_name);
BEGIN
  IF array_length(p,1) <> 2 OR p[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN FALSE;
  END IF;
  IF p[1] = 'group'  THEN RETURN public.is_group_leader(p[2]::uuid); END IF;
  IF p[1] = 'church' THEN RETURN public.has_church_admin(p[2]::uuid); END IF;
  RETURN FALSE;
END $$;
GRANT EXECUTE ON FUNCTION public.branding_path_allowed(TEXT) TO authenticated;

CREATE POLICY branding_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND public.branding_path_allowed(name));
CREATE POLICY branding_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'branding' AND public.branding_path_allowed(name))
  WITH CHECK (bucket_id = 'branding' AND public.branding_path_allowed(name));
CREATE POLICY branding_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'branding' AND public.branding_path_allowed(name));
