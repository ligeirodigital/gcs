-- Etapa 4: leitura pública controlada, formulários públicos e métricas.
\set ON_ERROR_STOP on
DO $$
DECLARE
  la UUID; lb UUID; viewer UUID; wa UUID; comm UUID := '00000000-0000-0000-0000-0000000000aa'; wb UUID := '00000000-0000-0000-0000-0000000000bb';
  gA UUID; gB UUID; pageA UUID; pageB UUID; linkA UUID; linkB UUID; evPub UUID; r JSONB; n BIGINT; ok BOOLEAN;
BEGIN
  SELECT id INTO la FROM auth.users WHERE email='lead.a@x.com'; SELECT id INTO lb FROM auth.users WHERE email='lead.b@x.com';
  SELECT id INTO wa FROM auth.users WHERE email='novo@x.com';
  SELECT id INTO gA FROM public.groups WHERE slug='gc-a'; SELECT id INTO gB FROM public.groups WHERE slug='gc-b';
  SELECT id INTO pageA FROM public.bio_pages WHERE group_id=gA; SELECT id INTO pageB FROM public.bio_pages WHERE group_id=gB;
  SELECT id INTO linkA FROM public.bio_links WHERE group_id=gA LIMIT 1;
  UPDATE public.groups SET address='Rua Secreta, 1', meeting_weekday=4, meeting_time='19:30' WHERE id=gA;
  DELETE FROM public.visitors; DELETE FROM public.analytics_events;

  RAISE NOTICE '--- get_public_page';
  PERFORM t.anon();
  PERFORM t.ok(public.get_public_page('gc-a') IS NULL, 'página não publicada não é exposta');
  PERFORM t.ok(public.get_public_page('nao-existe') IS NULL, 'slug inexistente retorna nulo');
  PERFORM t.logout();
  UPDATE public.bio_pages SET is_published = true, show_address = false, show_meeting = false WHERE id = pageA;
  INSERT INTO public.bio_links(group_id,bio_page_id,type,label,url,position,is_active) VALUES
    (gA,pageA,'join_gc','Participar',NULL,1,true),(gA,pageA,'custom','Inativo','https://x.com',2,false),(gA,pageA,'whatsapp','Zap','https://wa.me/5585999990000',-1,true);
  INSERT INTO public.events(group_id,name,starts_at,status,address,show_address_publicly) VALUES
    (gA,'Evento público',now()+interval '2 days','published','Rua do Evento, 5',false) RETURNING id INTO evPub;
  INSERT INTO public.events(group_id,name,starts_at,status) VALUES (gA,'Rascunho',now()+interval '2 days','draft'),(gA,'Passado',now()-interval '10 days','published'),(gA,'Cancelado',now()+interval '3 days','cancelled');
  PERFORM t.anon();
  r := public.get_public_page('GC-A');
  PERFORM t.ok(r IS NOT NULL AND r->'group'->>'name' = 'GC A', 'página publicada é lida (slug sem diferenciar maiúsculas)');
  PERFORM t.ok(jsonb_array_length(r->'links') = 3 AND r->'links'->0->>'type' = 'whatsapp', 'só links ativos, na ordem definida');
  PERFORM t.ok(r->'meeting' = 'null'::jsonb, 'endereço e horário não liberados ficam ocultos');
  PERFORM t.ok(jsonb_array_length(r->'events') = 1 AND r->'events'->0->>'name' = 'Evento público', 'só eventos publicados e futuros');
  PERFORM t.ok(r->'events'->0->'address' = 'null'::jsonb OR NOT (r->'events'->0 ? 'address') OR r->'events'->0->>'address' IS NULL, 'endereço do evento não liberado fica oculto');
  PERFORM t.ok(position('Rua Secreta' in r::text) = 0 AND position('Rua do Evento' in r::text) = 0, 'nenhum endereço vaza no JSON');
  PERFORM t.ok((SELECT bool_and(x->>'url' IS NULL) FROM jsonb_array_elements(r->'links') x WHERE x->>'type' = 'join_gc'), 'links de formulário não expõem url');
  PERFORM t.denied('select * from public.bio_links', 'tabela de links continua fechada ao público');
  PERFORM t.denied('select * from public.form_submissions', 'formulários não são legíveis ao público');
  PERFORM t.logout();
  UPDATE public.bio_pages SET show_address = true, show_meeting = true WHERE id = pageA;
  UPDATE public.events SET show_address_publicly = true WHERE id = evPub;
  PERFORM t.anon(); r := public.get_public_page('gc-a');
  PERFORM t.ok(r->'meeting'->>'address' = 'Rua Secreta, 1' AND r->'meeting'->>'weekday' = '4', 'endereço/horário liberados aparecem');
  PERFORM t.ok(r->'events'->0->>'address' = 'Rua do Evento, 5', 'endereço do evento liberado aparece');
  PERFORM t.logout();

  RAISE NOTICE '--- funções de escrita pública são exclusivas do servidor';
  PERFORM t.anon();
  PERFORM t.denied($q$select public.submit_public_form('gc-a','prayer_request',NULL,NULL,NULL,'oração',true,'v1','x')$q$, 'anon não chama submit_public_form');
  PERFORM t.denied($q$select public.record_analytics('gc-a','page_view',NULL,'x','k')$q$, 'anon não chama record_analytics');
  PERFORM t.logout();
  PERFORM t.login(la);
  PERFORM t.denied($q$select public.submit_public_form('gc-a','prayer_request',NULL,NULL,NULL,'oração',true,'v1','x')$q$, 'usuário autenticado também não');
  PERFORM t.logout();

  RAISE NOTICE '--- formulários (como service role / Edge Function)';
  SET LOCAL ROLE service_role;
  r := public.submit_public_form('gc-a','join_gc','Maria Silva','85999990000',NULL,NULL,true,'v1','instagram');
  PERFORM t.ok((r->>'ok')::boolean AND NOT (r->>'deduped')::boolean, 'participar do GC é registrado');
  PERFORM t.ok((SELECT count(*) FROM public.visitors WHERE group_id=gA AND name='Maria Silva' AND consent_given AND source='bio_link' AND consent_text_version='v1') = 1, 'cria visitante com consentimento e versão do termo');
  r := public.submit_public_form('gc-a','join_gc','Maria Silva','85999990000',NULL,NULL,true,'v1','instagram');
  PERFORM t.ok((r->>'deduped')::boolean AND (SELECT count(*) FROM public.visitors WHERE group_id=gA) = 1, 'duplicata em 24 h não cria outro visitante');
  r := public.submit_public_form('gc-a','prayer_request',NULL,NULL,NULL,'Oração pela minha família',true,'v1',NULL);
  PERFORM t.ok((SELECT count(*) FROM public.form_submissions WHERE kind='prayer_request') = 1 AND (SELECT count(*) FROM public.visitors WHERE group_id=gA) = 1, 'pedido de oração anônimo não vira visitante');
  PERFORM t.denied($q$select public.submit_public_form('gc-a','join_gc','Sem Consentimento','85999990001',NULL,NULL,false,'v1','x')$q$, 'sem consentimento é rejeitado');
  PERFORM t.denied($q$select public.submit_public_form('gc-a','join_gc','Sem Contato',NULL,NULL,NULL,true,'v1','x')$q$, 'sem telefone/e-mail é rejeitado');
  PERFORM t.denied($q$select public.submit_public_form('gc-a','prayer_request',NULL,NULL,NULL,'   ',true,'v1','x')$q$, 'pedido de oração vazio é rejeitado');
  PERFORM t.denied($q$select public.submit_public_form('gc-a','join_gc','Email Ruim',NULL,'nao-e-email',NULL,true,'v1','x')$q$, 'e-mail inválido é rejeitado');
  PERFORM t.denied($q$select public.submit_public_form('gc-b','prayer_request',NULL,NULL,NULL,'x',true,'v1','x')$q$, 'página não publicada não recebe formulários');
  PERFORM t.denied($q$select public.submit_public_form('inexistente','prayer_request',NULL,NULL,NULL,'x',true,'v1','x')$q$, 'slug inexistente');
  PERFORM t.ok((SELECT count(*) FROM public.analytics_events WHERE event_type='form_submit') = 2, 'envios válidos geram evento form_submit (e só eles)');

  RAISE NOTICE '--- métricas medidas pela plataforma';
  PERFORM t.ok(public.record_analytics('gc-a','page_view',NULL,'Instagram','h1'), 'visualização registrada');
  PERFORM t.ok(NOT public.record_analytics('gc-a','page_view',NULL,'Instagram','h1'), 'mesma chave no mesmo dia é duplicata');
  PERFORM t.ok(public.record_analytics('gc-a','page_view',NULL,'instagram','h2'), 'outra chave é outra visualização');
  PERFORM t.ok(public.record_analytics('gc-a','link_click',linkA,'instagram','h1'), 'clique em link ativo registrado');
  PERFORM t.ok(NOT public.record_analytics('gc-a','link_click',gen_random_uuid(),'x','h9'), 'clique em link inexistente rejeitado');
  PERFORM t.ok(NOT public.record_analytics('gc-b','page_view',NULL,'x','h1'), 'página não publicada não gera métricas');
  RESET ROLE;
  SELECT l.id INTO linkB FROM public.bio_links l WHERE l.group_id = gA AND NOT is_active LIMIT 1;
  SET LOCAL ROLE service_role;
  PERFORM t.ok(NOT public.record_analytics('gc-a','link_click',linkB,'x','h3'), 'clique em link inativo rejeitado');
  RESET ROLE;
  PERFORM t.ok((SELECT lower(source) FROM public.analytics_events WHERE event_type='page_view' LIMIT 1) = 'instagram', 'origem normalizada');

  RAISE NOTICE '--- acesso interno aos formulários';
  PERFORM t.login(wa);
  PERFORM t.ok(t.count('select 1 from public.form_submissions') = 2, 'acolhimento A lê os formulários do GC A');
  UPDATE public.form_submissions SET status='handled' WHERE kind='prayer_request';
  PERFORM t.ok((SELECT handled_by = wa FROM public.form_submissions WHERE kind='prayer_request'), 'quem atendeu fica registrado pelo servidor');
  PERFORM t.denied($q$update public.form_submissions set message='adulterada'$q$, 'conteúdo do formulário não é editável');
  PERFORM t.denied($q$insert into public.form_submissions(group_id,kind,consent_given) values (gen_random_uuid(),'join_gc',true)$q$, 'cliente não insere formulários');
  PERFORM t.zero_rows('delete from public.form_submissions', 'acolhimento não exclui formulários (só líder)');
  PERFORM t.logout();
  PERFORM t.login(comm);
  PERFORM t.ok(t.count('select 1 from public.form_submissions') = 0, 'comunicação não lê formulários');
  PERFORM t.logout();
  PERFORM t.login(lb);
  PERFORM t.ok(t.count('select 1 from public.form_submissions') = 0, 'líder B não lê formulários do GC A');
  PERFORM t.logout();

  RAISE NOTICE '--- retenção de formulários';
  UPDATE public.form_submissions SET retention_until = current_date - 1 WHERE kind='prayer_request';
  PERFORM t.ok(public.purge_expired_visitors() >= 1, 'retenção anonimiza formulários vencidos');
  PERFORM t.ok((SELECT message IS NULL AND anonymized_at IS NOT NULL FROM public.form_submissions WHERE kind='prayer_request'), 'mensagem apagada após o prazo');
  RAISE NOTICE 'ETAPA 4 (BANCO): TESTES PASSARAM';
END $$;
