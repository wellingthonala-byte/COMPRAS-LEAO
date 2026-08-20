-- =====================================================================
-- COMPRAS LEÃO — Migration 006 (DOWN)
-- Reversão do seed de permissões para geral/identidade/aprovacao/
-- personalizacao. Remove só as linhas desses módulos — se o front voltar
-- a não marcar esses módulos como critical, as linhas ficam sem efeito
-- prático.
-- =====================================================================

delete from public.role_permissions
where module in ('geral', 'identidade', 'aprovacao', 'personalizacao');
