-- =====================================================================
-- COMPRAS LEÃO — Migration 001 (UP)
-- Módulo de Controle Financeiro Futuro: parcelas previstas
--
-- Aplicar no SQL Editor do Supabase. Idempotente: pode rodar mais de uma
-- vez sem erro. NÃO altera nem remove nada das tabelas existentes — só
-- acrescenta um tipo, um papel, uma função e uma tabela nova.
--
-- Reversão: 001_controle_financeiro_futuro_down.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Papel "financeiro"
--    O enum app_role tinha apenas admin/gestor/compras/solicitante, então
--    não havia como distinguir quem enxerga a projeção consolidada.
--    Postgres não permite remover valor de enum: a reversão deixa este
--    valor no tipo (inofensivo, pois nenhuma linha passa a usá-lo).
-- ---------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from pg_enum e
      join pg_type t on t.oid = e.enumtypid
    where t.typname = 'app_role' and e.enumlabel = 'financeiro'
  ) then
    alter type public.app_role add value 'financeiro';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Status de confiabilidade da parcela
--    previsto   → valor aprovado pelo gestor, card ainda não em "Comprado"
--    confirmado → card em "Comprado", datas e valores definitivos
--    pago       → parcela quitada
--    cancelado  → pedido cancelado após a aprovação
-- ---------------------------------------------------------------------
do $$ begin
  create type public.installment_status as enum ('previsto', 'confirmado', 'pago', 'cancelado');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 3. Função auxiliar de papel (usada pelas políticas de RLS)
-- ---------------------------------------------------------------------
create or replace function public.has_role(_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = _role
  );
$$;

-- ---------------------------------------------------------------------
-- 4. Parcelas previstas
--
--    As colunas origin_* congelam a projeção feita na aprovação e nunca
--    são reescritas — é o histórico exigido para auditoria quando a
--    data-base é recalculada pela nota fiscal.
-- ---------------------------------------------------------------------
create table if not exists public.purchase_installments (
  id uuid not null default gen_random_uuid() primary key,
  request_id uuid not null references public.purchase_requests(id) on delete cascade,

  installment_number integer not null,
  installment_count integer not null,
  amount numeric(14,2) not null,
  due_date date not null,
  offset_days integer not null,

  base_date date not null,
  base_date_source text not null default 'aprovacao_valor',

  status public.installment_status not null default 'previsto',
  payment_terms_label text not null default '',

  -- projeção original (congelada)
  origin_amount numeric(14,2) not null,
  origin_due_date date not null,
  origin_base_date date not null,
  origin_base_date_source text not null,
  origin_created_at timestamptz not null default now(),

  paid_at timestamptz,
  paid_amount numeric(14,2),
  cancelled_at timestamptz,
  divergence_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint purchase_installments_request_number_key unique (request_id, installment_number),
  constraint purchase_installments_number_range check (installment_number >= 1 and installment_number <= installment_count),
  constraint purchase_installments_base_source check (
    base_date_source in ('aprovacao_valor', 'nota_fiscal', 'comprado_provisorio', 'backfill')
  ),
  constraint purchase_installments_origin_base_source check (
    origin_base_date_source in ('aprovacao_valor', 'nota_fiscal', 'comprado_provisorio', 'backfill')
  )
);

create index if not exists idx_pi_request on public.purchase_installments (request_id);
create index if not exists idx_pi_due_date on public.purchase_installments (due_date);
create index if not exists idx_pi_status on public.purchase_installments (status);
create index if not exists idx_pi_status_due on public.purchase_installments (status, due_date);

-- updated_at sempre fresco, mesmo em escrita direta via SQL
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_pi_updated_at on public.purchase_installments;
create trigger trg_pi_updated_at
  before update on public.purchase_installments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 5. RLS
--
--    Leitura e escrita para qualquer usuário autenticado, na mesma
--    postura das demais tabelas do projeto. Isso é necessário porque não
--    existe backend: é o navegador do COMPRADOR que atualiza as parcelas
--    quando o card entra em "Comprado".
--
--    A restrição "comprador não vê a projeção consolidada" é aplicada na
--    interface (item de menu, rota e card do Dashboard). Ela NÃO é
--    garantida no banco — quem souber usar o console do navegador
--    consegue ler a tabela. Fechar isso de verdade exige mover a escrita
--    para uma Edge Function e restringir o SELECT aos papéis
--    admin/gestor/financeiro.
--
--    DELETE fica restrito: o cancelamento é feito por status, jamais
--    apagando linha, para preservar a trilha de auditoria.
-- ---------------------------------------------------------------------
alter table public.purchase_installments enable row level security;

do $$ begin
  create policy "authenticated read purchase_installments" on public.purchase_installments
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "authenticated insert purchase_installments" on public.purchase_installments
    for insert to authenticated with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "authenticated update purchase_installments" on public.purchase_installments
    for update to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "finance delete purchase_installments" on public.purchase_installments
    for delete to authenticated
    using (public.has_role('admin') or public.has_role('financeiro'));
exception when duplicate_object then null; end $$;
