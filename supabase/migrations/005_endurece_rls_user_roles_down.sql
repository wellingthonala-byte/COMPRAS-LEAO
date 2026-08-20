-- =====================================================================
-- COMPRAS LEÃO — Migration 005 (DOWN)
-- Reversão de 005_endurece_rls_user_roles_up.sql — volta às políticas
-- genéricas "authenticated all ... using (true)" originais do
-- clone-schema.sql. Só use se a correção causar algum efeito colateral
-- inesperado; volta a permitir auto-promoção a admin.
-- =====================================================================

drop policy if exists "authenticated read user_roles" on public.user_roles;
drop policy if exists "admin write user_roles" on public.user_roles;
drop policy if exists "admin update user_roles" on public.user_roles;
drop policy if exists "admin delete user_roles" on public.user_roles;

drop policy if exists "authenticated read profiles" on public.profiles;
drop policy if exists "self or admin update profiles" on public.profiles;
drop policy if exists "self or admin insert profiles" on public.profiles;

do $$ begin
  create policy "authenticated all user_roles" on public.user_roles
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "authenticated all profiles" on public.profiles
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
