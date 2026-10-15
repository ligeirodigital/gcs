-- Permite que membros de um GC vejam o NOME (somente) dos demais membros do mesmo GC,
-- por exemplo "enviado por" na galeria. Não expõe telefone nem membros de outros GCs.
CREATE OR REPLACE FUNCTION public.group_member_names(p_group UUID)
RETURNS TABLE (user_id UUID, display_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT p.id, p.display_name
  FROM public.groups g
  JOIN public.memberships m ON m.group_id = g.id OR (m.group_id IS NULL AND m.church_id = g.church_id)
  JOIN public.profiles p ON p.id = m.user_id
  WHERE g.id = p_group AND public.is_group_member(p_group)
$$;
REVOKE ALL ON FUNCTION public.group_member_names(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.group_member_names(UUID) TO authenticated;
