-- =====================================================================
-- COMPRAS LEÃO — Migration 001 (DOWN)
-- Reverte o módulo de Controle Financeiro Futuro.
--
-- ATENÇÃO: apagar a tabela purchase_installments destrói a projeção
-- financeira e a trilha de auditoria das parcelas. Faça backup antes:
--
--   create table public.purchase_installments_backup as
--     select * from public.purchase_installments;
--
-- Nenhuma tabela pré-existente é tocada por este script.
-- =====================================================================

drop trigger if exists trg_pi_updated_at on public.purchase_installments;

drop policy if exists "authenticated read purchase_installments"   on public.purchase_installments;
drop policy if exists "authenticated insert purchase_installments" on public.purchase_installments;
drop policy if exists "authenticated update purchase_installments" on public.purchase_installments;
drop policy if exists "finance delete purchase_installments"       on public.purchase_installments;

drop table if exists public.purchase_installments;

drop type if exists public.installment_status;

-- set_updated_at e has_any_role são genéricas. Só remova se nenhuma outra
-- migration passou a depender delas:
-- drop function if exists public.set_updated_at();
-- drop function if exists public.has_any_role(text[]);

-- O valor 'financeiro' permanece no enum public.app_role: o Postgres não
-- permite remover valor de enum. Isso é inofensivo — para reverter de
-- fato, basta apagar as linhas de user_roles que usam esse papel:
--   delete from public.user_roles where role = 'financeiro';
