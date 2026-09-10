import { useEffect, useState } from 'react';
import { fetchAppSettings } from './settingsBackend';

const SETTINGS_CACHE_KEY = 'compras-leao-settings';

export interface PurchasingOptions {
  categorias: string[];
  centrosCusto: string[];
  tiposSolicitacao: string[];
  /** Clientes de O.S. cadastrados pelo comprador — lista fixa, não texto livre. */
  clientesOS: string[];
}

/** Usado só enquanto nada carregou ainda (cache vazio e Supabase não respondeu). */
const FALLBACK: PurchasingOptions = {
  categorias: ['Manutenção Geral', 'Produção', 'EPI', 'Escritório', 'TI', 'Logística'],
  centrosCusto: ['Produção', 'Manutenção', 'Administrativo', 'TI', 'RH', 'Logística'],
  tiposSolicitacao: ['Material', 'Serviço'],
  clientesOS: [],
};

function readCache(): PurchasingOptions {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (raw) {
      const p = JSON.parse(raw)?.purchasing ?? {};
      return {
        categorias: Array.isArray(p.categorias) ? p.categorias : FALLBACK.categorias,
        centrosCusto: Array.isArray(p.centrosCusto) ? p.centrosCusto : FALLBACK.centrosCusto,
        tiposSolicitacao: Array.isArray(p.tiposSolicitacao) ? p.tiposSolicitacao : FALLBACK.tiposSolicitacao,
        clientesOS: Array.isArray(p.clientesOS) ? p.clientesOS : FALLBACK.clientesOS,
      };
    }
  } catch { /* cache corrompido: usa padrão */ }
  return FALLBACK;
}

/**
 * Categorias, centros de custo (setores) e tipos de solicitação cadastrados
 * em Configurações › Compras › "Listas do Processo" — para os formulários e
 * filtros que precisam dessas opções fora da própria tela de Configurações.
 * Antes disso, cada tela tinha sua própria lista fixa no código-fonte,
 * então cadastrar um item novo em Configurações não tinha efeito nenhum em
 * lugar nenhum do sistema (ele salvava, mas nada além da própria tela de
 * Configurações lia o valor salvo).
 */
export function usePurchasingOptions(): PurchasingOptions {
  const [options, setOptions] = useState<PurchasingOptions>(readCache);

  useEffect(() => {
    let cancelled = false;
    fetchAppSettings()
      .then((remote) => {
        if (cancelled || !remote) return;
        const p = (remote as { purchasing?: Partial<PurchasingOptions> }).purchasing ?? {};
        setOptions({
          categorias: Array.isArray(p.categorias) ? p.categorias : FALLBACK.categorias,
          centrosCusto: Array.isArray(p.centrosCusto) ? p.centrosCusto : FALLBACK.centrosCusto,
          tiposSolicitacao: Array.isArray(p.tiposSolicitacao) ? p.tiposSolicitacao : FALLBACK.tiposSolicitacao,
          clientesOS: Array.isArray(p.clientesOS) ? p.clientesOS : FALLBACK.clientesOS,
        });
      })
      .catch(() => { /* offline/sem sessão: mantém o que já está pintado */ });
    return () => { cancelled = true; };
  }, []);

  return options;
}
