-- =====================================================================
-- COMPRAS LEÃO — Migration 002 (UP)
-- Módulo de Configurações: persistência real no Supabase + RBAC de
-- Perfis e Permissões.
--
-- Aplicar no SQL Editor do Supabase. Idempotente: pode rodar mais de uma
-- vez sem erro. NÃO altera nem remove nada das tabelas existentes — só
-- acrescenta duas tabelas novas.
--
-- Reversão: 002_modulo_configuracoes_down.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Configurações do sistema — linha única (id = 1), tudo em jsonb.
--    updated_by referencia quem fez a última alteração (auditoria simples).
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  id         int primary key default 1 check (id = 1),
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

drop trigger if exists trg_app_settings_updated_at on public.app_settings;
create trigger trg_app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;

do $$ begin
  create policy "authenticated read app_settings" on public.app_settings
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin write app_settings" on public.app_settings
    for insert to authenticated
    with check (public.has_any_role(array['admin', 'gestor']));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin update app_settings" on public.app_settings
    for update to authenticated
    using (public.has_any_role(array['admin', 'gestor']))
    with check (public.has_any_role(array['admin', 'gestor']));
exception when duplicate_object then null; end $$;

-- Garante que a linha única já exista (evita "não encontrado" no primeiro load)
insert into public.app_settings (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Perfis e Permissões — matriz papel × módulo.
--
--    module usa as mesmas chaves das SECTIONS do SettingsPage
--    (usuarios, perfis, seguranca, backup, auditoria, api, banco, ...),
--    para que o front consiga bloquear cada aba consultando esta tabela
--    em vez do "role === 'gestor'" fixo que existe hoje.
-- ---------------------------------------------------------------------
create table if not exists public.role_permissions (
  role       public.app_role not null,
  module     text not null,
  allowed    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (role, module)
);

drop trigger if exists trg_role_permissions_updated_at on public.role_permissions;
create trigger trg_role_permissions_updated_at
  before update on public.role_permissions
  for each row execute function public.set_updated_at();

alter table public.role_permissions enable row level security;

do $$ begin
  create policy "authenticated read role_permissions" on public.role_permissions
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin write role_permissions" on public.role_permissions
    for insert to authenticated
    with check (public.has_any_role(array['admin', 'gestor']));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin update role_permissions" on public.role_permissions
    for update to authenticated
    using (public.has_any_role(array['admin', 'gestor']))
    with check (public.has_any_role(array['admin', 'gestor']));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin delete role_permissions" on public.role_permissions
    for delete to authenticated
    using (public.has_any_role(array['admin', 'gestor']));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 3. Seed inicial — reproduz exatamente o comportamento atual (cadeado
--    = só admin/gestor) para os módulos hoje marcados como "critical" no
--    front, para nenhum acesso mudar de comportamento no dia da troca.
--    Ajustável depois pela própria tela de Perfis e Permissões.
-- ---------------------------------------------------------------------
insert into public.role_permissions (role, module, allowed)
select r.role, m.module, (r.role in ('admin', 'gestor'))
from unnest(enum_range(null::public.app_role)) as r(role)
cross join unnest(array['usuarios','perfis','seguranca','backup','auditoria','api','banco']) as m(module)
on conflict (role, module) do nothing;
