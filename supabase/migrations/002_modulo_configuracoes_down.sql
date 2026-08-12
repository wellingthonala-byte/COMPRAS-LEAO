-- =====================================================================
-- COMPRAS LEÃO — Migration 002 (DOWN)
-- Reversão do módulo de Configurações (app_settings + role_permissions).
-- =====================================================================

drop trigger if exists trg_role_permissions_updated_at on public.role_permissions;
drop trigger if exists trg_app_settings_updated_at on public.app_settings;

drop table if exists public.role_permissions;
drop table if exists public.app_settings;
