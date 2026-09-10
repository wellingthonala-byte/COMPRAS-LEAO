import { PaymentTerms } from '../types/finance';

/* ====================================================================
   Condição de pagamento: presets, rótulo legível e normalização.

   Só a aritmética de datas/valores fica em finance.ts. Aqui é apenas a
   tradução entre o que o comprador escolhe na cotação e a lista de dias
   que o cálculo consome.
   ==================================================================== */

export interface PaymentTermsPreset {
  id: string;
  label: string;
  terms: PaymentTerms;
}

/** Presets oferecidos ao comprador. Cobrem o que a Leão usa hoje. */
export const PAYMENT_TERMS_PRESETS: PaymentTermsPreset[] = [
  { id: 'avista', label: 'À vista', terms: { kind: 'avista', days: [0] } },
  { id: '7', label: '7 dias', terms: { kind: 'dias', days: [7] } },
  { id: '14', label: '14 dias', terms: { kind: 'dias', days: [14] } },
  { id: '21', label: '21 dias', terms: { kind: 'dias', days: [21] } },
  { id: '28', label: '28 dias', terms: { kind: 'dias', days: [28] } },
  { id: '30', label: '30 dias', terms: { kind: 'dias', days: [30] } },
  { id: '45', label: '45 dias', terms: { kind: 'dias', days: [45] } },
  { id: '60', label: '60 dias', terms: { kind: 'dias', days: [60] } },
  { id: '30/60', label: '30/60', terms: { kind: 'dias', days: [30, 60] } },
  { id: '30/60/90', label: '30/60/90', terms: { kind: 'dias', days: [30, 60, 90] } },
  { id: '30/60/90/120', label: '30/60/90/120', terms: { kind: 'dias', days: [30, 60, 90, 120] } },
  { id: '2x', label: '2x sem entrada (30 em 30)', terms: { kind: 'parcelas', days: [30, 60], count: 2, intervalDays: 30 } },
  { id: '3x', label: '3x sem entrada (30 em 30)', terms: { kind: 'parcelas', days: [30, 60, 90], count: 3, intervalDays: 30 } },
  { id: '4x', label: '4x sem entrada (30 em 30)', terms: { kind: 'parcelas', days: [30, 60, 90, 120], count: 4, intervalDays: 30 } },
  { id: '6x', label: '6x sem entrada (30 em 30)', terms: { kind: 'parcelas', days: [30, 60, 90, 120, 150, 180], count: 6, intervalDays: 30 } },
  { id: '2x-entrada', label: '2x com entrada', terms: { kind: 'parcelas', days: [0, 30], count: 2, intervalDays: 30, hasEntry: true } },
  { id: '3x-entrada', label: '3x com entrada', terms: { kind: 'parcelas', days: [0, 30, 60], count: 3, intervalDays: 30, hasEntry: true } },
];

/**
 * Monta a condição de um parcelamento regular.
 * Com entrada, a primeira parcela vence em D+0 e as demais a cada intervalo.
 */
export function buildInstallmentTerms(count: number, intervalDays: number, hasEntry: boolean): PaymentTerms {
  const n = Math.max(1, Math.floor(count));
  const step = Math.max(1, Math.floor(intervalDays));
  const days = Array.from({ length: n }, (_, i) => (hasEntry ? i * step : (i + 1) * step));
  return { kind: 'parcelas', days, count: n, intervalDays: step, hasEntry };
}

/** Condição a partir de uma lista de dias digitada à mão, ex.: "30, 45, 75". */
export function parseCustomDays(input: string): PaymentTerms | null {
  const days = normalizeDays(
    input.split(/[^\d-]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n) && n >= 0)
  );
  if (days.length === 0) return null;
  return { kind: days.length === 1 && days[0] === 0 ? 'avista' : 'dias', days };
}

/** Ordena, remove repetições e descarta valores inválidos. */
export function normalizeDays(days: number[]): number[] {
  const clean = days
    .map((d) => Math.floor(d))
    .filter((d) => Number.isFinite(d) && d >= 0);
  return [...new Set(clean)].sort((a, b) => a - b);
}

/** Rótulo legível — usado no card, no painel financeiro e no PDF do pedido. */
export function formatPaymentTerms(terms: PaymentTerms | undefined): string {
  if (!terms || terms.days.length === 0) return '';
  const days = normalizeDays(terms.days);
  if (days.length === 1 && days[0] === 0) return 'À vista';
  if (days.length === 1) return `${days[0]} dias`;

  const regular = terms.kind === 'parcelas' && terms.intervalDays
    ? `${days.length}x`
    : null;
  const sequence = days.join('/');
  if (regular) {
    const entry = terms.hasEntry || days[0] === 0 ? ' com entrada' : '';
    return `${regular}${entry} — ${sequence}`;
  }
  return sequence;
}

/** Reconhece qual preset corresponde a uma condição já gravada. */
export function findPresetId(terms: PaymentTerms | undefined): string | null {
  if (!terms) return null;
  const key = normalizeDays(terms.days).join(',');
  const hit = PAYMENT_TERMS_PRESETS.find((p) => normalizeDays(p.terms.days).join(',') === key);
  return hit?.id ?? null;
}

/** A condição está utilizável pelo cálculo? */
export function isPaymentTermsValid(terms: PaymentTerms | undefined): terms is PaymentTerms {
  return !!terms && Array.isArray(terms.days) && normalizeDays(terms.days).length > 0;
}

/**
 * Compara por CONTEÚDO, não por referência. O seletor de condição de
 * pagamento sempre cria um objeto novo — até ao reselecionar o mesmo preset
 * — então `a !== b` dá falso positivo de "mudou" mesmo sem alteração real,
 * o que já chegou a invalidar (e cancelar parcelas de) uma aprovação de
 * valor sem que a condição tivesse de fato mudado.
 */
export function paymentTermsEqual(a: PaymentTerms | undefined, b: PaymentTerms | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.kind === b.kind &&
    normalizeDays(a.days).join(',') === normalizeDays(b.days).join(',') &&
    (a.count ?? null) === (b.count ?? null) &&
    (a.intervalDays ?? null) === (b.intervalDays ?? null) &&
    !!a.hasEntry === !!b.hasEntry
  );
}
