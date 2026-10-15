-- Etapa 5: histórico de acompanhamento gravado pelo servidor.
\set ON_ERROR_STOP on
DO $$
DECLARE la UUID; wa UUID; comm UUID := '00000000-0000-0000-0000-0000000000aa'; gA UUID; v UUID; n BIGINT;
BEGIN
  SELECT id INTO la FROM auth.users WHERE email='lead.a@x.com'; SELECT id INTO wa FROM auth.users WHERE email='novo@x.com';
  SELECT id INTO gA FROM public.groups WHERE slug='gc-a';
  PERFORM t.login(wa);
  INSERT INTO public.visitors(group_id,name,phone,consent_given) VALUES (gA,'Carlos','85988880000',true) RETURNING id INTO v;
  UPDATE public.visitors SET status='first_contact_done' WHERE id=v;
  UPDATE public.visitors SET status='invited', owner_id=wa WHERE id=v;
  PERFORM t.ok((SELECT count(*) FROM public.visitor_interactions WHERE visitor_id=v AND kind='status_change') = 3, 'mudanças de situação e responsável são registradas');
  PERFORM t.ok((SELECT bool_and(created_by = wa) FROM public.visitor_interactions WHERE visitor_id=v), 'autor do histórico definido pelo servidor');
  PERFORM t.ok(NOT EXISTS (SELECT 1 FROM public.visitor_interactions WHERE visitor_id=v AND (content ILIKE '%Carlos%' OR content LIKE '%8588%')), 'histórico não copia dados pessoais');
  UPDATE public.visitors SET next_action='Ligar' WHERE id=v;
  PERFORM t.ok((SELECT count(*) FROM public.visitor_interactions WHERE visitor_id=v) = 3, 'outras edições não poluem o histórico');
  PERFORM t.denied(format($q$insert into public.visitor_interactions(group_id,visitor_id,kind,content) values (%L,%L,'status_change','status:new>integrated')$q$, gA, v), 'equipe não forja histórico de situação');
  INSERT INTO public.visitor_interactions(group_id,visitor_id,kind,channel,content) VALUES (gA,v,'contact_attempt','phone','Sem resposta');
  PERFORM t.zero_rows(format($q$delete from public.visitor_interactions where visitor_id=%L$q$, v), 'histórico não é apagável pela equipe');
  PERFORM t.logout();
  PERFORM t.login(comm);
  PERFORM t.ok(t.count('select 1 from public.visitor_interactions') = 0, 'comunicação não lê histórico');
  PERFORM t.logout();
  PERFORM t.login(wa);
  PERFORM public.anonymize_visitor(v);
  PERFORM t.ok(t.count(format('select 1 from public.visitor_interactions where visitor_id=%L', v)) = 0, 'anonimização apaga o histórico');
  PERFORM t.ok((SELECT status = 'invited' FROM public.visitors WHERE id=v), 'situação agregada é mantida para métricas');
  PERFORM t.logout();
  RAISE NOTICE 'ETAPA 5 (BANCO): TESTES PASSARAM';
END $$;
