-- =====================================================================
-- COMPRAS LEÃO — Migration 004 (DOWN)
-- Reversão do seed de permissões para compras/fornecedores/financeiro/
-- notificacoes. Remove só as linhas desses módulos (a tabela
-- role_permissions em si foi criada na migration 002 e não é tocada
-- aqui) — se o front voltar a não marcar esses módulos como critical,
-- as linhas ficam sem efeito prático.
-- =====================================================================

delete from public.role_permissions
where module in ('compras', 'fornecedores', 'financeiro', 'notificacoes');
