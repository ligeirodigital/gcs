-- O painel /admin do site da agência permitia escrita a QUALQUER usuário autenticado.
-- Com o GC Digital (cadastro de muitos usuários) isso passa a ser um risco: restringe a escrita
-- ao administrador da plataforma (public.platform_admins).
--
-- ATENÇÃO: aplique DEPOIS de cadastrar o administrador da agência, senão ele perde acesso ao /admin:
--   INSERT INTO public.platform_admins (user_id) SELECT id FROM auth.users WHERE email = 'SEU_EMAIL';

DROP POLICY IF EXISTS "Authenticated users can insert portfolio cases" ON public.portfolio_cases;
DROP POLICY IF EXISTS "Authenticated users can update portfolio cases" ON public.portfolio_cases;
DROP POLICY IF EXISTS "Authenticated users can delete portfolio cases" ON public.portfolio_cases;
CREATE POLICY "Platform admin can insert portfolio cases" ON public.portfolio_cases FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());
CREATE POLICY "Platform admin can update portfolio cases" ON public.portfolio_cases FOR UPDATE TO authenticated USING (public.is_platform_admin());
CREATE POLICY "Platform admin can delete portfolio cases" ON public.portfolio_cases FOR DELETE TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Public can view published projects" ON public.projects;
DROP POLICY IF EXISTS "Authenticated can insert projects" ON public.projects;
DROP POLICY IF EXISTS "Authenticated can update projects" ON public.projects;
DROP POLICY IF EXISTS "Authenticated can delete projects" ON public.projects;
CREATE POLICY "Public can view published projects" ON public.projects FOR SELECT USING (status = 'published' OR public.is_platform_admin());
CREATE POLICY "Platform admin can insert projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());
CREATE POLICY "Platform admin can update projects" ON public.projects FOR UPDATE TO authenticated USING (public.is_platform_admin());
CREATE POLICY "Platform admin can delete projects" ON public.projects FOR DELETE TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Public can view published affiliates" ON public.affiliate_products;
DROP POLICY IF EXISTS "Authenticated can insert affiliates" ON public.affiliate_products;
DROP POLICY IF EXISTS "Authenticated can update affiliates" ON public.affiliate_products;
DROP POLICY IF EXISTS "Authenticated can delete affiliates" ON public.affiliate_products;
CREATE POLICY "Public can view published affiliates" ON public.affiliate_products FOR SELECT USING (status = 'published' OR public.is_platform_admin());
CREATE POLICY "Platform admin can insert affiliates" ON public.affiliate_products FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());
CREATE POLICY "Platform admin can update affiliates" ON public.affiliate_products FOR UPDATE TO authenticated USING (public.is_platform_admin());
CREATE POLICY "Platform admin can delete affiliates" ON public.affiliate_products FOR DELETE TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Authenticated users can upload portfolio images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update portfolio images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete portfolio images" ON storage.objects;
CREATE POLICY "Platform admin can upload portfolio images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'portfolio' AND public.is_platform_admin());
CREATE POLICY "Platform admin can update portfolio images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'portfolio' AND public.is_platform_admin());
CREATE POLICY "Platform admin can delete portfolio images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'portfolio' AND public.is_platform_admin());
