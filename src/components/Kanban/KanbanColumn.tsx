import { PurchaseRequest, Status } from '../../types';
import { KanbanCard } from './KanbanCard';
import { KanbanColumnShell } from './KanbanColumnShell';

const columnColors: Record<Status, string> = {
  'Nova Solicitação': 'bg-slate-500',
  'Em Aprovação': 'bg-yellow-500',
  'Em Cotação': 'bg-violet-500',
  'Comprado': 'bg-sky-500',
  'Em Rota': 'bg-indigo-500',
  'Em Serviço': 'bg-purple-500',
  'Disponível para Retirada': 'bg-teal-500',
  'Finalizado': 'bg-emerald-500',
  'Cancelada': 'bg-red-400',
};

const columnBg: Record<Status, string> = {
  'Nova Solicitação': 'bg-slate-50',
  'Em Aprovação': 'bg-yellow-50',
  'Em Cotação': 'bg-violet-50',
  'Comprado': 'bg-sky-50',
  'Em Rota': 'bg-indigo-50',
  'Em Serviço': 'bg-purple-50',
  'Disponível para Retirada': 'bg-teal-50',
  'Finalizado': 'bg-emerald-50',
  'Cancelada': 'bg-red-50/50',
};

interface KanbanColumnProps {
  status: Status;
  requests: PurchaseRequest[];
  onCardClick: (id: string) => void;
}

export function KanbanColumn({ status, requests, onCardClick }: KanbanColumnProps) {
  return (
    <KanbanColumnShell label={status} count={requests.length} dotClass={columnColors[status]} bgClass={columnBg[status]}>
      {requests.map((req) => (
        <KanbanCard key={req.id} request={req} onClick={() => onCardClick(req.id)} />
      ))}
    </KanbanColumnShell>
  );
}
