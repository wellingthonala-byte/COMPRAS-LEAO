/** Unidades de medida disponíveis para os itens de uma solicitação de compra. */
export const UNITS = [
  'UN', 'CX', 'PCT', 'KIT', 'PAR', 'ROLO', 'SC',
  'KG', 'G', 'TON',
  'L', 'ML',
  'M', 'CM', 'M²', 'M³',
] as const;

export const DEFAULT_UNIT = 'UN';

/**
 * OSMaterial.unit (src/types/serviceOrders.ts) usa uma lista de abreviações
 * própria do módulo de O.S. ('un', 'pç', 'kg' ...), diferente de UNITS acima.
 * Esta função traduz o valor de O.S. para o mais próximo em UNITS antes de
 * copiá-lo para Item.unit, evitando que a solicitação de compra gerada perca
 * a unidade original (ex.: "10 L" virando "10 UN" — ver handleRequestParts).
 */
const OS_UNIT_MAP: Record<string, (typeof UNITS)[number]> = {
  un: 'UN', unid: 'UN', unidade: 'UN',
  pç: 'UN', pc: 'UN', peça: 'UN', peca: 'UN',
  cx: 'CX', caixa: 'CX',
  kg: 'KG',
  g: 'G',
  l: 'L',
  ml: 'ML',
  m: 'M',
  cm: 'CM',
};

export function normalizeOsUnit(u: string | undefined | null): string {
  if (!u) return DEFAULT_UNIT;
  const key = u.trim().toLowerCase();
  return OS_UNIT_MAP[key] ?? DEFAULT_UNIT;
}
