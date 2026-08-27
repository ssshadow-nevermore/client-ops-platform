-- Harden public.set_updated_at by fixing its search_path.
--
-- The function does not need to resolve objects from caller-controlled
-- schemas, so an empty search_path removes that ambiguity.

alter function public.set_updated_at()
  set search_path = '';