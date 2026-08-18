import { Status } from '../types';

/** Ordem oficial do fluxo de compras (colunas do Kanban). */
export const STATUS_ORDER: Status[] = [
  'Nova Solicitação',
  'Em Aprovação',
  'Em Cotação',
  'Comprado',
  'Em Rota',
  'Em Serviço',
  'Disponível para Retirada',
  'Finalizado',
];

const SKIPPABLE_STATUSES: Status[] = ['Em Rota', 'Em Serviço'];

/**
 * Calcula o próximo status "aplicável" ao pular uma sequência contígua de
 * etapas opcionais (Em Rota / Em Serviço) a partir do status atual — pode
 * pular mais de uma casa numa única ação (ex.: Comprado → Disponível para
 * Retirada quando nem rota nem serviço se aplicam a este pedido).
 * Devolve `null` quando não há nada pulável dali.
 */
export function computeSkipTarget(status: Status): { skipped: Status[]; nextStatus: Status } | null {
  const idx = STATUS_ORDER.indexOf(status);
  if (idx === -1) return null;
  const skipped: Status[] = [];
  let i = idx + 1;
  while (i < STATUS_ORDER.length - 1 && SKIPPABLE_STATUSES.includes(STATUS_ORDER[i])) {
    skipped.push(STATUS_ORDER[i]);
    i += 1;
  }
  if (skipped.length === 0) return null;
  return { skipped, nextStatus: STATUS_ORDER[i] };
}
