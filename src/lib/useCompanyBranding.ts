import { useEffect, useState } from 'react';
import { fetchAppSettings } from './settingsBackend';

const SETTINGS_CACHE_KEY = 'compras-leao-settings';

export interface CompanyBranding {
  nome: string;
  logoUrl: string;
}

function readCache(): CompanyBranding {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw)?.company ?? {};
      return { nome: c.nome || 'Compras Leão', logoUrl: c.logoUrl || '' };
    }
  } catch { /* cache corrompido: usa padrão */ }
  return { nome: 'Compras Leão', logoUrl: '' };
}

/**
 * Nome e logo da empresa (Configurações › Geral), para os lugares fora da
 * própria tela de Configurações que precisam exibir a identidade visual
 * (barra lateral, tela de login, documentos impressos). Pinta com o que já
 * estiver em cache local (instantâneo) e atualiza assim que o Supabase
 * responder — sem sessão real (login local/anon), a leitura falha
 * silenciosamente e o valor em cache/padrão é mantido.
 */
export function useCompanyBranding(): CompanyBranding {
  const [branding, setBranding] = useState<CompanyBranding>(readCache);

  useEffect(() => {
    let cancelled = false;
    fetchAppSettings()
      .then((remote) => {
        if (cancelled || !remote) return;
        const c = (remote as { company?: { nome?: string; logoUrl?: string } }).company ?? {};
        setBranding({ nome: c.nome || 'Compras Leão', logoUrl: c.logoUrl || '' });
      })
      .catch(() => { /* offline/sem sessão: mantém o que já está pintado */ });
    return () => { cancelled = true; };
  }, []);

  return branding;
}
