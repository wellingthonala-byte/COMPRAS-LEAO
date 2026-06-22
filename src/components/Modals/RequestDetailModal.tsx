import { X, ChevronRight, Edit3, ArrowRight, Clock, User, Building2, Calendar, Package, FileText, Truck, ShieldCheck, ShieldAlert, Save, MessageSquarePlus, CheckCheck, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { PurchaseRequest, Status } from '../../types';
import { colorFromInitials } from '../../utils/colors';
import { PriorityBadge, StatusBadge } from '../UI/Badge';
import { Avatar } from '../UI/Avatar';
import { STATUS_ORDER } from '../../data/mockData';

interface RequestDetailModalProps {
  request: PurchaseRequest;
  onClose: () => void;
  onAdvanceStatus: (id: string) => void;
  onApprove: (id: string, approverName: string, approvalId: string) => void;
  onEdit: (id: string, fields: Partial<PurchaseRequest>) => void;
}

const statusIcons: Partial<Record<Status, React.ReactNode>> = {
  'Nova Solicitação': <FileText size={14} />,
  'Em Aprovação': <Clock size={14} />,
  'Em Cotação': <Package size={14} />,
  'Comprado': <Package size={14} />,
  'Em Rota': <Truck size={14} />,
  'Em Serviço': <Edit3 size={14} />,
  'Disponível para Retirada': <ChevronRight size={14} />,
  'Finalizado': <ChevronRight size={14} />,
};

export function RequestDetailModal({ request, onClose, onAdvanceStatus, onApprove, onEdit }: RequestDetailModalProps) {
  const currentIdx = STATUS_ORDER.indexOf(request.status);
  const canAdvance = currentIdx < STATUS_ORDER.length - 1;
  const isApprovalStep = request.status === 'Em Aprovação';
  const isApproved = !!request.approvedBy;

  const [approverName, setApproverName] = useState('');
  const [approvalId, setApprovalId] = useState('');
  const [approvalError, setApprovalError] = useState('');

  const [editingSupplier, setEditingSupplier] = useState(false);
  const [objectionItemId, setObjectionItemId] = useState<string | null>(null);
  const [objectionText, setObjectionText] = useState('');
  const [supplierDraft, setSupplierDraft] = useState({
    supplier: request.supplier || '',
    value: request.value !== undefined ? String(request.value) : '',
    orderNumber: request.orderNumber || '',
    fiscalNote: request.fiscalNote || '',
    deliveryForecast: request.deliveryForecast || '',
    realDeliveryDate: request.realDeliveryDate || '',
  });

  const handleAddObjection = (itemId: string) => {
    if (!objectionText.trim()) return;
    const updatedItems = request.items.map((item) => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        objections: [
          ...(item.objections || []),
          { id: `obj-${Date.now()}`, date: new Date().toISOString(), user: 'Alefy Alves', text: objectionText.trim(), resolved: false },
        ],
      };
    });
    const objectedItem = request.items.find((i) => i.id === itemId);
    onEdit(request.id, {
      items: updatedItems,
      history: [
        ...request.history,
        {
          id: `h-${Date.now()}`,
          date: new Date().toISOString(),
          user: 'Alefy Alves',
          action: `Objeção registrada no item: ${objectedItem?.description || itemId}`,
          to: request.status,
        },
      ],
    });
    setObjectionText('');
    setObjectionItemId(null);
  };

  const handleResolveObjection = (itemId: string, objId: string) => {
    const updatedItems = request.items.map((item) => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        objections: (item.objections || []).map((o) => o.id === objId ? { ...o, resolved: true } : o),
      };
    });
    onEdit(request.id, { items: updatedItems });
  };

  const handleSaveSupplier = () => {
    onEdit(request.id, {
      supplier: supplierDraft.supplier || undefined,
      value: supplierDraft.value ? parseFloat(supplierDraft.value.replace(',', '.')) : undefined,
      orderNumber: supplierDraft.orderNumber || undefined,
      fiscalNote: supplierDraft.fiscalNote || undefined,
      deliveryForecast: supplierDraft.deliveryForecast,
      realDeliveryDate: supplierDraft.realDeliveryDate || undefined,
    });
    setEditingSupplier(false);
  };

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
                    <Avatar initials={request.requesterInitials} color={colorFromInitials(request.requesterInitials)} size="sm" />
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
                {editingSupplier ? (
                  <div className="flex gap-2">
                    <button onClick={() => setEditingSupplier(false)} className="text-xs text-slate-500 hover:text-slate-700 font-medium flex items-center gap-1 transition-colors">
                      <X size={11} /> Cancelar
                    </button>
                    <button onClick={handleSaveSupplier} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium flex items-center gap-1 transition-colors">
                      <Save size={11} /> Salvar
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setEditingSupplier(true)} className="text-xs text-violet-600 hover:text-violet-800 font-medium flex items-center gap-1 transition-colors">
                    <Edit3 size={11} /> Editar
                  </button>
                )}
              </div>
              {editingSupplier ? (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Fornecedor</label>
                      <input value={supplierDraft.supplier} onChange={(e) => setSupplierDraft(d => ({ ...d, supplier: e.target.value }))}
                        placeholder="Nome do fornecedor"
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Valor (R$)</label>
                      <input value={supplierDraft.value} onChange={(e) => setSupplierDraft(d => ({ ...d, value: e.target.value }))}
                        placeholder="0,00" type="text"
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Nº do Pedido</label>
                      <input value={supplierDraft.orderNumber} onChange={(e) => setSupplierDraft(d => ({ ...d, orderNumber: e.target.value }))}
                        placeholder="PO-2026-0000"
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Nota Fiscal</label>
                      <input value={supplierDraft.fiscalNote} onChange={(e) => setSupplierDraft(d => ({ ...d, fiscalNote: e.target.value }))}
                        placeholder="NF-00000"
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Previsão de Entrega</label>
                      <input type="date" value={supplierDraft.deliveryForecast} onChange={(e) => setSupplierDraft(d => ({ ...d, deliveryForecast: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Entrega Real</label>
                      <input type="date" value={supplierDraft.realDeliveryDate} onChange={(e) => setSupplierDraft(d => ({ ...d, realDeliveryDate: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white" />
                    </div>
                  </div>
                </div>
              ) : (
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
              )}
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
              {request.items.map((item, i) => {
                const openObjections = (item.objections || []).filter((o) => !o.resolved);
                const resolvedObjections = (item.objections || []).filter((o) => o.resolved);
                return (
                  <div key={item.id} className={`bg-white border rounded-xl p-4 ${openObjections.length > 0 ? 'border-orange-300' : 'border-slate-200'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-slate-400 font-medium">Item {i + 1}</span>
                          <PriorityBadge priority={item.priority} />
                          {openObjections.length > 0 && (
                            <span className="flex items-center gap-1 text-xs text-orange-600 font-medium bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                              <AlertCircle size={10} /> {openObjections.length} objeção
                            </span>
                          )}
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

                    {/* Objections list */}
                    {(item.objections || []).length > 0 && (
                      <div className="mt-3 space-y-2">
                        {openObjections.map((obj) => (
                          <div key={obj.id} className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                            <AlertCircle size={13} className="text-orange-500 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-orange-700">{obj.user}</p>
                              <p className="text-xs text-orange-800 mt-0.5">{obj.text}</p>
                              <p className="text-[10px] text-orange-400 mt-0.5">{new Date(obj.date).toLocaleString('pt-BR')}</p>
                            </div>
                            <button onClick={() => handleResolveObjection(item.id, obj.id)}
                              className="text-xs text-emerald-600 hover:text-emerald-800 font-medium flex items-center gap-1 flex-shrink-0 mt-0.5">
                              <CheckCheck size={12} /> Resolver
                            </button>
                          </div>
                        ))}
                        {resolvedObjections.map((obj) => (
                          <div key={obj.id} className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 opacity-60">
                            <CheckCheck size={13} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-slate-500 line-through">{obj.text}</p>
                            </div>
                            <span className="text-[10px] text-emerald-600 font-medium flex-shrink-0">Resolvido</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add objection */}
                    {objectionItemId === item.id ? (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={objectionText}
                          onChange={(e) => setObjectionText(e.target.value)}
                          spellCheck={true}
                          lang="pt-BR"
                          placeholder="Descreva a objeção ou correção necessária..."
                          rows={2}
                          className="w-full border border-orange-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button onClick={() => handleAddObjection(item.id)}
                            className="flex items-center gap-1 bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                            <MessageSquarePlus size={12} /> Registrar
                          </button>
                          <button onClick={() => { setObjectionItemId(null); setObjectionText(''); }}
                            className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg transition-colors">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setObjectionItemId(item.id)}
                        className="mt-3 flex items-center gap-1.5 text-xs text-slate-400 hover:text-orange-600 transition-colors font-medium">
                        <MessageSquarePlus size={13} /> Adicionar Objeção
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Aprovação do Gestor */}
          {isApprovalStep && (
            <div className={`rounded-xl p-4 border ${isApproved ? 'bg-emerald-50 border-emerald-200' : 'bg-yellow-50 border-yellow-200'}`}>
              <div className="flex items-center gap-2 mb-3">
                {isApproved ? <ShieldCheck size={16} className="text-emerald-600" /> : <ShieldAlert size={16} className="text-yellow-600" />}
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Aprovação do Gestor</h3>
              </div>
              {isApproved ? (
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-emerald-700">✓ Aprovado por {request.approvedBy}</p>
                  <p className="text-xs text-emerald-600">ID de Aprovação: <strong>{request.approvalId}</strong></p>
                  {request.approvedAt && <p className="text-xs text-emerald-500">Em {new Date(request.approvedAt).toLocaleString('pt-BR')}</p>}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-yellow-700">Esta solicitação requer aprovação do gestor antes de avançar.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Nome do Gestor <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={approverName}
                        onChange={(e) => { setApproverName(e.target.value); setApprovalError(''); }}
                        placeholder="Nome completo"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">ID do Gestor <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={approvalId}
                        onChange={(e) => { setApprovalId(e.target.value); setApprovalError(''); }}
                        placeholder="Ex: GST-001"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
                      />
                    </div>
                  </div>
                  {approvalError && <p className="text-xs text-red-600">{approvalError}</p>}
                  <button
                    onClick={() => {
                      if (!approverName.trim() || !approvalId.trim()) {
                        setApprovalError('Preencha o nome e o ID do gestor para aprovar.');
                        return;
                      }
                      onApprove(request.id, approverName.trim(), approvalId.trim());
                    }}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    <ShieldCheck size={14} />
                    Aprovar Solicitação
                  </button>
                </div>
              )}
            </div>
          )}

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
          {canAdvance && isApprovalStep && !isApproved && (
            <span className="flex items-center gap-2 bg-yellow-100 text-yellow-700 px-4 py-2 rounded-lg text-sm font-medium">
              <ShieldAlert size={15} />
              Aguardando aprovação do gestor
            </span>
          )}
          {canAdvance && (!isApprovalStep || isApproved) && (
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
