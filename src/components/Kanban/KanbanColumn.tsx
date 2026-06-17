import { Plus } from 'lucide-react';
import { PurchaseRequest, Status } from '../../types';
import { KanbanCard } from './KanbanCard';

const columnColors: Record<Status, string> = {
  'Nova Solicitação': 'bg-slate-500',
  'Em Aprovação': 'bg-yellow-500',
  'Em Cotação': 'bg-violet-500',
  'Comprado': 'bg-sky-500',
  'Em Rota': 'bg-indigo-500',
  'Em Serviço': 'bg-purple-500',
  'Disponível para Retirada': 'bg-teal-500',
  'Finalizado': 'bg-emerald-500',
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
};

interface KanbanColumnProps {
  status: Status;
  requests: PurchaseRequest[];
  onCardClick: (id: string) => void;
}

export function KanbanColumn({ status, requests, onCardClick }: KanbanColumnProps) {
  const dotColor = columnColors[status];
  const bgColor = columnBg[status];

  return (
    <div className={`flex-shrink-0 w-72 flex flex-col rounded-2xl ${bgColor} border border-slate-200`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
          <span className="text-sm font-semibold text-slate-700">{status}</span>
          <span className="bg-white text-slate-500 text-xs font-bold px-2 py-0.5 rounded-full border border-slate-200">
            {requests.length}
          </span>
        </div>
        <button className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-violet-600 hover:bg-white transition-colors">
          <Plus size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 max-h-[calc(100vh-13rem)]">
        {requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-300">
            <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center mb-2">
              <Plus size={18} className="text-slate-300" />
            </div>
            <p className="text-xs">Nenhuma solicitação</p>
          </div>
        ) : (
          requests.map((req) => (
            <KanbanCard key={req.id} request={req} onClick={() => onCardClick(req.id)} />
          ))
        )}
      </div>
    </div>
  );
}
