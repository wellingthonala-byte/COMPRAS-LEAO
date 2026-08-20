-- =====================================================================
-- COMPRAS LEÃO — Migration 005 (UP)
-- Fecha uma escalação de privilégio real: a política genérica
-- "authenticated all <tabela> using (true) with check (true)" (criada em
-- clone-schema.sql para várias tabelas, inclusive user_roles) permite que
-- QUALQUER usuário autenticado se auto-promova a admin com um único
-- INSERT direto na tabela pelo console do navegador (a chave publishable
-- basta — não precisa de service_role):
--
--   insert into public.user_roles (user_id, role) values (auth.uid(), 'admin');
--
-- O front NUNCA escreve em user_roles (confirmado: só há SELECT em
-- src/lib/backend.ts e src/lib/settingsBackend.ts) — travar INSERT/UPDATE/
-- DELETE para todo mundo except admin/gestor não quebra nenhuma
-- funcionalidade existente.
--
-- Mesma lógica para profiles: qualquer autenticado podia sobrescrever o
-- full_name/sector de QUALQUER outro usuário (não só o próprio). Aqui a
-- correção é mais cirúrgica: cada um só edita a própria linha; leitura
-- continua liberada para todo autenticado (a tela de Usuários em
-- Configurações lista todo mundo).
--
-- IMPORTANTE: isto não fecha sozinho os demais achados de RLS permissiva
-- demais (ex.: escrita em purchase_requests/purchase_installments por
-- qualquer papel) — esses exigem modelar regra por papel com mais cuidado
-- e não foram incluídos aqui para não arriscar quebrar o fluxo de
-- aprovação/compra em produção sem poder testar contra o banco real.
--
-- Aplicar no SQL Editor do Supabase. Idempotente. Reversão: 005_down.
-- =====================================================================

drop policy if exists "authenticated all user_roles" on public.user_roles;
drop policy if exists "authenticated all profiles" on public.profiles;

-- user_roles: só leitura livre; escrita reservada a admin/gestor.
do $$ begin
  create policy "authenticated read user_roles" on public.user_roles
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin write user_roles" on public.user_roles
    for insert to authenticated
    with check (public.has_any_role(array['admin', 'gestor']));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin update user_roles" on public.user_roles
    for update to authenticated
    using (public.has_any_role(array['admin', 'gestor']))
    with check (public.has_any_role(array['admin', 'gestor']));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin delete user_roles" on public.user_roles
    for delete to authenticated
    using (public.has_any_role(array['admin', 'gestor']));
exception when duplicate_object then null; end $$;

-- profiles: leitura livre (a tela de Usuários lista todo mundo); escrita
-- só na própria linha, ou por admin/gestor (correção de cadastro alheio).
do $$ begin
  create policy "authenticated read profiles" on public.profiles
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "self or admin update profiles" on public.profiles
    for update to authenticated
    using (id = auth.uid() or public.has_any_role(array['admin', 'gestor']))
    with check (id = auth.uid() or public.has_any_role(array['admin', 'gestor']));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "self or admin insert profiles" on public.profiles
    for insert to authenticated
    with check (id = auth.uid() or public.has_any_role(array['admin', 'gestor']));
exception when duplicate_object then null; end $$;
