import { X, ChevronRight, Edit3, ArrowRight, Clock, User, Building2, Calendar, Package, FileText, Truck } from 'lucide-react';
import { PurchaseRequest, Status } from '../../types';
import { PriorityBadge, StatusBadge } from '../UI/Badge';
import { Avatar } from '../UI/Avatar';
import { STATUS_ORDER } from '../../data/mockData';

interface RequestDetailModalProps {
  request: PurchaseRequest;
  onClose: () => void;
  onAdvanceStatus: (id: string) => void;
  onEdit: () => void;
}

const statusIcons: Partial<Record<Status, React.ReactNode>> = {
  'Nova Solicitação': <FileText size={14} />,
  'Em Aprovação': <Clock size={14} />,
  'Em Cotação': <Package size={14} />,
  'Comprado': <Package size={14} />,
  'Em Rota': <Truck size={14} />,
  'Em Serviço': <Edit3 size={14} />,
  'Disponível p/ Retirada': <ChevronRight size={14} />,
  'Finalizado': <ChevronRight size={14} />,
};

export function RequestDetailModal({ request, onClose, onAdvanceStatus, onEdit }: RequestDetailModalProps) {
  const currentIdx = STATUS_ORDER.indexOf(request.status);
  const canAdvance = currentIdx < STATUS_ORDER.length - 1;

  const formatDate = (dateStr: string) =>
    new Date(dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00').toLocaleDateString('pt-BR');
  const formatDateTime = (dateStr: string) =>
    new Date(dateStr).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-800">Solicitação {request.number}</h2>
                <PriorityBadge priority={request.priority} />
                <StatusBadge status={request.status} />
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Criada em {formatDateTime(request.createdAt)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>

        {/* Timeline */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 overflow-x-auto">
          <div className="flex items-center gap-0 min-w-max">
            {STATUS_ORDER.map((s, i) => {
              const isCompleted = i < currentIdx;
              const isCurrent = i === currentIdx;
              return (
                <div key={s} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs border-2 transition-all ${
                      isCurrent ? 'border-violet-600 bg-violet-600 text-white' :
                      isCompleted ? 'border-emerald-500 bg-emerald-500 text-white' :
                      'border-slate-300 bg-white text-slate-300'
                    }`}>
                      {statusIcons[s] || i + 1}
                    </div>
                    <span className={`text-[10px] mt-1 text-center max-w-[64px] leading-tight font-medium ${
                      isCurrent ? 'text-violet-700' : isCompleted ? 'text-emerald-600' : 'text-slate-400'
                    }`}>{s}</span>
                  </div>
                  {i < STATUS_ORDER.length - 1 && (
                    <div className={`w-8 h-0.5 mb-4 ${i < currentIdx ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Dados Gerais + Fornecedor */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <div className="flex items-center gap-2 mb-3">
                <User size={14} className="text-violet-600" />
                <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Dados Gerais</h3>
              </div>
              <div className="space-y-2.5">
                <div>
                  <p className="text-xs text-slate-400">Solicitante</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Avatar initials={request.requesterInitials} color={request.requesterColor} size="sm" />
                    <p className="text-sm font-medium text-slate-800">{request.requester}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-slate-400">Setor</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Building2 size={11} className="text-slate-400" />
                      <p className="text-sm text-slate-700">{request.sector}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Prioridade</p>
                    <div className="mt-0.5"><PriorityBadge priority={request.priority} /></div>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Data da Solicitação</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Calendar size={11} className="text-slate-400" />
                    <p className="text-sm text-slate-700">{formatDate(request.createdAt)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Truck size={14} className="text-violet-600" />
                  <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Fornecedor</h3>
                </div>
                <button onClick={onEdit} className="text-xs text-violet-600 hover:text-violet-800 font-medium flex items-center gap-1 transition-colors">
                  <Edit3 size={11} /> Editar
                </button>
              </div>
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-slate-400">Fornecedor</p>
                    <p className="text-sm text-slate-700 mt-0.5">{request.supplier || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Valor</p>
                    <p className="text-sm font-semibold text-violet-700 mt-0.5">
                      {request.value !== undefined ? request.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-slate-400">Nº do Pedido</p>
                    <p className="text-sm text-slate-700 mt-0.5">{request.orderNumber || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Nota Fiscal</p>
                    <p className="text-sm text-slate-700 mt-0.5">{request.fiscalNote || '-'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-slate-400">Previsão de Entrega</p>
                    <p className="text-sm text-slate-700 mt-0.5">{formatDate(request.deliveryForecast)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Entrega Real</p>
                    <p className="text-sm text-slate-700 mt-0.5">{request.realDeliveryDate ? formatDate(request.realDeliveryDate) : '-'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Itens */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Package size={14} className="text-violet-600" />
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Itens da Solicitação ({request.items.length})
              </h3>
            </div>
            <div className="space-y-2">
              {request.items.map((item, i) => (
                <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-slate-400 font-medium">Item {i + 1}</span>
                        <PriorityBadge priority={item.priority} />
                      </div>
                      <p className="font-semibold text-slate-800 text-sm">{item.description}</p>
                      <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>Aplicação: <strong className="text-slate-700">{item.application}</strong></span>
                        <span>Previsão: <strong className="text-slate-700">{formatDate(item.deliveryForecast)}</strong></span>
                        {item.technicalSpec && <span className="col-span-2">Especificação: <strong className="text-slate-700">{item.technicalSpec}</strong></span>}
                        {item.observations && <span className="col-span-2">Obs: <em className="text-slate-600">{item.observations}</em></span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-slate-400">Qtd.</p>
                      <p className="text-lg font-bold text-slate-800">{item.quantity}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Histórico */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} className="text-violet-600" />
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Histórico de Alterações</h3>
            </div>
            <div className="space-y-2">
              {request.history.map((entry) => (
                <div key={entry.id} className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Clock size={10} className="text-violet-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-700">
                      <strong>{entry.user}</strong> — {entry.action}
                      {entry.from && entry.to && (
                        <span className="text-slate-500"> ({entry.from} <ArrowRight size={10} className="inline" /> {entry.to})</span>
                      )}
                      {!entry.from && entry.to && (
                        <span className="text-slate-500"> → {entry.to}</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">{formatDateTime(entry.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium">
            Fechar
          </button>
          {canAdvance && (
            <button
              onClick={() => onAdvanceStatus(request.id)}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm shadow-violet-200"
            >
              <ArrowRight size={15} />
              Avançar para {STATUS_ORDER[currentIdx + 1]}
            </button>
          )}
          {!canAdvance && (
            <span className="flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-lg text-sm font-medium">
              ✓ Solicitação Finalizada
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
