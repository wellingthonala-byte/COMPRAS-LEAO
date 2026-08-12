-- =====================================================================
-- COMPRAS LEÃO — Migration 003 (DOWN)
-- Reversão do bucket de logo (branding).
-- =====================================================================

drop policy if exists "public read branding" on storage.objects;
drop policy if exists "admin write branding" on storage.objects;
drop policy if exists "admin update branding" on storage.objects;
drop policy if exists "admin delete branding" on storage.objects;

delete from storage.objects where bucket_id = 'branding';
delete from storage.buckets where id = 'branding';
