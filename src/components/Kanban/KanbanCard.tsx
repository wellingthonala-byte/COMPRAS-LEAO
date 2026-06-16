import { Calendar, Package, Building2 } from 'lucide-react';
import { PurchaseRequest } from '../../types';
import { Avatar } from '../UI/Avatar';
import { PriorityBadge } from '../UI/Badge';

interface KanbanCardProps {
  request: PurchaseRequest;
  onClick: () => void;
}

const priorityBorderColor: Record<string, string> = {
  'Máquina Parada': 'border-l-red-500',
  'Urgente': 'border-l-orange-400',
  'Não Urgente': 'border-l-blue-400',
};

export function KanbanCard({ request, onClick }: KanbanCardProps) {
  const borderColor = priorityBorderColor[request.priority];
  const isOverdue = new Date(request.deliveryForecast) < new Date() && request.status !== 'Finalizado';
  const dateFormatted = new Date(request.deliveryForecast + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-slate-200 border-l-4 ${borderColor} p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <PriorityBadge priority={request.priority} />
        <span className="text-xs font-bold text-slate-400 group-hover:text-violet-600 transition-colors">
          {request.number}
        </span>
      </div>

      <p className="text-sm font-semibold text-slate-800 mb-1 line-clamp-2">
        {request.items[0]?.description}
      </p>
      {request.items.length > 1 && (
        <p className="text-xs text-slate-400 mb-3">+{request.items.length - 1} item(s)</p>
      )}

      <div className="flex items-center gap-1.5 mb-3">
        <Building2 size={12} className="text-slate-300" />
        <span className="text-xs text-slate-500">{request.sector}</span>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <Avatar initials={request.requesterInitials} color={request.requesterColor} size="sm" />
          <span className="text-xs text-slate-600 font-medium">{request.requester.split(' ')[0]}</span>
        </div>

        <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-500' : 'text-slate-400'}`}>
          <Calendar size={11} />
          <span className="text-xs font-medium">{dateFormatted}</span>
        </div>
      </div>

      {request.value !== undefined && (
        <div className="mt-2 pt-2 border-t border-slate-50">
          <div className="flex items-center gap-1">
            <Package size={11} className="text-violet-400" />
            <span className="text-xs font-semibold text-violet-600">
              {request.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
