import { Calendar, Package, Building2, Target, ShieldCheck } from 'lucide-react';
import { PurchaseRequest } from '../../types';
import { Avatar } from '../UI/Avatar';
import { PriorityBadge } from '../UI/Badge';
import { colorFromInitials } from '../../utils/colors';

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
  const firstItem = request.items[0];
  const isAwaitingApproval = request.status === 'Em Aprovação' && !request.approvedBy;

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-slate-200 border-l-4 ${borderColor} p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group ${isAwaitingApproval ? 'ring-1 ring-yellow-300' : ''}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <PriorityBadge priority={request.priority} />
        <span className="text-xs font-bold text-slate-400 group-hover:text-violet-600 transition-colors">
          {request.number}
        </span>
      </div>

      <p className="text-sm font-semibold text-slate-800 mb-1 line-clamp-2">
        {firstItem?.description}
      </p>
      {request.items.length > 1 && (
        <p className="text-xs text-slate-400 mb-1">+{request.items.length - 1} item(s)</p>
      )}

      {firstItem?.application && (
        <div className="flex items-center gap-1 mb-2 bg-violet-50 rounded-lg px-2 py-1">
          <Target size={11} className="text-violet-500 flex-shrink-0" />
          <span className="text-xs text-violet-700 font-medium truncate">{firstItem.application}</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 mb-2">
        <Building2 size={12} className="text-slate-300" />
        <span className="text-xs text-slate-500">{request.sector}</span>
      </div>

      {isAwaitingApproval && (
        <div className="mb-2 px-2 py-1 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-yellow-700 font-medium">⏳ Aguardando aprovação do gestor</p>
        </div>
      )}

      {request.approvedBy && (
        <div className="mb-2 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-1.5">
          <ShieldCheck size={11} className="text-emerald-600 flex-shrink-0" />
          <div>
            <p className="text-xs text-emerald-700 font-medium">Aprovado por {request.approvedBy}</p>
            {request.approvalId && <p className="text-xs text-emerald-600">ID: {request.approvalId}</p>}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <Avatar initials={request.requesterInitials} color={colorFromInitials(request.requesterInitials)} size="sm" />
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
