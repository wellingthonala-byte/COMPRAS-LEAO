-- =====================================================================
-- COMPRAS LEÃO — Esquema do PROJETO NOVO (clone do SaaS antigo)
-- Execute no SQL Editor do projeto NOVO antes da cópia dos dados.
-- Estrutura idêntica à do projeto antigo + valores extras de enum para
-- os novos fluxos do Compras Leão (aprovação, cancelamento, faturamento).
-- =====================================================================

-- ---------- ENUMS (originais + valores novos) ----------
do $$ begin
  create type public.app_role as enum ('admin', 'gestor', 'compras', 'solicitante');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.priority_type as enum ('maquina_parada', 'emergencia', 'nao_urgente');
exception when duplicate_object then null; end $$;

do $$ begin
  -- originais: em_cotacao, comprado, em_rota, em_servico, disponivel, finalizado
  -- novos:     nova_solicitacao, em_aprovacao, cancelada
  create type public.status_type as enum (
    'nova_solicitacao', 'em_aprovacao', 'em_cotacao', 'comprado',
    'em_rota', 'em_servico', 'disponivel', 'finalizado', 'cancelada'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  -- originais: aberta, em_execucao, concluida, cancelada
  -- novos:     aguardando_aprovacao, programada, pausada, faturada
  create type public.service_order_status as enum (
    'aberta', 'aguardando_aprovacao', 'programada', 'em_execucao',
    'pausada', 'concluida', 'faturada', 'cancelada'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum ('pendente', 'pago');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.service_type as enum ('motoboy', 'frete', 'manutencao', 'servico_interno', 'outro');
exception when duplicate_object then null; end $$;

-- ---------- SEQUÊNCIAS ----------
create sequence if not exists public.purchase_requests_request_number_seq;
create sequence if not exists public.service_orders_order_number_seq;

-- ---------- TABELAS ----------
create table if not exists public.profiles (
  id uuid not null primary key references auth.users(id) on delete cascade,
  full_name text not null,
  sector text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.user_roles (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'solicitante',
  created_at timestamptz default now()
);

create table if not exists public.purchase_requests (
  id uuid not null default gen_random_uuid() primary key,
  request_number integer not null default nextval('public.purchase_requests_request_number_seq') unique,
  requester_id uuid not null references auth.users(id),
  sector text not null,
  priority public.priority_type not null default 'nao_urgente',
  status public.status_type not null default 'em_cotacao',
  observations text,
  expected_delivery_date date,
  actual_delivery_date date,
  delivery_notes text,
  closing_date timestamptz,
  closing_user_id uuid references auth.users(id),
  closing_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.request_items (
  id uuid not null default gen_random_uuid() primary key,
  request_id uuid not null references public.purchase_requests(id) on delete cascade,
  item_number integer not null,
  description text not null,
  quantity integer not null default 1,
  application text,
  observations text,
  technical_spec text,
  attachments text[],
  created_at timestamptz default now(),
  priority public.priority_type default 'nao_urgente',
  expected_delivery_date date,
  has_objection boolean default false,
  objection_notes text
);

create table if not exists public.status_history (
  id uuid not null default gen_random_uuid() primary key,
  request_id uuid not null references public.purchase_requests(id) on delete cascade,
  status public.status_type not null,
  user_id uuid not null references auth.users(id),
  user_name text not null,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.suppliers (
  id uuid not null default gen_random_uuid() primary key,
  request_id uuid not null unique references public.purchase_requests(id) on delete cascade,
  name text not null,
  value numeric,
  order_number text,
  invoice_number text,
  attachments text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.service_orders (
  id uuid not null default gen_random_uuid() primary key,
  order_number integer not null default nextval('public.service_orders_order_number_seq') unique,
  requester_id uuid not null,
  service_type public.service_type not null default 'outro',
  created_at timestamptz default now(),
  service_type_other text,
  description text not null default '',
  provider_name text not null default '',
  sector text not null default '',
  priority public.priority_type not null default 'nao_urgente',
  agreed_value numeric,
  paid_value numeric,
  payment_status public.payment_status not null default 'pendente',
  payment_method text,
  service_date date,
  execution_deadline date,
  status public.service_order_status not null default 'aberta',
  observations text,
  attachments text[],
  closing_date timestamptz,
  closing_user_id uuid,
  closing_notes text,
  updated_at timestamptz default now()
);

create table if not exists public.service_order_history (
  id uuid not null default gen_random_uuid() primary key,
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  status public.service_order_status not null,
  user_id uuid not null,
  user_name text not null,
  notes text,
  created_at timestamptz default now()
);

-- Índices úteis
create index if not exists idx_pr_status on public.purchase_requests (status);
create index if not exists idx_pr_requester on public.purchase_requests (requester_id);
create index if not exists idx_ri_request on public.request_items (request_id);
create index if not exists idx_sh_request on public.status_history (request_id);
create index if not exists idx_so_status on public.service_orders (status);
create index if not exists idx_soh_order on public.service_order_history (service_order_id);

-- ---------- RLS: usuários autenticados têm acesso ----------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.request_items enable row level security;
alter table public.status_history enable row level security;
alter table public.suppliers enable row level security;
alter table public.service_orders enable row level security;
alter table public.service_order_history enable row level security;

do $$
declare t text;
begin
  foreach t in array array['profiles','user_roles','purchase_requests','request_items','status_history','suppliers','service_orders','service_order_history']
  loop
    begin
      execute format('create policy "authenticated all %1$s" on public.%1$I for all to authenticated using (true) with check (true)', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
