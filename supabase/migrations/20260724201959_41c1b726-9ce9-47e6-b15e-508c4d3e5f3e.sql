
-- updated_at helper (create if not already present)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============ projects ============
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  short_description TEXT NOT NULL,
  full_description TEXT,
  cover_url TEXT,
  logo_url TEXT,
  gallery TEXT[] NOT NULL DEFAULT '{}',
  videos TEXT[] NOT NULL DEFAULT '{}',
  technologies TEXT[] NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',
  features TEXT[] NOT NULL DEFAULT '{}',
  benefits TEXT[] NOT NULL DEFAULT '{}',
  clients TEXT[] NOT NULL DEFAULT '{}',
  demo_url TEXT,
  site_url TEXT,
  whatsapp_url TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  featured BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  meta_title TEXT,
  meta_description TEXT,
  og_image TEXT,
  views_count INTEGER NOT NULL DEFAULT 0,
  clicks_demo INTEGER NOT NULL DEFAULT 0,
  clicks_whatsapp INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.projects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view published projects"
  ON public.projects FOR SELECT
  USING (status = 'published' OR auth.role() = 'authenticated');

CREATE POLICY "Authenticated can insert projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can update projects"
  ON public.projects FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can delete projects"
  ON public.projects FOR DELETE
  USING (auth.role() = 'authenticated');

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX projects_status_idx ON public.projects (status);
CREATE INDEX projects_display_order_idx ON public.projects (display_order);

-- ============ affiliate_products ============
CREATE TABLE public.affiliate_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  category TEXT NOT NULL,
  image_url TEXT,
  description TEXT NOT NULL,
  price TEXT,
  affiliate_url TEXT NOT NULL,
  featured BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published',
  clicks_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.affiliate_products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_products TO authenticated;
GRANT ALL ON public.affiliate_products TO service_role;

ALTER TABLE public.affiliate_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view published affiliates"
  ON public.affiliate_products FOR SELECT
  USING (status = 'published' OR auth.role() = 'authenticated');

CREATE POLICY "Authenticated can insert affiliates"
  ON public.affiliate_products FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can update affiliates"
  ON public.affiliate_products FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can delete affiliates"
  ON public.affiliate_products FOR DELETE
  USING (auth.role() = 'authenticated');

CREATE TRIGGER update_affiliate_products_updated_at
  BEFORE UPDATE ON public.affiliate_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ counters (SECURITY DEFINER RPCs) ============
CREATE OR REPLACE FUNCTION public.increment_project_metric(_project_id UUID, _kind TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _kind = 'view' THEN
    UPDATE public.projects SET views_count = views_count + 1 WHERE id = _project_id;
  ELSIF _kind = 'demo' THEN
    UPDATE public.projects SET clicks_demo = clicks_demo + 1 WHERE id = _project_id;
  ELSIF _kind = 'whatsapp' THEN
    UPDATE public.projects SET clicks_whatsapp = clicks_whatsapp + 1 WHERE id = _project_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_project_metric(UUID, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_affiliate_click(_affiliate_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.affiliate_products SET clicks_count = clicks_count + 1 WHERE id = _affiliate_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_affiliate_click(UUID) TO anon, authenticated;
