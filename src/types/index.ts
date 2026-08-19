import { PaymentTerms, ValueApproval } from './finance';

export type Priority = 'Não Urgente' | 'Urgente' | 'Máquina Parada';
export type Status = 'Nova Solicitação' | 'Em Aprovação' | 'Em Cotação' | 'Comprado' | 'Em Rota' | 'Em Serviço' | 'Disponível para Retirada' | 'Finalizado' | 'Cancelada';
export type Sector = 'Produção' | 'Manutenção' | 'Administrativo' | 'TI' | 'RH' | 'Logística';

export interface Item {
  id: string;
  description: string;
  quantity: number;
  /** Unidade de medida (UN, CX, KG, L, ML etc.) — opcional para não quebrar itens antigos. */
  unit?: string;
  application: string;
  priority: Priority;
  deliveryForecast: string;
  technicalSpec?: string;
  observations?: string;
  objections?: Objection[];
  /** Link do produto/serviço específico deste item (fornecedor, referência etc.). */
  link?: string;
}

export interface PurchaseRequest {
  id: string;
  number: string;
  requester: string;
  requesterInitials: string;
  sector: Sector;
  priority: Priority;
  status: Status;
  createdAt: string;
  deliveryForecast: string;
  realDeliveryDate?: string;
  supplier?: string;
  value?: number;
  orderNumber?: string;
  fiscalNote?: string;
  /** Data de emissão da nota fiscal (YYYY-MM-DD) — data-base definitiva do parcelamento. */
  fiscalNoteDate?: string;
  /** Condição de pagamento definida pelo comprador na cotação. */
  paymentTerms?: PaymentTerms;
  items: Item[];
  observations?: string;
  objectLink?: string;
  history: HistoryEntry[];
  approvedBy?: string;
  approvalId?: string;
  approvedAt?: string;
  /**
   * Segunda aprovação: o gestor aprova o VALOR cotado. É aqui que nasce o
   * compromisso financeiro — a aprovação acima (approvedBy) é de mérito e
   * acontece antes da cotação, quando o valor ainda não existe.
   */
  valueApproval?: ValueApproval;
  cancelledBy?: string;
  cancelledAt?: string;
  cancelReason?: string;
}

export interface Objection {
  id: string;
  date: string;
  user: string;
  text: string;
  resolved: boolean;
  response?: string;
  respondedBy?: string;
  respondedAt?: string;
}

export interface HistoryEntry {
  id: string;
  date: string;
  user: string;
  action: string;
  from?: Status;
  to?: Status;
}

export interface Notification {
  id: string;
  date: string;
  message: string;
  requestNumber: string;
  read: boolean;
}
