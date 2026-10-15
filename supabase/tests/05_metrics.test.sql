-- Etapa 7: métricas no servidor e dados manuais.
\set ON_ERROR_STOP on
DO $$
DECLARE la UUID; lb UUID; wa UUID; comm UUID := '00000000-0000-0000-0000-0000000000aa'; viewer UUID; out UUID; gA UUID; gB UUID; linkA UUID; r JSONB;
  f DATE := current_date - 6; t DATE := current_date;
BEGIN
  SELECT id INTO la FROM auth.users WHERE email='lead.a@x.com'; SELECT id INTO lb FROM auth.users WHERE email='lead.b@x.com';
  SELECT id INTO wa FROM auth.users WHERE email='novo@x.com'; SELECT id INTO viewer FROM auth.users WHERE email='comm.a@x.com'; SELECT id INTO out FROM auth.users WHERE email='outsider@x.com';
  SELECT id INTO gA FROM public.groups WHERE slug='gc-a'; SELECT id INTO gB FROM public.groups WHERE slug='gc-b';
  SELECT id INTO linkA FROM public.bio_links WHERE group_id=gA AND is_active LIMIT 1;
  UPDATE public.groups SET timezone='America/Fortaleza', require_approval=false WHERE id IN (gA,gB);
  DELETE FROM public.analytics_events; DELETE FROM public.visitors; DELETE FROM public.posts; DELETE FROM public.follow_up_tasks;

  -- dados medidos (GC A): 3 views (2 do instagram), 2 cliques no mesmo link, 1 formulário; GC B: 5 views
  INSERT INTO public.analytics_events(group_id,event_type,source,dedupe_key) VALUES
    (gA,'page_view','instagram','a1'),(gA,'page_view','instagram','a2'),(gA,'page_view',NULL,'a3'),
    (gA,'form_submit','instagram',NULL);
  INSERT INTO public.analytics_events(group_id,event_type,link_id,source,dedupe_key) VALUES (gA,'link_click',linkA,'instagram','c1'),(gA,'link_click',linkA,'instagram','c2');
  INSERT INTO public.analytics_events(group_id,event_type,dedupe_key) SELECT gB,'page_view','b'||g FROM generate_series(1,5) g;
  -- evento antigo fora do período
  INSERT INTO public.analytics_events(group_id,event_type,dedupe_key,created_at) VALUES (gA,'page_view','old', now() - interval '40 days');
  -- visitantes (A): 4 contatos no período; 2 compareceram; 1 retornou; + 1 fora do período
  INSERT INTO public.visitors(group_id,name,source,consent_given,status) VALUES
    (gA,'V1','bio_link',true,'new'),(gA,'V2','instagram',true,'visited'),(gA,'V3','bio_link',true,'returned'),(gA,'V4','event',true,'invited');
  INSERT INTO public.visitors(group_id,name,source,consent_given,status,first_contact_at) VALUES (gA,'Velho','other',true,'integrated', now() - interval '60 days');
  INSERT INTO public.follow_up_tasks(group_id,visitor_id,title,due_at) SELECT gA, id, 'T', now() - interval '1 day' FROM public.visitors WHERE name='V1';
  INSERT INTO public.posts(group_id,title,format,status,published_at) VALUES (gA,'P1','story','published',now()),(gA,'P2','feed_vertical','draft',NULL),(gA,'P3','story','in_review',NULL);

  RAISE NOTICE '--- metrics_summary';
  PERFORM t.login(la);
  r := public.metrics_summary(gA, f, t);
  PERFORM t.ok((r->>'views')::int = 3 AND (r->>'clicks')::int = 2 AND (r->>'forms')::int = 1, 'views, cliques e formulários só do GC e do período');
  PERFORM t.ok((r->'clicks_by_link'->0->>'clicks')::int = 2, 'cliques agrupados por link');
  PERFORM t.ok(jsonb_array_length(r->'views_by_day') = 7 AND (SELECT sum((x->>'views')::int) FROM jsonb_array_elements(r->'views_by_day') x) = 3, 'série diária com todos os dias e soma correta');
  PERFORM t.ok(r->'views_by_source'->0->>'source' = 'instagram' AND (r->'views_by_source'->0->>'views')::int = 2, 'origem das visualizações (sem origem = direto)');
  PERFORM t.ok((r->'visitors'->>'contacts')::int = 4 AND (r->'visitors'->>'attended')::int = 2 AND (r->'visitors'->>'returned')::int = 1, 'contatos, comparecimento e retorno do período');
  PERFORM t.ok((r->'visitors'->>'tasks_overdue')::int = 1 AND (r->'visitors'->>'tasks_pending')::int = 1, 'tarefas pendentes e atrasadas');
  PERFORM t.ok((r->>'posts_created')::int = 3 AND (r->'posts_by_format'->>'story')::int = 2 AND (r->>'published_in_period')::int = 1 AND (r->'posts_status_now'->>'draft')::int = 1, 'conteúdos por formato e situação');
  PERFORM t.ok((public.metrics_summary(gA, current_date + 1, current_date + 7)->>'views')::int = 0, 'período sem dados retorna zero, não erro');
  PERFORM t.denied(format($q$select public.metrics_summary(%L, current_date-1, current_date-3)$q$, gA), 'período invertido rejeitado');
  PERFORM t.denied(format($q$select public.metrics_summary(%L, current_date-400, current_date)$q$, gA), 'período acima de 366 dias rejeitado');
  PERFORM t.denied(format($q$select public.metrics_summary(%L, current_date-6, current_date)$q$, gB), 'líder A não calcula métricas do GC B');
  PERFORM t.logout();
  PERFORM t.login(lb);
  PERFORM t.ok((public.metrics_summary(gB, f, t)->>'views')::int = 5, 'líder B vê apenas as próprias métricas');
  PERFORM t.denied(format($q$select public.metrics_summary(%L, current_date-6, current_date)$q$, gA), 'líder B não calcula métricas do GC A');
  PERFORM t.logout();
  PERFORM t.login(comm);
  r := public.metrics_summary(gA, f, t);
  PERFORM t.ok((r->>'views')::int = 3 AND r->'visitors' = 'null'::jsonb, 'comunicação vê métricas da página, mas não as de visitantes');
  PERFORM t.logout();
  PERFORM t.login(wa);
  PERFORM t.ok((public.metrics_summary(gA, f, t)->'visitors'->>'contacts')::int = 4, 'acolhimento vê agregados de visitantes');
  PERFORM t.logout();
  PERFORM t.login(out);
  PERFORM t.denied(format($q$select public.metrics_summary(%L, current_date-6, current_date)$q$, gA), 'sem vínculo não calcula métricas');
  PERFORM t.logout();
  PERFORM t.anon();
  PERFORM t.denied(format($q$select public.metrics_summary(%L, current_date-6, current_date)$q$, gA), 'anônimo não executa a função');
  PERFORM t.logout();

  RAISE NOTICE '--- dados manuais do Instagram';
  PERFORM t.login(comm);
  INSERT INTO public.manual_metrics(group_id,metric,value,period_start,period_end,note,created_by) VALUES (gA,'followers',120,f,t,'Print do app', lb);
  PERFORM t.ok((SELECT created_by = comm FROM public.manual_metrics WHERE group_id=gA), 'autor definido pelo servidor');
  PERFORM t.denied(format($q$insert into public.manual_metrics(group_id,metric,value,period_start,period_end) values (%L,'reach',-5,current_date,current_date)$q$, gA), 'valor negativo rejeitado');
  PERFORM t.denied(format($q$insert into public.manual_metrics(group_id,metric,value,period_start,period_end) values (%L,'likes',5,current_date,current_date-1)$q$, gA), 'período invertido rejeitado');
  PERFORM t.denied(format($q$insert into public.manual_metrics(group_id,metric,value,period_start,period_end) values (%L,'followers',5,current_date,current_date)$q$, gB), 'não registra dados em outro GC');
  PERFORM t.logout();
  PERFORM t.login(viewer);
  PERFORM t.ok(t.count('select 1 from public.manual_metrics') = 1, 'consulta lê dados manuais do GC');
  PERFORM t.denied(format($q$insert into public.manual_metrics(group_id,metric,value,period_start,period_end) values (%L,'likes',1,current_date,current_date)$q$, gA), 'consulta não registra dados');
  PERFORM t.logout();
  PERFORM t.login(lb);
  PERFORM t.ok(t.count('select 1 from public.manual_metrics') = 0, 'líder B não lê dados manuais do GC A');
  PERFORM t.zero_rows('delete from public.manual_metrics', 'líder B não apaga dados do GC A');
  PERFORM t.logout();
  RAISE NOTICE 'ETAPA 7 (BANCO): TESTES PASSARAM';
END $$;
