
CREATE POLICY "Authenticated users can insert portfolio cases"
ON public.portfolio_cases FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update portfolio cases"
ON public.portfolio_cases FOR UPDATE
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete portfolio cases"
ON public.portfolio_cases FOR DELETE
USING (auth.role() = 'authenticated');
