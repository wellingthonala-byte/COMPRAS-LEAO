-- =====================================================================
-- COMPRAS LEÃO — Migration 003 (UP)
-- Bucket de armazenamento para a logo da empresa (Configurações → Geral).
--
-- Aplicar no SQL Editor do Supabase. Idempotente.
-- Reversão: 003_upload_logo_down.sql
-- =====================================================================

-- Bucket público (a logo precisa ser lida por qualquer um que abra o
-- sistema, inclusive na tela de login, antes de autenticar).
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

-- Leitura pública (necessário para a logo aparecer no login/sidebar sem sessão)
do $$ begin
  create policy "public read branding" on storage.objects
    for select to public
    using (bucket_id = 'branding');
exception when duplicate_object then null; end $$;

-- Upload/atualização/remoção só para admin/gestor (mesma trava de
-- app_settings — a logo é config, não é dado de qualquer usuário)
do $$ begin
  create policy "admin write branding" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'branding' and public.has_any_role(array['admin', 'gestor']));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin update branding" on storage.objects
    for update to authenticated
    using (bucket_id = 'branding' and public.has_any_role(array['admin', 'gestor']))
    with check (bucket_id = 'branding' and public.has_any_role(array['admin', 'gestor']));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin delete branding" on storage.objects
    for delete to authenticated
    using (bucket_id = 'branding' and public.has_any_role(array['admin', 'gestor']));
exception when duplicate_object then null; end $$;
