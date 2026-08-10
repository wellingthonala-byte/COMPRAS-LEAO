import { buildHolidaySet } from './finance';

/* ====================================================================
   Configuração do módulo financeiro.

   Lê o mesmo `compras-leao-settings` da tela de Configurações, de forma
   defensiva e com padrão — mesma abordagem de utils/notify.ts, para não
   acoplar este módulo ao tipo interno do SettingsPage.
   ==================================================================== */

const SETTINGS_KEY = 'compras-leao-settings';

export interface FinanceSettings {
  /** Dias após a aprovação de valor sem entrar em "Comprado" que disparam alerta. */
  limboDays: number;
  /** Feriados municipais/regionais no formato YYYY-MM-DD. */
  extraHolidays: string[];
  /** Condição assumida pelo backfill quando o pedido antigo não tem condição. */
  backfillTermsId: string;
  /** Alerta de limbo por ntfy ligado. */
  limboAlertEnabled: boolean;
}

export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  limboDays: 7,
  extraHolidays: [],
  backfillTermsId: '30',
  limboAlertEnabled: true,
};

export function getFinanceSettings(): FinanceSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_FINANCE_SETTINGS;
    const f = JSON.parse(raw)?.finance;
    if (!f || typeof f !== 'object') return DEFAULT_FINANCE_SETTINGS;
    const limboDays = Number(f.limboDays);
    return {
      limboDays: Number.isFinite(limboDays) && limboDays > 0 ? Math.floor(limboDays) : DEFAULT_FINANCE_SETTINGS.limboDays,
      extraHolidays: Array.isArray(f.extraHolidays) ? f.extraHolidays.filter((d: unknown) => typeof d === 'string') : [],
      backfillTermsId: typeof f.backfillTermsId === 'string' && f.backfillTermsId ? f.backfillTermsId : DEFAULT_FINANCE_SETTINGS.backfillTermsId,
      limboAlertEnabled: typeof f.limboAlertEnabled === 'boolean' ? f.limboAlertEnabled : DEFAULT_FINANCE_SETTINGS.limboAlertEnabled,
    };
  } catch {
    return DEFAULT_FINANCE_SETTINGS;
  }
}

/**
 * Feriados de uma janela ampla ao redor de hoje: parcelas de 180 dias já
 * atravessam o ano, e o backfill olha para trás.
 */
export function getHolidaySet(extraHolidays?: string[]): Set<string> {
  const year = new Date().getUTCFullYear();
  const extra = extraHolidays ?? getFinanceSettings().extraHolidays;
  return buildHolidaySet(year - 2, year + 3, extra);
}
