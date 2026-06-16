export type Priority = 'Não Urgente' | 'Urgente' | 'Máquina Parada';

export type Status =
  | 'Nova Solicitação'
  | 'Em Aprovação'
  | 'Em Cotação'
  | 'Comprado'
  | 'Em Rota'
  | 'Em Serviço'
  | 'Disponível p/ Retirada'
  | 'Finalizado';

export type Sector =
  | 'Produção'
  | 'Manutenção'
  | 'Administrativo'
  | 'TI'
  | 'RH'
  | 'Logística';

export interface Item {
  id: string;
  description: string;
  quantity: number;
  application: string;
  priority: Priority;
  deliveryForecast: string;
  technicalSpec?: string;
  observations?: string;
}

export interface HistoryEntry {
  id: string;
  date: string;
  user: string;
  action: string;
  from?: string;
  to?: string;
}

export interface PurchaseRequest {
  id: string;
  number: string;
  requester: string;
  requesterInitials: string;
  requesterColor: string;
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
  history: HistoryEntry[];
}
