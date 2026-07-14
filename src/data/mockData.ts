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
