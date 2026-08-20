-- =====================================================================
-- COMPRAS LEÃO — Migration 006 (UP)
-- Fecha o achado da auditoria: as abas "Fluxo de Aprovação", "Geral"
-- (dados da empresa/CNPJ), "Identidade Visual" e "Personalização" estavam
-- abertas a QUALQUER usuário logado — inclusive solicitante, que podia
-- desligar "Aprovação obrigatória", mexer na alçada de valor por setor e
-- trocar CNPJ/branding da empresa.
--
-- O front (src/pages/SettingsPage.tsx) já foi atualizado para marcar esses
-- 4 módulos como `critical: true` (mesmo mecanismo de cadeado usado pela
-- migration 004 em compras/fornecedores/financeiro/notificacoes) — mas
-- isModuleAllowed nega por padrão quando não há linha em role_permissions,
-- então SEM este seed a mudança trancaria as 4 abas até para admin/gestor.
-- Aplicar esta migration ANTES (ou junto) do deploy do front que já marca
-- esses módulos como critical.
--
-- Aplicar no SQL Editor do Supabase. Idempotente. Reversão: 006_down.
-- =====================================================================

insert into public.role_permissions (role, module, allowed)
select r.role, m.module, (r.role in ('admin', 'gestor'))
from unnest(enum_range(null::public.app_role)) as r(role)
cross join unnest(array['geral', 'identidade', 'aprovacao', 'personalizacao']) as m(module)
on conflict (role, module) do nothing;
