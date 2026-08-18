-- =====================================================================
-- COMPRAS LEÃO — Migration 004 (UP)
-- Estende o cadeado de admin/gestor (introduzido na migration 002) para
-- módulos de configuração que alteram parâmetros operacionais globais —
-- numeração/SLA de compras, avaliação de fornecedores, projeção
-- financeira e canais de notificação — hoje editáveis por qualquer papel
-- autenticado.
--
-- IMPORTANTE: aplicar esta migration ANTES (ou junto) do deploy do front
-- que passa a marcar esses módulos como "critical" em SECTIONS
-- (src/pages/SettingsPage.tsx). isModuleAllowed nega por padrão quando
-- não há linha em role_permissions — sem este seed, marcar os módulos
-- como critical bloquearia TODOS os papéis, inclusive admin/gestor.
-- =====================================================================

insert into public.role_permissions (role, module, allowed)
select r.role, m.module, (r.role in ('admin', 'gestor'))
from unnest(enum_range(null::public.app_role)) as r(role)
cross join unnest(array['compras', 'fornecedores', 'financeiro', 'notificacoes']) as m(module)
on conflict (role, module) do nothing;
