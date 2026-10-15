-- Etapa 2: isolamento e permissões de conteúdo, galeria, eventos, link na bio, acolhimento (LGPD) e Storage.
-- Depende dos dados criados em 01_core_isolation.test.sql.
\set ON_ERROR_STOP on
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
 ('00000000-0000-0000-0000-0000000000aa','comm2.a@x.com', now()),
 ('00000000-0000-0000-0000-0000000000bb','welcome.b@x.com', now());
INSERT INTO public.profiles(id) SELECT id FROM auth.users ON CONFLICT DO NOTHING;

DO $$
DECLARE
  uid UUID; la UUID; lb UUID; viewer UUID; wa UUID; comm UUID := '00000000-0000-0000-0000-0000000000aa'; wb UUID := '00000000-0000-0000-0000-0000000000bb';
  c1 UUID; c2 UUID; gA UUID; gB UUID; evA UUID; evB UUID; mA UUID; mB UUID; pA UUID; pB UUID; pageA UUID; pageB UUID; linkA UUID;
  vA UUID; vB UUID; n BIGINT; tplA UUID;
BEGIN
  SELECT id INTO la FROM auth.users WHERE email='lead.a@x.com';
  SELECT id INTO lb FROM auth.users WHERE email='lead.b@x.com';
  SELECT id INTO viewer FROM auth.users WHERE email='comm.a@x.com';       -- virou "viewer" no teste 01
  SELECT id INTO wa FROM auth.users WHERE email='novo@x.com';             -- welcome_team do GC A
  SELECT id, church_id INTO gA, c1 FROM public.groups WHERE slug='gc-a';
  SELECT id, church_id INTO gB, c2 FROM public.groups WHERE slug='gc-b';
  INSERT INTO public.memberships(user_id,church_id,group_id,role) VALUES (comm,c1,gA,'communicator'),(wb,c2,gB,'welcome_team');
  PERFORM t.ok((SELECT role FROM public.memberships WHERE user_id=viewer AND group_id=gA)='viewer', 'fixture: viewer no GC A');

  RAISE NOTICE '--- eventos';
  PERFORM t.login(comm);
  INSERT INTO public.events(group_id,name,starts_at) VALUES (gA,'Encontro A', now()+interval '3 days') RETURNING id INTO evA;
  PERFORM t.denied(format($q$insert into public.events(group_id,name,starts_at) values (%L,'Invasão', now())$q$, gB), 'comunicação do A não cria evento no GC B');
  PERFORM t.denied(format($q$insert into public.events(group_id,name,starts_at,responsible_id) values (%L,'x', now(), %L)$q$, gA, lb), 'responsável de outro GC rejeitado');
  PERFORM t.denied(format($q$update public.events set group_id=%L where id=%L$q$, gB, evA), 'evento não muda de GC');
  PERFORM t.logout();
  PERFORM t.login(lb);
  INSERT INTO public.events(group_id,name,starts_at) VALUES (gB,'Encontro B', now()+interval '2 days') RETURNING id INTO evB;
  PERFORM t.ok(t.count('select 1 from public.events') = 1, 'líder B só vê o evento do GC B');
  PERFORM t.zero_rows(format($q$update public.events set name='pwn' where id=%L$q$, evA), 'líder B não altera evento do GC A');
  PERFORM t.zero_rows(format($q$delete from public.events where id=%L$q$, evA), 'líder B não exclui evento do GC A');
  PERFORM t.logout();
  PERFORM t.login(viewer);
  PERFORM t.ok(t.count('select 1 from public.events') = 1, 'consulta lê eventos do GC');
  PERFORM t.denied(format($q$insert into public.events(group_id,name,starts_at) values (%L,'x', now())$q$, gA), 'consulta não cria evento');
  PERFORM t.zero_rows(format($q$update public.events set name='x' where id=%L$q$, evA), 'consulta não altera evento');
  PERFORM t.logout();

  RAISE NOTICE '--- galeria (tabela)';
  PERFORM t.login(comm);
  INSERT INTO public.media_assets(group_id,storage_path,mime_type,size_bytes,event_id,uploaded_by)
    VALUES (gA, gA || '/foto1.jpg','image/jpeg',1000,evA, lb) RETURNING id INTO mA;   -- uploaded_by do cliente é ignorado
  PERFORM t.ok((SELECT uploaded_by FROM public.media_assets WHERE id=mA) = comm, 'uploaded_by definido pelo servidor');
  PERFORM t.denied(format($q$insert into public.media_assets(group_id,storage_path,mime_type,size_bytes) values (%L,%L,'image/png',10)$q$, gA, gB || '/x.png'), 'caminho de outro GC rejeitado');
  PERFORM t.denied(format($q$insert into public.media_assets(group_id,storage_path,mime_type,size_bytes) values (%L,%L,'application/pdf',10)$q$, gA, gA || '/x.pdf'), 'tipo de arquivo inválido rejeitado');
  PERFORM t.denied(format($q$insert into public.media_assets(group_id,storage_path,mime_type,size_bytes) values (%L,%L,'image/png',99999999)$q$, gA, gA || '/g.png'), 'arquivo acima de 10 MB rejeitado');
  PERFORM t.denied(format($q$insert into public.media_assets(group_id,storage_path,mime_type,size_bytes) values (%L,%L,'image/png',10)$q$, gB, gB || '/x.png'), 'comunicação A não registra mídia no GC B');
  PERFORM t.logout();
  PERFORM t.login(lb);
  INSERT INTO public.media_assets(group_id,storage_path,mime_type,size_bytes) VALUES (gB, gB || '/b.png','image/png',10) RETURNING id INTO mB;
  PERFORM t.denied(format($q$insert into public.media_assets(group_id,storage_path,mime_type,size_bytes,event_id) values (%L,%L,'image/png',10,%L)$q$, gB, gB || '/c.png', evA), 'mídia não referencia evento de outro GC');
  PERFORM t.ok(t.count(format('select 1 from public.media_assets where id=%L', mA)) = 0, 'líder B não vê mídia do GC A');
  PERFORM t.zero_rows(format($q$delete from public.media_assets where id=%L$q$, mA), 'líder B não exclui mídia do GC A');
  PERFORM t.logout();
  PERFORM t.login(viewer);
  PERFORM t.ok(t.count('select 1 from public.media_assets') = 1, 'consulta vê galeria do GC');
  PERFORM t.zero_rows(format($q$delete from public.media_assets where id=%L$q$, mA), 'consulta não exclui mídia');
  PERFORM t.logout();

  RAISE NOTICE '--- Storage privado';
  PERFORM t.login(comm);
  INSERT INTO storage.objects(bucket_id,name) VALUES ('media', gA || '/foto1.jpg');
  PERFORM t.denied(format($q$insert into storage.objects(bucket_id,name) values ('media', %L)$q$, gB || '/foto.jpg'), 'upload no GC B negado');
  PERFORM t.denied($q$insert into storage.objects(bucket_id,name) values ('media', 'lixo/foto.jpg')$q$, 'caminho fora do padrão negado');
  PERFORM t.denied(format($q$insert into storage.objects(bucket_id,name) values ('media', %L)$q$, gA || '/sub/foto.jpg'), 'subpastas não permitidas');
  PERFORM t.logout();
  PERFORM t.login(viewer);
  PERFORM t.ok(t.count('select 1 from storage.objects') = 1, 'consulta lê arquivos do próprio GC');
  PERFORM t.denied(format($q$insert into storage.objects(bucket_id,name) values ('media', %L)$q$, gA || '/v.jpg'), 'consulta não envia arquivos');
  PERFORM t.logout();
  PERFORM t.login(lb);
  PERFORM t.ok(t.count('select 1 from storage.objects') = 0, 'líder B não lê arquivos do GC A');
  PERFORM t.zero_rows(format($q$delete from storage.objects where name=%L$q$, gA || '/foto1.jpg'), 'líder B não exclui arquivo do GC A');
  PERFORM t.logout();
  PERFORM t.ok((SELECT NOT public FROM storage.buckets WHERE id='media'), 'bucket media é privado');

  RAISE NOTICE '--- templates';
  INSERT INTO public.templates(group_id,name,category,format) VALUES (NULL,'Nativo: Versículo','verse','feed_square');
  PERFORM t.login(comm);
  INSERT INTO public.templates(group_id,name,category,format) VALUES (gA,'Meu modelo','invite','story') RETURNING id INTO tplA;
  PERFORM t.ok(t.count('select 1 from public.templates') = 2, 'GC A vê modelo nativo + o próprio');
  PERFORM t.denied($q$insert into public.templates(group_id,name,category,format) values (NULL,'Falso nativo','verse','story')$q$, 'GC não cria modelo nativo');
  PERFORM t.zero_rows($q$update public.templates set name='x' where group_id is null$q$, 'GC não altera modelo nativo');
  PERFORM t.logout();
  PERFORM t.login(lb);
  PERFORM t.ok(t.count(format('select 1 from public.templates where id=%L', tplA)) = 0, 'GC B não vê modelo do GC A');
  PERFORM t.logout();

  RAISE NOTICE '--- posts, aprovação e versões';
  PERFORM t.login(comm);
  INSERT INTO public.posts(group_id,title,format,design,caption,art_media_id) VALUES (gA,'Post A','story','{"pages":[1]}','legenda', mA) RETURNING id INTO pA;
  PERFORM t.denied(format($q$insert into public.posts(group_id,title,format,art_media_id) values (%L,'x','story',%L)$q$, gA, mB), 'post não usa arte de outro GC');
  PERFORM t.denied(format($q$update public.posts set status='published' where id=%L$q$, pA), 'publicado exige registro real (published_at)');
  UPDATE public.posts SET status='published', published_at=now() WHERE id=pA;
  PERFORM t.ok((SELECT published_by FROM public.posts WHERE id=pA) = comm, 'published_by definido pelo servidor');
  UPDATE public.posts SET status='draft', published_at=NULL, design='{"pages":[1,2]}' WHERE id=pA;
  PERFORM t.ok(t.count('select 1 from public.post_versions') = 1, 'alteração do design gera versão');
  PERFORM t.denied($q$insert into public.post_versions(group_id,post_id,version) values (gen_random_uuid(),gen_random_uuid(),9)$q$, 'cliente não grava versões');
  PERFORM t.denied(format($q$update public.posts set assignee_id=%L where id=%L$q$, lb, pA), 'responsável de outro GC rejeitado');
  PERFORM t.logout();
  PERFORM t.login(la);
  UPDATE public.groups SET require_approval = true WHERE id = gA;
  PERFORM t.logout();
  PERFORM t.login(comm);
  PERFORM t.denied(format($q$update public.posts set status='approved' where id=%L$q$, pA), 'com aprovação exigida, comunicação não aprova');
  UPDATE public.posts SET status='in_review' WHERE id=pA;
  PERFORM t.logout();
  PERFORM t.login(la);
  UPDATE public.posts SET status='approved' WHERE id=pA;
  PERFORM t.ok((SELECT status FROM public.posts WHERE id=pA)='approved', 'líder aprova');
  UPDATE public.posts SET approver_id = comm WHERE id=pA;
  PERFORM t.logout();
  PERFORM t.login(comm);
  UPDATE public.posts SET status='scheduled' WHERE id=pA;
  PERFORM t.ok((SELECT status FROM public.posts WHERE id=pA)='scheduled', 'aprovador designado avança o status');
  PERFORM t.logout();
  PERFORM t.login(lb);
  INSERT INTO public.posts(group_id,title,format) VALUES (gB,'Post B','feed_square') RETURNING id INTO pB;
  PERFORM t.ok(t.count('select 1 from public.posts') = 1, 'líder B só vê posts do GC B');
  PERFORM t.zero_rows(format($q$update public.posts set title='pwn' where id=%L$q$, pA), 'líder B não altera post do GC A');
  PERFORM t.zero_rows(format($q$delete from public.posts where id=%L$q$, pA), 'líder B não exclui post do GC A');
  PERFORM t.ok(t.count('select 1 from public.post_versions') = 0, 'líder B não vê versões do GC A');
  PERFORM t.logout();
  PERFORM t.login(viewer);
  PERFORM t.denied(format($q$insert into public.posts(group_id,title,format) values (%L,'x','story')$q$, gA), 'consulta não cria post');
  PERFORM t.zero_rows(format($q$update public.posts set title='x' where id=%L$q$, pA), 'consulta não altera post');
  PERFORM t.logout();

  RAISE NOTICE '--- link na bio';
  PERFORM t.login(la);
  INSERT INTO public.bio_pages(group_id,headline) VALUES (gA,'GC A') RETURNING id INTO pageA;
  INSERT INTO public.bio_links(group_id,bio_page_id,type,label,url) VALUES (gA,pageA,'instagram','Instagram','https://instagram.com/x') RETURNING id INTO linkA;
  PERFORM t.denied(format($q$insert into public.bio_links(group_id,bio_page_id,type,label,url) values (%L,%L,'custom','x','javascript:alert(1)')$q$, gA, pageA), 'URL javascript: rejeitada');
  PERFORM t.denied(format($q$insert into public.bio_pages(group_id) values (%L)$q$, gA), 'um GC tem uma única página pública');
  PERFORM t.logout();
  PERFORM t.login(lb);
  INSERT INTO public.bio_pages(group_id,headline) VALUES (gB,'GC B') RETURNING id INTO pageB;
  PERFORM t.denied(format($q$insert into public.bio_links(group_id,bio_page_id,type,label) values (%L,%L,'custom','x')$q$, gB, pageA), 'link não vincula página de outro GC');
  PERFORM t.ok(t.count(format('select 1 from public.bio_links where id=%L', linkA)) = 0, 'líder B não vê links do GC A');
  PERFORM t.zero_rows(format($q$update public.bio_links set url='https://evil.com' where id=%L$q$, linkA), 'líder B não altera links do GC A');
  PERFORM t.logout();
  PERFORM t.anon();
  PERFORM t.denied('select * from public.bio_pages', 'anon não lê tabelas internas da bio');
  PERFORM t.denied('select * from public.bio_links', 'anon não lê links diretamente');
  PERFORM t.logout();

  RAISE NOTICE '--- visitantes: acesso mínimo e LGPD';
  PERFORM t.login(wa);
  INSERT INTO public.visitors(group_id,name,phone,source,consent_given,owner_id) VALUES (gA,'Maria','85999990000','bio_link',true,wa) RETURNING id INTO vA;
  PERFORM t.ok((SELECT consent_at IS NOT NULL FROM public.visitors WHERE id=vA), 'data do consentimento registrada no servidor');
  PERFORM t.denied(format($q$insert into public.visitors(group_id,name,consent_given) values (%L,'Sem consentimento',false)$q$, gA), 'sem consentimento não há registro');
  PERFORM t.denied(format($q$insert into public.visitors(group_id,name,consent_given) values (%L,'Invasão',true)$q$, gB), 'acolhimento A não cria visitante no GC B');
  INSERT INTO public.follow_up_tasks(group_id,visitor_id,title) VALUES (gA,vA,'Ligar');
  INSERT INTO public.visitor_interactions(group_id,visitor_id,kind,channel,content) VALUES (gA,vA,'contact_attempt','whatsapp','Mensagem enviada');
  PERFORM t.denied(format($q$insert into public.visitor_interactions(group_id,visitor_id,kind,content) values (%L,%L,'note','x')$q$, gB, vA), 'interação não mistura GCs');
  PERFORM t.denied(format($q$insert into public.visitor_interactions(group_id,visitor_id,kind,content) values (%L,%L,'note',%L)$q$, gA, vA, repeat('x', 501)), 'nota limitada a 500 caracteres');
  PERFORM t.zero_rows(format($q$update public.visitor_interactions set content='editado' where visitor_id=%L$q$, vA), 'histórico de interações não é editável');
  UPDATE public.follow_up_tasks SET completed_at = '2000-01-01' WHERE visitor_id=vA;
  PERFORM t.ok((SELECT completed_by = wa AND completed_at > '2020-01-01' FROM public.follow_up_tasks WHERE visitor_id=vA), 'conclusão de tarefa carimbada pelo servidor');
  PERFORM t.zero_rows(format($q$delete from public.visitors where id=%L$q$, vA), 'acolhimento não exclui definitivamente (só líder)');
  PERFORM t.logout();

  PERFORM t.login(comm);
  PERFORM t.ok(t.count('select 1 from public.visitors') = 0, 'comunicação não lê visitantes');
  PERFORM t.ok(t.count('select 1 from public.follow_up_tasks') = 0, 'comunicação não lê tarefas');
  PERFORM t.denied(format($q$insert into public.visitors(group_id,name,consent_given) values (%L,'x',true)$q$, gA), 'comunicação não cria visitante');
  PERFORM t.logout();
  PERFORM t.login(viewer);
  PERFORM t.ok(t.count('select 1 from public.visitors') = 0, 'consulta não lê visitantes');
  PERFORM t.logout();
  PERFORM t.login(wb);
  INSERT INTO public.visitors(group_id,name,consent_given) VALUES (gB,'João',true) RETURNING id INTO vB;
  PERFORM t.ok(t.count('select 1 from public.visitors') = 1, 'acolhimento B só vê visitante do GC B');
  PERFORM t.ok(t.count('select 1 from public.follow_up_tasks') = 0, 'acolhimento B não vê tarefas do GC A');
  PERFORM t.zero_rows(format($q$update public.visitors set status='integrated' where id=%L$q$, vA), 'acolhimento B não altera visitante do GC A');
  PERFORM t.denied(format($q$select public.anonymize_visitor(%L)$q$, vA), 'acolhimento B não anonimiza visitante do GC A');
  PERFORM t.logout();
  PERFORM t.login(lb);
  PERFORM t.ok(t.count(format('select 1 from public.visitors where id=%L', vA)) = 0, 'líder B não lê visitante do GC A');
  PERFORM t.logout();
  PERFORM t.login(la);
  PERFORM t.ok(t.count('select 1 from public.visitors') = 1, 'líder A lê visitantes do próprio GC');
  PERFORM t.logout();

  PERFORM t.login(wa);
  PERFORM public.anonymize_visitor(vA);
  PERFORM t.ok((SELECT name IS NULL AND phone IS NULL AND anonymized_at IS NOT NULL AND status='new' FROM public.visitors WHERE id=vA), 'anonimização apaga dados pessoais e mantém o agregado');
  PERFORM t.ok(t.count('select 1 from public.visitor_interactions') = 0, 'anonimização apaga o histórico de contato');
  PERFORM t.logout();
  -- retenção
  INSERT INTO public.visitors(group_id,name,consent_given,consent_at,retention_until) VALUES (gA,'Antigo',true,now(),current_date-1);
  PERFORM t.ok(public.purge_expired_visitors() = 1, 'retenção anonimiza registros vencidos');
  PERFORM t.login(la);
  PERFORM t.denied('select public.purge_expired_visitors()', 'cliente não executa a rotina de retenção');
  PERFORM t.logout();
  PERFORM t.login(la);
  DELETE FROM public.visitors WHERE group_id=gA;
  PERFORM t.ok(t.count('select 1 from public.visitors') = 0, 'líder exclui definitivamente (direito de eliminação)');
  PERFORM t.logout();

  RAISE NOTICE '--- métricas, IA e limites (somente servidor)';
  INSERT INTO public.analytics_events(group_id,event_type,source,dedupe_key) VALUES (gA,'page_view','instagram','k1');
  INSERT INTO public.analytics_events(group_id,event_type,source,dedupe_key) VALUES (gB,'page_view','instagram','k1');
  PERFORM t.denied(format($q$insert into public.analytics_events(group_id,event_type,dedupe_key) values (%L,'page_view','k1')$q$, gA), 'duplicata (mesmo dia/chave) rejeitada — superusuário');
  PERFORM t.login(viewer);
  PERFORM t.ok(t.count('select 1 from public.analytics_events') = 1, 'membro lê só métricas do próprio GC');
  PERFORM t.denied(format($q$insert into public.analytics_events(group_id,event_type) values (%L,'page_view')$q$, gA), 'cliente não grava métricas');
  PERFORM t.denied('delete from public.analytics_events', 'cliente não apaga métricas');
  PERFORM t.denied(format($q$insert into public.ai_generations(group_id,mode,status) values (%L,'caption','succeeded')$q$, gA), 'cliente não grava log de IA');
  PERFORM t.denied($q$select public.check_rate_limit('x',1,60)$q$, 'cliente não usa rate limit');
  PERFORM t.denied('select * from public.rate_limits', 'rate_limits inacessível ao cliente');
  PERFORM t.logout();
  PERFORM t.ok(public.check_rate_limit('ip:1', 2, 60) AND public.check_rate_limit('ip:1', 2, 60) AND NOT public.check_rate_limit('ip:1', 2, 60), 'limite de requisições bloqueia excesso');
  INSERT INTO public.ai_generations(group_id,user_id,mode,status) VALUES (gA,comm,'caption','succeeded'),(gA,la,'caption','succeeded');
  PERFORM t.login(comm);
  PERFORM t.ok(t.count('select 1 from public.ai_generations') = 1, 'comunicação vê só as próprias gerações');
  PERFORM t.logout();
  PERFORM t.login(la);
  PERFORM t.ok(t.count('select 1 from public.ai_generations') = 2, 'líder vê as gerações do GC');
  PERFORM t.logout();
  PERFORM t.login(lb);
  PERFORM t.ok(t.count('select 1 from public.ai_generations') = 0, 'líder B não vê gerações do GC A');
  PERFORM t.logout();

  RAISE NOTICE '--- RLS ativa em todas as tabelas públicas do GC';
  SELECT count(*) INTO n FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity AND tablename NOT IN ('schema_migrations');
  PERFORM t.ok(n = 0, 'nenhuma tabela pública sem RLS');
  RAISE NOTICE 'ETAPA 2: TODOS OS TESTES PASSARAM';
END $$;

-- Etapa 3: nomes de membros do GC
DO $$
DECLARE gA UUID; gB UUID; comm UUID := '00000000-0000-0000-0000-0000000000aa'; lb UUID;
BEGIN
  SELECT id INTO gA FROM public.groups WHERE slug='gc-a'; SELECT id INTO gB FROM public.groups WHERE slug='gc-b';
  SELECT id INTO lb FROM auth.users WHERE email='lead.b@x.com';
  UPDATE public.profiles SET display_name='Comunicadora A' WHERE id=comm;
  PERFORM t.login(comm);
  PERFORM t.ok((SELECT count(*) FROM public.group_member_names(gA)) >= 3, 'membro vê nomes dos colegas do GC');
  PERFORM t.ok((SELECT count(*) FROM public.group_member_names(gB)) = 0, 'membro do A não vê nomes do GC B');
  PERFORM t.ok(NOT EXISTS (SELECT 1 FROM public.group_member_names(gA) WHERE user_id = lb), 'nomes de outros GCs não vazam');
  PERFORM t.logout();
  PERFORM t.anon();
  PERFORM t.denied(format($q$select * from public.group_member_names(%L)$q$, gA), 'anon não lista nomes');
  PERFORM t.logout();
  RAISE NOTICE 'ETAPA 3 (BANCO): TESTES PASSARAM';
END $$;
