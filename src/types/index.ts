export type Priority = 'Não Urgente' | 'Urgente' | 'Máquina Parada';
export type Status = 'Nova Solicitação' | 'Em Aprovação' | 'Em Cotação' | 'Comprado' | 'Em Rota' | 'Em Serviço' | 'Disponível para Retirada' | 'Finalizado' | 'Cancelada';
export type Sector = 'Produção' | 'Manutenção' | 'Administrativo' | 'TI' | 'RH' | 'Logística';

export interface Item {
  id: string;
  description: string;
  quantity: number;
  application: string;
  priority: Priority;
  deliveryForecast: string;
  technicalSpec?: string;
  observations?: string;
  objections?: Objection[];
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
  items: Item[];
  observations?: string;
  objectLink?: string;
  history: HistoryEntry[];
  approvedBy?: string;
  approvalId?: string;
  approvedAt?: string;
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
