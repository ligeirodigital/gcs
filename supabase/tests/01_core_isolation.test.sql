-- Testes de autorização / isolamento entre GCs. Executar com run.sh (falha em qualquer asserção).
\set ON_ERROR_STOP on
CREATE SCHEMA t;
CREATE FUNCTION t.login(u UUID) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
END $$;
CREATE FUNCTION t.anon() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true); SET LOCAL ROLE anon; END $$;
CREATE FUNCTION t.logout() RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN RESET ROLE; END $$;
CREATE FUNCTION t.ok(c BOOLEAN, msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN IF c IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', msg; END IF; RAISE NOTICE 'ok - %', msg; END $$;
-- Executa SQL e exige erro (permissão/RLS/validação)
CREATE FUNCTION t.denied(q TEXT, msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'ok - % (%)', msg, left(SQLERRM, 60); RETURN; END;
  RAISE EXCEPTION 'FALHOU (deveria negar): %', msg;
END $$;
-- Executa DML e exige 0 linhas afetadas (RLS filtra silenciosamente)
CREATE FUNCTION t.zero_rows(q TEXT, msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE n BIGINT;
BEGIN
  BEGIN EXECUTE q; GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'ok - % (negado: %)', msg, left(SQLERRM, 50); RETURN; END;
  IF n <> 0 THEN RAISE EXCEPTION 'FALHOU (% linhas afetadas): %', n, msg; END IF;
  RAISE NOTICE 'ok - %', msg;
END $$;
CREATE FUNCTION t.count(q TEXT) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE n BIGINT; BEGIN EXECUTE 'select count(*) from (' || q || ') s' INTO n; RETURN n; END $$;
GRANT USAGE ON SCHEMA t TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO anon, authenticated, service_role;

-- ===== fixtures (como superusuário) =====
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
 ('00000000-0000-0000-0000-0000000000a1','admin@plat.com', now()),
 ('00000000-0000-0000-0000-0000000000b1','lead.a@x.com', now()),
 ('00000000-0000-0000-0000-0000000000b2','lead.b@x.com', now()),
 ('00000000-0000-0000-0000-0000000000c1','comm.a@x.com', now()),
 ('00000000-0000-0000-0000-0000000000d1','outsider@x.com', now()),
 ('00000000-0000-0000-0000-0000000000e1','novo@x.com', now()),
 ('00000000-0000-0000-0000-0000000000e2','naoverificado@x.com', NULL),
 ('00000000-0000-0000-0000-0000000000f1','churchadmin.1@x.com', now());
INSERT INTO public.platform_admins VALUES ('00000000-0000-0000-0000-0000000000a1');

DO $$
DECLARE
  adm UUID := '00000000-0000-0000-0000-0000000000a1'; la UUID := '00000000-0000-0000-0000-0000000000b1';
  lb UUID := '00000000-0000-0000-0000-0000000000b2'; ca UUID := '00000000-0000-0000-0000-0000000000c1';
  out UUID := '00000000-0000-0000-0000-0000000000d1'; nw UUID := '00000000-0000-0000-0000-0000000000e1';
  unv UUID := '00000000-0000-0000-0000-0000000000e2'; cha UUID := '00000000-0000-0000-0000-0000000000f1';
  c1 UUID; c2 UUID; gA UUID; gB UUID; mem UUID; tok TEXT; inv UUID; n BIGINT;
BEGIN
  RAISE NOTICE '--- criação de igrejas e GCs';
  PERFORM t.login(out);
  PERFORM t.denied($q$select public.create_church('Igreja X','igreja-x')$q$, 'usuário comum não cria igreja');
  PERFORM t.denied($q$insert into public.churches(name,slug) values ('Hack','hack-church')$q$, 'insert direto em churches negado');
  PERFORM t.denied($q$select * from public.platform_admins$q$, 'platform_admins ilegível');
  PERFORM t.denied($q$insert into public.platform_admins values (auth.uid())$q$, 'não vira admin pelo navegador');
  PERFORM t.logout();

  PERFORM t.login(adm);
  c1 := public.create_church('Igreja Um','igreja-um');
  c2 := public.create_church('Igreja Dois','igreja-dois');
  PERFORM t.ok(t.count('select 1 from public.memberships where role=''church_admin''') = 2, 'admin global vira church_admin das igrejas criadas');
  INSERT INTO public.groups (church_id,name,slug) VALUES (c1,'GC A','gc-a') RETURNING id INTO gA;
  INSERT INTO public.groups (church_id,name,slug) VALUES (c2,'GC B','gc-b') RETURNING id INTO gB;
  PERFORM t.denied(format($q$insert into public.groups(church_id,name,slug) values (%L,'Slug ruim','Admin')$q$, c1), 'slug inválido/reservado rejeitado');
  PERFORM t.denied(format($q$insert into public.groups(church_id,name,slug) values (%L,'Dup','gc-a')$q$, c1), 'slug duplicado rejeitado');
  PERFORM t.logout();

  -- vínculos iniciais feitos por processo confiável (superusuário)
  INSERT INTO public.memberships(user_id,church_id,group_id,role) VALUES
    (la,c1,gA,'gc_leader'),(lb,c2,gB,'gc_leader'),(ca,c1,gA,'communicator'),(cha,c1,NULL,'church_admin');
  INSERT INTO public.profiles(id) SELECT id FROM auth.users ON CONFLICT DO NOTHING;

  RAISE NOTICE '--- isolamento: líder do GC A não toca no GC B';
  PERFORM t.login(la);
  PERFORM t.ok(t.count('select 1 from public.groups') = 1, 'líder A enxerga apenas o próprio GC');
  PERFORM t.ok(t.count('select 1 from public.churches') = 1, 'líder A enxerga apenas a própria igreja');
  PERFORM t.zero_rows(format($q$update public.groups set name='pwned' where id=%L$q$, gB), 'líder A não altera GC B');
  PERFORM t.zero_rows(format($q$delete from public.groups where id=%L$q$, gB), 'líder A não exclui GC B');
  PERFORM t.zero_rows(format($q$update public.churches set name='pwned' where id=%L$q$, c2), 'líder A não altera igreja 2');
  PERFORM t.zero_rows(format($q$delete from public.groups where id=%L$q$, gA), 'líder A não exclui o próprio GC (só admin da igreja)');
  PERFORM t.denied(format($q$insert into public.groups(church_id,name,slug) values (%L,'Invasor','invasor')$q$, c2), 'líder A não cria GC na igreja 2');
  PERFORM t.denied(format($q$insert into public.groups(church_id,name,slug) values (%L,'Outro','outro-gc')$q$, c1), 'líder não cria GC (só admin da igreja)');
  PERFORM t.ok(t.count(format('select 1 from public.memberships where group_id=%L', gB)) = 0, 'líder A não lê vínculos do GC B');
  PERFORM t.ok(t.count(format('select 1 from public.memberships where group_id=%L', gA)) = 2, 'líder A lê vínculos do próprio GC');
  PERFORM t.ok(t.count('select 1 from public.profiles') = 2, 'líder A enxerga só perfis do próprio GC');
  PERFORM t.ok(t.count(format('select 1 from public.profiles where id=%L', lb)) = 0, 'líder A não lê perfil do líder B');
  PERFORM t.ok(t.count(format('select 1 from public.audit_logs where group_id=%L', gB)) = 0, 'líder A não lê auditoria do GC B');
  PERFORM t.denied(format($q$update public.groups set church_id=%L where id=%L$q$, c2, gA), 'GC não muda de igreja');
  PERFORM t.denied(format($q$select public.create_invitation('x@x.com','viewer',%L,%L)$q$, c2, gB), 'líder A não convida para GC B');
  PERFORM t.denied(format($q$select public.create_invitation('x@x.com','church_admin',%L,NULL)$q$, c1), 'líder não convida church_admin');
  PERFORM t.denied(format($q$select public.set_member_role(%L,'viewer')$q$, (select id from public.memberships where user_id=lb)), 'líder A não altera papéis do GC B');
  PERFORM t.denied(format($q$select public.set_member_role(%L,'viewer')$q$, (select id from public.memberships where user_id=la)), 'ninguém altera o próprio papel');
  PERFORM t.logout();

  RAISE NOTICE '--- isolamento: B não vê A (simétrico) e usuário sem vínculo';
  PERFORM t.login(lb);
  PERFORM t.ok(t.count(format('select 1 from public.groups where id=%L', gA)) = 0, 'líder B não enxerga GC A');
  PERFORM t.zero_rows(format($q$update public.groups set name='pwned' where id=%L$q$, gA), 'líder B não altera GC A');
  PERFORM t.logout();
  PERFORM t.login(out);
  PERFORM t.ok(t.count('select 1 from public.groups') = 0, 'sem vínculo: nenhum GC');
  PERFORM t.ok(t.count('select 1 from public.memberships') = 0, 'sem vínculo: nenhum vínculo');
  PERFORM t.logout();
  PERFORM t.anon();
  PERFORM t.denied('select * from public.groups', 'anon não lê groups');
  PERFORM t.denied('select * from public.memberships', 'anon não lê memberships');
  PERFORM t.denied('select * from public.invitations', 'anon não lê convites');
  PERFORM t.logout();

  RAISE NOTICE '--- escalada de privilégio pelo navegador';
  PERFORM t.login(ca);
  PERFORM t.denied(format($q$update public.memberships set role='gc_leader' where user_id=%L$q$, ca), 'communicator não se promove');
  PERFORM t.denied(format($q$insert into public.memberships(user_id,church_id,group_id,role) values (%L,%L,%L,'gc_leader')$q$, ca, c1, gB), 'insert direto em memberships negado');
  PERFORM t.denied(format($q$select public.set_member_role(%L,'gc_leader')$q$, (select id from public.memberships where user_id=ca)), 'communicator não usa RPC para se promover');
  PERFORM t.denied($q$update public.profiles set id=gen_random_uuid()$q$, 'perfil não troca id');
  PERFORM t.zero_rows(format($q$update public.profiles set display_name='x' where id=%L$q$, la), 'perfil alheio não é alterado');
  PERFORM t.zero_rows(format($q$update public.groups set name='x' where id=%L$q$, gA), 'communicator não edita GC');
  PERFORM t.ok(t.count('select 1 from public.invitations') = 0, 'communicator não lê convites');
  PERFORM t.denied('insert into public.audit_logs(action,entity) values (''x'',''y'')', 'auditoria não é gravável pelo cliente');
  PERFORM t.logout();

  RAISE NOTICE '--- admin da igreja';
  PERFORM t.login(cha);
  PERFORM t.ok(t.count('select 1 from public.groups') = 1, 'church_admin 1 vê só GCs da igreja 1');
  INSERT INTO public.groups(church_id,name,slug) VALUES (c1,'GC A2','gc-a2');
  PERFORM t.denied(format($q$insert into public.groups(church_id,name,slug) values (%L,'x','gc-x')$q$, c2), 'church_admin não cria GC em outra igreja');
  PERFORM t.zero_rows(format($q$delete from public.groups where id=%L$q$, gB), 'church_admin não exclui GC de outra igreja');
  PERFORM t.logout();

  RAISE NOTICE '--- convites';
  PERFORM t.login(la);
  SELECT i.id, i.token INTO inv, tok FROM public.create_invitation('Novo@X.com','welcome_team',c1,gA) i;
  PERFORM t.ok(t.count('select 1 from public.invitations') = 1, 'líder lê convites do seu GC');
  PERFORM t.ok(t.count('select 1 from public.invitations where token_hash=''' || tok || '''') = 0, 'token em claro não é armazenado');
  PERFORM t.logout();
  PERFORM t.login(out);
  PERFORM t.denied(format($q$select public.accept_invitation(%L)$q$, tok), 'outro e-mail não aceita convite');
  PERFORM t.denied($q$select public.accept_invitation('token-inexistente')$q$, 'token inválido');
  PERFORM t.logout();
  PERFORM t.login(unv);
  PERFORM t.denied(format($q$select public.accept_invitation(%L)$q$, tok), 'e-mail não verificado não aceita');
  PERFORM t.logout();
  PERFORM t.login(nw);
  PERFORM t.ok((select count(*) from public.preview_invitation(tok)) = 1, 'preview do convite funciona com token');
  PERFORM public.accept_invitation(tok);
  PERFORM t.ok(t.count(format('select 1 from public.memberships where user_id=%L and group_id=%L and role=''welcome_team''', nw, gA)) = 1, 'aceite cria vínculo com o papel convidado');
  PERFORM t.denied(format($q$select public.accept_invitation(%L)$q$, tok), 'convite não pode ser reutilizado');
  PERFORM t.logout();
  PERFORM t.login(la);
  SELECT i.id, i.token INTO inv, tok FROM public.create_invitation('naoverificado@x.com','viewer',c1,gA) i;
  PERFORM public.revoke_invitation(inv);
  PERFORM t.logout();
  PERFORM t.login(unv);
  PERFORM t.denied(format($q$select public.accept_invitation(%L)$q$, tok), 'convite revogado não pode ser aceito');
  PERFORM t.logout();

  RAISE NOTICE '--- papéis';
  PERFORM t.login(la);
  SELECT id INTO mem FROM public.memberships WHERE user_id = ca;
  PERFORM public.set_member_role(mem, 'viewer');
  PERFORM t.ok((select role from public.memberships where id=mem) = 'viewer', 'líder altera papel de membro do próprio GC');
  PERFORM t.denied(format($q$select public.set_member_role(%L,'church_admin')$q$, mem), 'não promove a church_admin por RPC');
  PERFORM t.logout();
  PERFORM t.login(lb);
  PERFORM t.denied(format($q$select public.remove_member(%L)$q$, mem), 'líder B não remove membro do GC A');
  PERFORM t.logout();
  PERFORM t.login(adm);
  SELECT count(*) INTO n FROM public.audit_logs;
  PERFORM t.ok(n > 5, 'ações administrativas foram auditadas');
  PERFORM t.logout();

  RAISE NOTICE '--- armazenamento de identidade visual';
  PERFORM t.login(la);
  PERFORM t.ok(public.branding_path_allowed('group/' || gA || '/logo.png'), 'líder A envia logo do seu GC');
  PERFORM t.ok(NOT public.branding_path_allowed('group/' || gB || '/logo.png'), 'líder A não envia arquivos para o GC B');
  PERFORM t.ok(NOT public.branding_path_allowed('group/nao-uuid/logo.png'), 'caminho inválido negado');
  PERFORM t.ok(NOT public.branding_path_allowed('church/' || c1 || '/logo.png'), 'líder não envia logo da igreja');
  PERFORM t.logout();

  RAISE NOTICE '--- site da agência (lockdown)';
  PERFORM t.login(la);
  PERFORM t.denied($q$insert into public.projects(name,slug,category,short_description) values ('x','x','x','x')$q$, 'usuário de GC não escreve em projects');
  PERFORM t.logout();
  PERFORM t.login(adm);
  INSERT INTO public.projects(name,slug,category,short_description,status) VALUES ('draft','draft','c','d','draft');
  PERFORM t.logout();
  PERFORM t.login(la);
  PERFORM t.ok(t.count('select 1 from public.projects') = 0, 'usuário de GC não lê rascunhos da agência');
  PERFORM t.logout();
  PERFORM t.login(adm);
  PERFORM t.ok(t.count('select 1 from public.projects') = 1, 'admin global lê rascunhos');
  PERFORM t.logout();
  RAISE NOTICE 'TODOS OS TESTES PASSARAM';
END $$;
