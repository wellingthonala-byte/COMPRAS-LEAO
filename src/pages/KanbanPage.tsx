import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter, X } from 'lucide-react';
import { Header } from '../components/Layout/Header';
import { KanbanColumn } from '../components/Kanban/KanbanColumn';
import { RequestDetailModal } from '../components/Modals/RequestDetailModal';
import { STATUS_ORDER, computeSkipTarget } from '../data/mockData';
import { PurchaseRequest, Priority, Sector, Status, HistoryEntry } from '../types';
import { ValueApproval } from '../types/finance';
import { sendNotification } from '../utils/notify';
import { formatPaymentTerms } from '../lib/paymentTerms';
import { blocksAdvanceForValueApproval, cancelInstallmentsForInvalidatedApproval, canProjectInstallments, isPurchasedOrLater, syncRequestFinance } from '../lib/financeSync';
import { AppUser } from '../data/users';

const priorities: Priority[] = ['Máquina Parada', 'Urgente', 'Não Urgente'];
const sectors: Sector[] = ['Produção', 'Manutenção', 'Administrativo', 'TI', 'RH', 'Logística'];

interface KanbanPageProps {
  requests: PurchaseRequest[];
  setRequests: React.Dispatch<React.SetStateAction<PurchaseRequest[]>>;
  currentUser: AppUser;
}

export function KanbanPage({ requests, setRequests, currentUser }: KanbanPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState<Priority | ''>('');
  const [filterSector, setFilterSector] = useState<Sector | ''>('');

  const selectedRequest = requests.find((r) => r.id === selectedId);

  // Abertura direta de um card por ?pedido=<id> — é como o painel financeiro
  // linka de volta para a solicitação. O parâmetro é consumido e removido da
  // URL para não reabrir o modal ao fechá-lo.
  useEffect(() => {
    const id = searchParams.get('pedido');
    if (!id) return;
    if (requests.some((r) => r.id === id)) setSelectedId(id);
    setSearchParams({}, { replace: true });
  }, [searchParams, requests, setSearchParams]);

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

  /** Entrada no histórico com a assinatura padrão do projeto. */
  const entry = (action: string, from?: Status, to?: Status): HistoryEntry => ({
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: new Date().toISOString(),
    user: currentUser.name,
    action,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });

  /**
   * Aplica a mudança de forma funcional (para não sobrescrever alteração
   * concorrente vinda do Supabase) e devolve o pedido resultante para o
   * gancho financeiro. Uma eventual defasagem aqui é corrigida pela
   * varredura de reconciliação ao abrir o Financeiro.
   */
  const applyChange = (id: string, change: (r: PurchaseRequest) => PurchaseRequest, snapshot: PurchaseRequest) => {
    setRequests((prev) => prev.map((r) => (r.id !== id ? r : change(r))));
    return change(snapshot);
  };

  const handleAdvanceStatus = (id: string) => {
    if (currentUser.role !== 'comprador') return;
    const req = requests.find((r) => r.id === id);
    if (!req) return;
    const idx = STATUS_ORDER.indexOf(req.status);
    if (idx === -1 || idx >= STATUS_ORDER.length - 1) return;
    // Defesa em profundidade: mesma trava financeira do modal, replicada
    // aqui para não depender só da UI para bloquear o avanço.
    if (blocksAdvanceForValueApproval(req)) return;
    const nextStatus = STATUS_ORDER[idx + 1];
    const advanced = entry('Status alterado', req.status, nextStatus);
    const updated = applyChange(id, (r) => ({
      ...r,
      status: nextStatus,
      history: [...r.history, advanced],
    }), req);

    // Entrada em "Comprado": as parcelas passam a Confirmado e a data-base é
    // recalculada pela nota fiscal. Não aguardamos: falha aqui não pode
    // travar a movimentação do card.
    void syncRequestFinance(updated);

    sendNotification({
      title: `📦 ${req.number} — ${nextStatus}`,
      message: `Solicitação de ${req.requester} (${req.sector}) avançou para "${nextStatus}".`,
      priority: req.priority === 'Máquina Parada' ? 5 : req.priority === 'Urgente' ? 4 : 3,
      tags: ['package'],
    });
  };

  /**
   * Pula uma sequência contígua de etapas não aplicáveis ao pedido a partir
   * do status atual (ex.: material entregue sem instalação pula "Em Rota" E
   * "Em Serviço" numa única ação). Só o comprador pode acionar — checado
   * aqui também, não só na UI, já que o handler pode ser chamado por
   * qualquer código que tenha a referência.
   */
  const handleSkipStatus = (id: string) => {
    if (currentUser.role !== 'comprador') return;
    const req = requests.find((r) => r.id === id);
    if (!req) return;
    // Defesa em profundidade: mesma trava financeira do modal.
    if (blocksAdvanceForValueApproval(req)) return;
    const target = computeSkipTarget(req.status);
    if (!target) return;
    const { skipped, nextStatus } = target;
    const skippedLabel = skipped.map((s) => `"${s}"`).join(' e ');
    const skipEntry = entry(
      skipped.length === 1
        ? `Etapa ${skippedLabel} pulada — não aplicável a este pedido`
        : `Etapas ${skippedLabel} puladas — não aplicável a este pedido`,
      req.status, nextStatus
    );
    const updated = applyChange(id, (r) => ({
      ...r,
      status: nextStatus,
      history: [...r.history, skipEntry],
    }), req);

    void syncRequestFinance(updated);

    sendNotification({
      title: `⏭️ ${req.number} — ${nextStatus}`,
      message: `${currentUser.name} pulou ${skipped.length === 1 ? `a etapa ${skippedLabel}` : `as etapas ${skippedLabel}`} e avançou a solicitação de ${req.requester} para "${nextStatus}".`,
      priority: 3,
      tags: ['package'],
    });
  };

  const handleCancel = (id: string, reason: string) => {
    if (currentUser.role !== 'comprador') return;
    const req = requests.find((r) => r.id === id);
    // Defesa em profundidade: uma vez "Comprado" ou além, a compra já foi
    // efetivada e o cancelamento simples não pode mais zerar a dívida real
    // com o fornecedor — mesma trava aplicada na UI (canCancel).
    if (!req || req.status === 'Cancelada' || req.status === 'Finalizado' || isPurchasedOrLater(req.status)) return;
    const cancelledAt = new Date().toISOString();
    const cancelEntry = entry(`Solicitação cancelada — Motivo: ${reason}`, req.status, 'Cancelada');
    const updated = applyChange(id, (r) => ({
      ...r,
      status: 'Cancelada' as Status,
      cancelledBy: currentUser.name,
      cancelledAt,
      cancelReason: reason,
      history: [...r.history, cancelEntry],
    }), req);

    // Parcelas em aberto viram Cancelado; as já pagas permanecem
    void syncRequestFinance(updated);

    sendNotification({
      title: `🚫 ${req.number} — Cancelada`,
      message: `${currentUser.name} cancelou a solicitação de ${req.requester}. Motivo: ${reason}`,
      priority: 3,
      tags: ['no_entry'],
    });
  };

  const handleEdit = (id: string, fields: Partial<PurchaseRequest>) => {
    const before = requests.find((r) => r.id === id);
    if (!before) return;

    // Valor e condição de pagamento são exatamente o que o gestor aprovou —
    // alterá-los depois da aprovação sem invalidá-la deixava o comprador criar
    // (ou inflar) o compromisso financeiro sem nenhum novo aprovador olhar pra
    // isso: as parcelas eram só reprojetadas silenciosamente para o valor novo.
    // fiscalNoteDate fica de fora dessa trava — só desloca a data-base do
    // parcelamento já aprovado, não o valor nem a condição.
    const approvalFields: (keyof PurchaseRequest)[] = ['value', 'paymentTerms'];
    const touchedApproval = approvalFields.some((k) => k in fields && fields[k] !== before[k]);
    const invalidatesApproval = touchedApproval && !!before.valueApproval;
    const nextFields: Partial<PurchaseRequest> = invalidatesApproval ? { ...fields, valueApproval: undefined } : fields;

    setRequests((prev) => prev.map((r) => (r.id !== id ? r : {
      ...r,
      ...nextFields,
      ...(invalidatesApproval ? {
        history: [...r.history, entry(
          `Valor/condição alterados após a aprovação — aprovação de valor invalidada, requer nova aprovação do gestor`
        )],
      } : {}),
    })));

    const financeFields: (keyof PurchaseRequest)[] = ['value', 'paymentTerms', 'fiscalNoteDate'];
    const touched = financeFields.some((k) => k in fields);
    if (touched && before.valueApproval && !invalidatesApproval) {
      // Só fiscalNoteDate mudou (valor/condição intactos): recalcula a
      // data-base normalmente, sem exigir nova aprovação.
      void syncRequestFinance({ ...before, ...nextFields });
    } else if (invalidatesApproval) {
      // Aprovação invalidada: cancela de fato as parcelas antigas — sem
      // valueApproval, deriveInstallments devolve null e syncRequestFinance
      // não mexeria em nada, deixando as parcelas antigas penduradas como
      // compromisso sem aprovação nenhuma cobrindo elas.
      void cancelInstallmentsForInvalidatedApproval(before.id, before.number, new Date().toISOString());
    }
  };

  /**
   * Segunda aprovação: o gestor aprova o VALOR cotado. É aqui que nasce o
   * compromisso financeiro — a aprovação de mérito acontece antes da cotação,
   * quando ainda não existe valor nem condição de pagamento.
   */
  const handleApproveValue = (id: string) => {
    if (currentUser.role !== 'gestor') return;
    const req = requests.find((r) => r.id === id);
    if (!req || req.valueApproval || !canProjectInstallments(req)) return;
    // Defesa em profundidade — a UI já esconde o botão nesses dois casos,
    // mas o handler não pode confiar só nisso: objeção pendente não pode
    // virar compromisso financeiro, e um gestor não aprova a própria compra.
    const openObjections = req.items.reduce((acc, item) => acc + (item.objections || []).filter((o) => !o.resolved).length, 0);
    if (openObjections > 0) return;
    if (req.requester === currentUser.name) return;

    const now = new Date().toISOString();
    const valueApproval: ValueApproval = {
      approvedBy: currentUser.name,
      approvalId: currentUser.id,
      approvedAt: now,
      approvedValue: req.value as number,
      paymentTermsLabel: formatPaymentTerms(req.paymentTerms),
    };
    const valueLabel = (req.value as number).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const approvalEntry = entry(
      `Valor aprovado pelo gestor: ${valueLabel} em ${valueApproval.paymentTermsLabel} (ID: ${currentUser.id})`
    );
    const updated = applyChange(id, (r) => ({
      ...r,
      valueApproval,
      history: [...r.history, approvalEntry],
    }), req);

    // Gera as parcelas previstas. Sem await de propósito: se a gravação
    // falhar, o erro vai para a fila e a aprovação conclui de todo modo.
    void syncRequestFinance(updated);

    sendNotification({
      title: `💰 ${req.number} — Valor aprovado`,
      message: `${currentUser.name} aprovou ${valueLabel} em ${valueApproval.paymentTermsLabel}. ${req.paymentTerms?.days.length ?? 0} parcela(s) entraram na projeção financeira.`,
      priority: 4,
      tags: ['moneybag'],
    });
  };

  const handleApprove = (id: string, approverName: string, approvalId: string) => {
    if (currentUser.role !== 'gestor') return;
    const req = requests.find((r) => r.id === id);
    // Idempotência (duplo clique não regrava) + segregação de funções (o
    // gestor não aprova a própria solicitação) — checado aqui, não só na UI.
    if (!req || req.approvedBy || req.requester === approverName) return;
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
              id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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

    if (req) {
      sendNotification({
        title: `✅ ${req.number} — Aprovado pelo gestor`,
        message: `${approverName} aprovou o mérito da solicitação de ${req.requester} (${req.sector}).`,
        priority: req.priority === 'Máquina Parada' ? 4 : 3,
        tags: ['white_check_mark'],
      });
    }
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
          onSkipStatus={(id) => { handleSkipStatus(id); setSelectedId(null); }}
          onApprove={(id, name, approvalId) => { handleApprove(id, name, approvalId); }}
          onApproveValue={handleApproveValue}
          onEdit={handleEdit}
          onCancel={(id, reason) => { handleCancel(id, reason); setSelectedId(null); }}
        />
      )}
    </div>
  );
}
