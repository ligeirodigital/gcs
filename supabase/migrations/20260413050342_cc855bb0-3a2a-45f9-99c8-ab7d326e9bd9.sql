
-- Create table for portfolio cases
CREATE TABLE public.portfolio_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  result TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT,
  logo_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.portfolio_cases ENABLE ROW LEVEL SECURITY;

-- Anyone can view portfolio cases (public site)
CREATE POLICY "Portfolio cases are publicly viewable"
ON public.portfolio_cases FOR SELECT
USING (true);

-- Create storage bucket for portfolio images
INSERT INTO storage.buckets (id, name, public) VALUES ('portfolio', 'portfolio', true);

-- Public read access for portfolio images
CREATE POLICY "Portfolio images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'portfolio');

-- Authenticated users can upload portfolio images
CREATE POLICY "Authenticated users can upload portfolio images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'portfolio' AND auth.role() = 'authenticated');

-- Authenticated users can update portfolio images
CREATE POLICY "Authenticated users can update portfolio images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'portfolio' AND auth.role() = 'authenticated');

-- Authenticated users can delete portfolio images
CREATE POLICY "Authenticated users can delete portfolio images"
ON storage.objects FOR DELETE
USING (bucket_id = 'portfolio' AND auth.role() = 'authenticated');

-- Insert seed data from existing cases
INSERT INTO public.portfolio_cases (title, category, result, description, display_order) VALUES
('E-commerce de Moda', 'Tráfego Pago + Social', '+320% de vendas em 4 meses', 'Estratégia integrada de Meta Ads e Google Shopping que triplicou o faturamento.', 1),
('Clínica Odontológica', 'Google Ads + SEO', '85 novos pacientes/mês', 'Campanhas locais e otimização orgânica que lotaram a agenda da clínica.', 2),
('SaaS B2B', 'Inbound + Email', '+150% de leads qualificados', 'Funil completo de conteúdo e automação que reduziu o CAC pela metade.', 3),
('Restaurante Premium', 'Social Media + Branding', '50K seguidores em 3 meses', 'Rebranding completo e gestão de redes que viralizou nas redes sociais.', 4);
