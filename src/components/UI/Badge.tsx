import { Priority, Status } from '../../types';

const priorityConfig: Record<Priority, { label: string; className: string }> = {
  'Máquina Parada': { label: 'Máquina Parada', className: 'bg-red-100 text-red-700 border border-red-200' },
  'Urgente': { label: 'Urgente', className: 'bg-orange-100 text-orange-700 border border-orange-200' },
  'Não Urgente': { label: 'Não Urgente', className: 'bg-blue-100 text-blue-700 border border-blue-200' },
};

const statusConfig: Record<Status, { label: string; className: string }> = {
  'Nova Solicitação': { label: 'Nova Solicitação', className: 'bg-slate-100 text-slate-700' },
  'Em Aprovação': { label: 'Em Aprovação', className: 'bg-yellow-100 text-yellow-700' },
  'Em Cotação': { label: 'Em Cotação', className: 'bg-violet-100 text-violet-700' },
  'Comprado': { label: 'Comprado', className: 'bg-sky-100 text-sky-700' },
  'Em Rota': { label: 'Em Rota', className: 'bg-indigo-100 text-indigo-700' },
  'Em Serviço': { label: 'Em Serviço', className: 'bg-purple-100 text-purple-700' },
  'Disponível para Retirada': { label: 'Disponível', className: 'bg-teal-100 text-teal-700' },
  'Finalizado': { label: 'Finalizado', className: 'bg-emerald-100 text-emerald-700' },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const config = priorityConfig[priority];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {priority === 'Máquina Parada' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
      {config.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  const config = statusConfig[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
