import { useEffect, useState } from 'react';
import { fetchAppSettings } from './settingsBackend';

const SETTINGS_CACHE_KEY = 'compras-leao-settings';

/**
 * "Aprovação obrigatória" (Configurações › Fluxo de Aprovação). Quando
 * desligada, tanto a aprovação de mérito quanto a de valor deixam de exigir
 * um gestor separado — o próprio comprador pode confirmar as duas (o
 * registro de quem aprovou continua existindo, só a exigência de ser uma
 * segunda pessoa/papel é removida). Autoaprovação do próprio solicitante
 * continua bloqueada de todo modo — isso é controle de fraude, não
 * segregação de papéis.
 */
export function useApprovalSettings(): { aprovacaoObrigatoria: boolean } {
  const [aprovacaoObrigatoria, setAprovacaoObrigatoria] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
      if (raw) {
        const v = JSON.parse(raw)?.approval?.aprovacaoObrigatoria;
        if (typeof v === 'boolean') return v;
      }
    } catch { /* cache corrompido: assume o padrão (obrigatória) */ }
    return true;
  });

  useEffect(() => {
    let cancelled = false;
    fetchAppSettings()
      .then((remote) => {
        if (cancelled || !remote) return;
        const v = (remote as { approval?: { aprovacaoObrigatoria?: boolean } }).approval?.aprovacaoObrigatoria;
        if (typeof v === 'boolean') setAprovacaoObrigatoria(v);
      })
      .catch(() => { /* offline/sem sessão: mantém o que já está pintado */ });
    return () => { cancelled = true; };
  }, []);

  return { aprovacaoObrigatoria };
}
