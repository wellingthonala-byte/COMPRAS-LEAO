import { useState, useMemo, useEffect } from 'react';
import { Filter, X } from 'lucide-react';
import { Header } from '../components/Layout/Header';
import { KanbanColumn } from '../components/Kanban/KanbanColumn';
import { RequestDetailModal } from '../components/Modals/RequestDetailModal';
import { STATUS_ORDER } from '../data/mockData';
import { PurchaseRequest, Priority, Sector, Status } from '../types';
import { sendNotification } from '../utils/notify';
import { AppUser } from '../data/users';

const priorities: Priority[] = ['Máquina Parada', 'Urgente', 'Não Urgente'];
const sectors: Sector[] = ['Produção', 'Manutenção', 'Administrativo', 'TI', 'RH', 'Logística'];

interface KanbanPageProps {
  requests: PurchaseRequest[];
  setRequests: React.Dispatch<React.SetStateAction<PurchaseRequest[]>>;
  currentUser: AppUser;
}

export function KanbanPage({ requests, setRequests, currentUser }: KanbanPageProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState<Priority | ''>('');
  const [filterSector, setFilterSector] = useState<Sector | ''>('');

  const selectedRequest = requests.find((r) => r.id === selectedId);

  // Alerta automático de entregas atrasadas (uma notificação por solicitação por dia)
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const overdue = requests.filter(
      (r) => r.status !== 'Finalizado' && r.status !== 'Cancelada' &&
        new Date(r.deliveryForecast + 'T23:59:59') < new Date()
    );
    overdue.forEach((r) => {
      const key = `overdue-alert-${r.id}-${today}`;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
      sendNotification({
        title: `⏰ ${r.number} — Entrega atrasada`,
        message: `Previsão era ${new Date(r.deliveryForecast + 'T12:00:00').toLocaleDateString('pt-BR')} e a solicitação de ${r.requester} ainda está em "${r.status}".`,
        priority: 4,
        tags: ['alarm_clock'],
      });
    });
  }, [requests]);

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      const matchSearch =
        !search ||
        r.number.toLowerCase().includes(search.toLowerCase()) ||
        r.requester.toLowerCase().includes(search.toLowerCase()) ||
        r.items.some((i) => i.description.toLowerCase().includes(search.toLowerCase()));
      const matchPriority = !filterPriority || r.priority === filterPriority;
      const matchSector = !filterSector || r.sector === filterSector;
      return matchSearch && matchPriority && matchSector;
    });
  }, [requests, search, filterPriority, filterSector]);

  const handleAdvanceStatus = (id: string) => {
    const req = requests.find((r) => r.id === id);
    if (!req) return;
    const idx = STATUS_ORDER.indexOf(req.status);
    if (idx === -1 || idx >= STATUS_ORDER.length - 1) return;
    const nextStatus = STATUS_ORDER[idx + 1];
    setRequests((prev) =>
      prev.map((r) =>
        r.id !== id ? r : {
          ...r,
          status: nextStatus,
          history: [
            ...r.history,
            {
              id: `h-${Date.now()}`,
              date: new Date().toISOString(),
              user: currentUser.name,
              action: 'Status alterado',
              from: r.status,
              to: nextStatus,
            },
          ],
        }
      )
    );
    sendNotification({
      title: `📦 ${req.number} — ${nextStatus}`,
      message: `Solicitação de ${req.requester} (${req.sector}) avançou para "${nextStatus}".`,
      priority: req.priority === 'Máquina Parada' ? 5 : req.priority === 'Urgente' ? 4 : 3,
      tags: ['package'],
    });
  };

  const handleCancel = (id: string, reason: string) => {
    const req = requests.find((r) => r.id === id);
    if (!req || req.status === 'Cancelada' || req.status === 'Finalizado') return;
    setRequests((prev) =>
      prev.map((r) =>
        r.id !== id ? r : {
          ...r,
          status: 'Cancelada' as Status,
          cancelledBy: currentUser.name,
          cancelledAt: new Date().toISOString(),
          cancelReason: reason,
          history: [
            ...r.history,
            {
              id: `h-${Date.now()}`,
              date: new Date().toISOString(),
              user: currentUser.name,
              action: `Solicitação cancelada — Motivo: ${reason}`,
              from: r.status,
              to: 'Cancelada' as Status,
            },
          ],
        }
      )
    );
    sendNotification({
      title: `🚫 ${req.number} — Cancelada`,
      message: `${currentUser.name} cancelou a solicitação de ${req.requester}. Motivo: ${reason}`,
      priority: 3,
      tags: ['no_entry'],
    });
  };

  const handleEdit = (id: string, fields: Partial<import('../types').PurchaseRequest>) => {
    setRequests((prev) => prev.map((r) => r.id !== id ? r : { ...r, ...fields }));
  };

  const handleApprove = (id: string, approverName: string, approvalId: string) => {
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        return {
          ...r,
          approvedBy: approverName,
          approvalId,
          approvedAt: new Date().toISOString(),
          history: [
            ...r.history,
            {
              id: `h-${Date.now()}`,
              date: new Date().toISOString(),
              user: approverName,
              action: `Aprovado pelo gestor (ID: ${approvalId})`,
              from: r.status,
              to: r.status,
            },
          ],
        };
      })
    );
  };

  const hasFilters = search || filterPriority || filterSector;

  return (
    <div className="flex flex-col h-screen pl-60">
      <Header
        title="Kanban de Compras"
        subtitle="Acompanhe o fluxo de todas as solicitações"
        searchValue={search}
        onSearchChange={setSearch}
        requests={requests}
      />

      <div className="flex flex-col overflow-hidden pt-16" style={{ height: '100vh' }}>
        {/* Filter bar */}
        <div className="flex-shrink-0 flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200">
          <Filter size={14} className="text-slate-400" />
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as Priority | '')}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="">Todas as Prioridades</option>
            {priorities.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            value={filterSector}
            onChange={(e) => setFilterSector(e.target.value as Sector | '')}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="">Todos os Setores</option>
            {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {hasFilters && (
            <button
              onClick={() => { setSearch(''); setFilterPriority(''); setFilterSector(''); }}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
            >
              <X size={13} /> Limpar filtros
            </button>
          )}
          <span className="ml-auto text-xs text-slate-400">
            {filtered.length} de {requests.length} solicitações
          </span>
        </div>

        {/* Board */}
        <div className="flex-1 overflow-auto">
          <div className="flex gap-4 p-6 min-w-max" style={{ minHeight: '100%' }}>
            {[...STATUS_ORDER, 'Cancelada'].map((status) => (
              <KanbanColumn
                key={status}
                status={status as Status}
                requests={filtered.filter((r) => r.status === status)}
                onCardClick={(id) => setSelectedId(id)}
              />
            ))}
          </div>
        </div>
      </div>

      {selectedRequest && (
        <RequestDetailModal
          request={selectedRequest}
          onClose={() => setSelectedId(null)}
          currentUser={currentUser}
          onAdvanceStatus={(id) => { handleAdvanceStatus(id); setSelectedId(null); }}
          onApprove={(id, name, approvalId) => { handleApprove(id, name, approvalId); }}
          onEdit={handleEdit}
          onCancel={(id, reason) => { handleCancel(id, reason); setSelectedId(null); }}
        />
      )}
    </div>
  );
}
