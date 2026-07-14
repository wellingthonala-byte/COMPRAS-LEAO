-- =====================================================================
-- COMPRAS LEÃO — Esquema do banco (Supabase / Postgres)
-- Execute no SQL Editor do Supabase (Dashboard > SQL Editor > New query)
-- Pode rodar mais de uma vez sem problema (IF NOT EXISTS).
-- =====================================================================

-- Usuários do sistema (papéis do fluxo)
create table if not exists public.app_users (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  email       text,
  password    text not null,           -- provisório; migrar para Supabase Auth depois
  role        text not null check (role in ('gestor', 'comprador', 'solicitante')),
  initials    text not null,
  active      boolean not null default true,
  last_login  timestamptz,
  created_at  timestamptz not null default now()
);

-- Solicitações de compra (o documento inteiro fica em JSONB — mesmo formato do front)
create table if not exists public.purchase_requests (
  id          text primary key,
  number      text not null,
  status      text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists idx_pr_status on public.purchase_requests (status);

-- Ordens de serviço
create table if not exists public.service_orders (
  id          text primary key,
  number      text not null,
  status      text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists idx_os_status on public.service_orders (status);

-- Configurações do sistema (linha única)
create table if not exists public.app_settings (
  id          int primary key default 1 check (id = 1),
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Usuários iniciais (só insere se a tabela estiver vazia)
insert into public.app_users (name, password, role, initials)
select * from (values
  ('Well',    '1221', 'gestor',      'WE'),
  ('Charles', '1221', 'comprador',   'CH'),
  ('Alef',    '1221', 'solicitante', 'AL')
) as v(name, password, role, initials)
where not exists (select 1 from public.app_users);

-- ---------------------------------------------------------------------
-- Segurança (RLS) — nesta fase liberamos leitura/escrita via chave anon;
-- quando migrarmos o login para o Supabase Auth, as políticas ficam por papel.
-- ---------------------------------------------------------------------
alter table public.app_users        enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.service_orders   enable row level security;
alter table public.app_settings     enable row level security;

do $$ begin
  create policy "anon full access app_users" on public.app_users
    for all using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "anon full access purchase_requests" on public.purchase_requests
    for all using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "anon full access service_orders" on public.service_orders
    for all using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "anon full access app_settings" on public.app_settings
    for all using (true) with check (true);
exception when duplicate_object then null; end $$;
