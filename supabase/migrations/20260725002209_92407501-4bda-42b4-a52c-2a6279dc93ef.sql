
REVOKE EXECUTE ON FUNCTION public.has_case_access(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_case_access(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
