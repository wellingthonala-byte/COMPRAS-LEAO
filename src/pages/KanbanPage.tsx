import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ClipboardList, ShieldAlert, ShoppingCart, Truck, XCircle,
  AlarmClock, DollarSign, Search, FilterX, Kanban, List, Download, FileSpreadsheet,
  Columns3, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Eye,
} from 'lucide-react';
import { Header } from '../components/Layout/Header';
import { KanbanColumn } from '../components/Kanban/KanbanColumn';
import { RequestDetailModal } from '../components/Modals/RequestDetailModal';
import { STATUS_ORDER, computeSkipTarget } from '../data/mockData';
import { PurchaseRequest, Priority, Status, HistoryEntry } from '../types';
import { ValueApproval } from '../types/finance';
import { sendNotification } from '../utils/notify';
import { formatPaymentTerms, paymentTermsEqual } from '../lib/paymentTerms';
import { blocksAdvanceForValueApproval, cancelInstallmentsForInvalidatedApproval, canProjectInstallments, countsAsPurchase, isPurchasedOrLater, syncRequestFinance } from '../lib/financeSync';
import { AppUser } from '../data/users';
import { usePurchasingOptions } from '../lib/usePurchasingOptions';
import { useApprovalSettings } from '../lib/useApprovalSettings';
import { toCSV, toXLS } from '../utils/exportTable';

const priorities: Priority[] = ['Máquina Parada', 'Urgente', 'Não Urgente'];

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (s?: string) => (s ? new Date(s.length === 10 ? s + 'T12:00:00' : s).toLocaleDateString('pt-BR') : '—');
const PRIORITY_BADGE: Record<Priority, string> = {
  'Máquina Parada': 'bg-red-100 text-red-700 border border-red-200',
  'Urgente': 'bg-orange-100 text-orange-700 border border-orange-200',
  'Não Urgente': 'bg-blue-100 text-blue-700 border border-blue-200',
};
const STATUS_BADGE: Record<Status, string> = {
  'Nova Solicitação': 'bg-slate-100 text-slate-700', 'Em Aprovação': 'bg-yellow-100 text-yellow-700',
  'Em Cotação': 'bg-violet-100 text-violet-700', 'Comprado': 'bg-sky-100 text-sky-700',
  'Em Rota': 'bg-indigo-100 text-indigo-700', 'Em Serviço': 'bg-purple-100 text-purple-700',
  'Disponível para Retirada': 'bg-teal-100 text-teal-700', 'Finalizado': 'bg-emerald-100 text-emerald-700',
  'Cancelada': 'bg-red-100 text-red-700',
};

interface KanbanPageProps {
  requests: PurchaseRequest[];
  setRequests: React.Dispatch<React.SetStateAction<PurchaseRequest[]>>;
  currentUser: AppUser;
}

export function KanbanPage({ requests, setRequests, currentUser }: KanbanPageProps) {
  const { centrosCusto: sectors } = usePurchasingOptions();
  const { aprovacaoObrigatoria } = useApprovalSettings();
  // Mesma regra do RequestDetailModal: com a aprovação obrigatória
  // desligada, o comprador também pode confirmar mérito e valor.
  const canActOnApproval = currentUser.role === 'gestor' || (!aprovacaoObrigatoria && currentUser.role === 'comprador');
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState<Priority | ''>('');
  const [filterSector, setFilterSector] = useState('');
  const [view, setView] = useState<'kanban' | 'lista'>('kanban');

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

  /* ------------- Indicadores resumidos (cabeçalho) — mesmo padrão de O.S. ------------- */
  const stats = useMemo(() => {
    const openObjectionsCount = (r: PurchaseRequest) => r.items.reduce((acc, i) => acc + (i.objections || []).filter((o) => !o.resolved).length, 0);
    const overdue = filtered.filter((r) => r.status !== 'Finalizado' && r.status !== 'Cancelada' && new Date(r.deliveryForecast + 'T23:59:59') < new Date());
    return [
      { label: 'Total de Solicitações', value: String(filtered.length), icon: ClipboardList, color: 'text-violet-600', bg: 'bg-violet-50', tip: 'Total de solicitações no filtro atual.' },
      { label: 'Em Aprovação', value: String(filtered.filter((r) => r.status === 'Em Aprovação').length), icon: ShieldAlert, color: 'text-amber-600', bg: 'bg-amber-50', tip: 'Aguardando aprovação de mérito do gestor.' },
      { label: 'Em Cotação', value: String(filtered.filter((r) => r.status === 'Em Cotação').length), icon: DollarSign, color: 'text-sky-600', bg: 'bg-sky-50', tip: 'Comprador buscando fornecedor/preço.' },
      { label: 'Compradas', value: String(filtered.filter((r) => countsAsPurchase(r)).length), icon: ShoppingCart, color: 'text-indigo-600', bg: 'bg-indigo-50', tip: 'Já efetivamente compradas (Comprado em diante).' },
      { label: 'Objeções Pendentes', value: String(filtered.filter((r) => openObjectionsCount(r) > 0).length), icon: ShieldAlert, color: 'text-orange-600', bg: 'bg-orange-50', tip: 'Solicitações com objeção não resolvida em algum item.' },
      { label: 'Atrasadas', value: String(overdue.length), icon: AlarmClock, color: 'text-red-600', bg: 'bg-red-50', tip: 'Em aberto com prazo de entrega vencido.' },
      { label: 'Canceladas', value: String(filtered.filter((r) => r.status === 'Cancelada').length), icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', tip: 'Canceladas com justificativa.' },
      { label: 'Valor Total', value: fmtBRL(filtered.filter((r) => countsAsPurchase(r)).reduce((s, r) => s + (r.value ?? 0), 0)), icon: Truck, color: 'text-emerald-700', bg: 'bg-emerald-50', tip: 'Soma do valor das solicitações já compradas (não canceladas).' },
    ];
  }, [filtered]);

  const exportAll = (kind: 'csv' | 'xls') => {
    const headers = ['Nº', 'Criado em', 'Solicitante', 'Setor', 'Descrição', 'Prioridade', 'Status', 'Valor', 'Previsão de entrega', 'Aprovado por'];
    const rows = filtered.map((r) => [
      r.number, fmtDate(r.createdAt), r.requester, r.sector, r.items[0]?.description ?? '—', r.priority, r.status,
      r.value !== undefined ? fmtBRL(r.value) : '—', fmtDate(r.deliveryForecast), r.approvedBy ?? '—',
    ]);
    (kind === 'csv' ? toCSV : toXLS)(headers, rows, 'solicitacoes-de-compra');
  };

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

    // Defesa em profundidade: a UI já esconde o botão "Editar" da cotação
    // pra pedido Cancelado/Finalizado, mas o handler não pode confiar só
    // nisso — reabrir um pedido já encerrado pra mexer em valor/fornecedor
    // reinvalidava aprovação e cancelava parcelas de uma compra que já
    // deveria ser imutável.
    const cotacaoFields: (keyof PurchaseRequest)[] = ['supplier', 'value', 'orderNumber', 'fiscalNote', 'fiscalNoteDate', 'paymentTerms'];
    if ((before.status === 'Cancelada' || before.status === 'Finalizado') && cotacaoFields.some((k) => k in fields)) return;

    // Valor e condição de pagamento são exatamente o que o gestor aprovou —
    // alterá-los depois da aprovação sem invalidá-la deixava o comprador criar
    // (ou inflar) o compromisso financeiro sem nenhum novo aprovador olhar pra
    // isso: as parcelas eram só reprojetadas silenciosamente para o valor novo.
    // fiscalNoteDate fica de fora dessa trava — só desloca a data-base do
    // parcelamento já aprovado, não o valor nem a condição.
    const touchedApproval =
      ('value' in fields && fields.value !== before.value) ||
      ('paymentTerms' in fields && !paymentTermsEqual(fields.paymentTerms, before.paymentTerms));
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
    if (!canActOnApproval) return;
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
    if (!canActOnApproval) return;
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
    <div className="flex flex-col min-h-screen lg:pl-60 bg-slate-50">
      <Header
        title="Kanban de Compras"
        subtitle="Acompanhe o fluxo de todas as solicitações"
        requests={requests}
      />

      <div className="flex-1 pt-16 px-4 md:px-6 py-6 space-y-5">

        {/* Indicadores resumidos */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
          {stats.map(({ label, value, icon: Icon, color, bg, tip }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group relative" tabIndex={0}>
              <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center mb-2`}>
                <Icon size={15} className={color} />
              </div>
              <p className="text-lg font-bold text-slate-800 truncate">{value}</p>
              <p className="text-[11px] text-slate-500 leading-tight mt-0.5">{label}</p>
              <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-52 bg-slate-800 text-white text-[11px] leading-snug rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity z-20 shadow-lg">
                {tip}
                <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
              </div>
            </div>
          ))}
        </div>

        {/* Barra de filtros — mesmo padrão da tela de Ordens de Serviço */}
        <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nº, solicitante, item..." aria-label="Buscar solicitação"
                className="pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg w-72 focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value as Priority | '')}
              aria-label="Prioridade"
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="">Todas as Prioridades</option>
              {priorities.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select
              value={filterSector}
              onChange={(e) => setFilterSector(e.target.value)}
              aria-label="Setor"
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
                <FilterX size={13} /> Limpar filtros
              </button>
            )}
            <span className="ml-auto text-xs text-slate-400">
              {filtered.length} de {requests.length} solicitações
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-slate-100">
            <div className="flex rounded-lg border border-slate-200 overflow-hidden" role="tablist" aria-label="Modo de visualização">
              <button onClick={() => setView('kanban')} role="tab" aria-selected={view === 'kanban'}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${view === 'kanban' ? 'bg-violet-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                <Kanban size={13} /> Kanban
              </button>
              <button onClick={() => setView('lista')} role="tab" aria-selected={view === 'lista'}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${view === 'lista' ? 'bg-violet-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                <List size={13} /> Lista
              </button>
            </div>
            <button onClick={() => exportAll('csv')} className="flex items-center gap-1 text-xs text-slate-500 border border-slate-200 rounded-lg px-2.5 py-2 hover:bg-slate-50 hover:text-violet-700">
              <Download size={13} /> Exportar CSV
            </button>
            <button onClick={() => exportAll('xls')} className="flex items-center gap-1 text-xs text-slate-500 border border-slate-200 rounded-lg px-2.5 py-2 hover:bg-slate-50 hover:text-emerald-700">
              <FileSpreadsheet size={13} /> Excel
            </button>
          </div>
        </div>

        {view === 'kanban' ? (
          <div className="overflow-x-auto -mx-4 md:-mx-6 px-4 md:px-6">
            <div className="flex gap-4 min-w-max pb-4">
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
        ) : (
          <RequestsTable requests={filtered} onView={setSelectedId} />
        )}
      </div>

      {selectedRequest && (
        <RequestDetailModal
          request={selectedRequest}
          onClose={() => setSelectedId(null)}
          currentUser={currentUser}
          aprovacaoObrigatoria={aprovacaoObrigatoria}
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

/* ================================================================== */
/* Visão em lista — mesmo padrão de tabela usado em Ordens de Serviço  */
/* ================================================================== */
function RequestsTable({ requests, onView }: { requests: PurchaseRequest[]; onView: (id: string) => void }) {
  const [sortKey, setSortKey] = useState<string>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [hidden, setHidden] = useState<Set<string>>(new Set(['approvedBy']));
  const [showCols, setShowCols] = useState(false);
  const PAGE = 10;

  const columns: { key: string; label: string; value: (r: PurchaseRequest) => string | number; render?: (r: PurchaseRequest) => React.ReactNode; align?: 'right' }[] = [
    { key: 'number', label: 'Nº', value: (r) => r.number, render: (r) => <span className="font-semibold text-slate-700 whitespace-nowrap">{r.number}</span> },
    { key: 'createdAt', label: 'Criado em', value: (r) => r.createdAt, render: (r) => fmtDate(r.createdAt) },
    { key: 'requester', label: 'Solicitante', value: (r) => r.requester },
    { key: 'sector', label: 'Setor', value: (r) => r.sector },
    { key: 'description', label: 'Descrição', value: (r) => r.items[0]?.description ?? '—', render: (r) => <span className="line-clamp-1">{r.items[0]?.description ?? '—'}</span> },
    {
      key: 'priority', label: 'Prioridade', value: (r) => r.priority,
      render: (r) => <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${PRIORITY_BADGE[r.priority]}`}>{r.priority}</span>,
    },
    {
      key: 'status', label: 'Status', value: (r) => r.status,
      render: (r) => <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_BADGE[r.status]}`}>{r.status}</span>,
    },
    { key: 'value', label: 'Valor', value: (r) => r.value ?? 0, render: (r) => (r.value !== undefined ? fmtBRL(r.value) : '—'), align: 'right' },
    {
      key: 'deliveryForecast', label: 'Previsão de entrega', value: (r) => r.deliveryForecast,
      render: (r) => {
        const overdue = r.status !== 'Finalizado' && r.status !== 'Cancelada' && new Date(r.deliveryForecast + 'T23:59:59') < new Date();
        return <span className={overdue ? 'text-red-500 font-semibold' : ''}>{fmtDate(r.deliveryForecast)}</span>;
      },
    },
    { key: 'approvedBy', label: 'Aprovado por', value: (r) => r.approvedBy ?? '—' },
  ];

  const visible = columns.filter((c) => !hidden.has(c.key));

  const rows = useMemo(() => {
    const out = [...requests];
    const col = columns.find((c) => c.key === sortKey);
    if (col) out.sort((a, b) => {
      const va = col.value(a), vb = col.value(b);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE, safePage * PAGE);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
        <h3 className="font-semibold text-slate-700 text-sm mr-auto">Lista de Solicitações</h3>
        <div className="relative">
          <button onClick={() => setShowCols((v) => !v)} className="flex items-center gap-1 text-xs text-slate-500 border border-slate-200 rounded-lg px-2 py-1.5 hover:bg-slate-50">
            <Columns3 size={13} /> Colunas
          </button>
          {showCols && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowCols(false)} />
              <div className="absolute right-0 top-9 bg-white border border-slate-200 rounded-xl shadow-lg z-30 p-2 w-48 max-h-64 overflow-y-auto">
                {columns.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 text-xs text-slate-600 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer">
                    <input type="checkbox" checked={!hidden.has(c.key)} className="accent-violet-600"
                      onChange={() => setHidden((prev) => {
                        const n = new Set(prev);
                        if (n.has(c.key)) n.delete(c.key); else if (n.size < columns.length - 1) n.add(c.key);
                        return n;
                      })} />
                    {c.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b border-slate-100">
              {visible.map((c) => (
                <th key={c.key} scope="col" className={`px-3 py-2.5 text-xs font-semibold text-slate-500 whitespace-nowrap bg-slate-50 ${c.align === 'right' ? 'text-right' : ''}`}>
                  <button onClick={() => { if (sortKey === c.key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setSortKey(c.key); setSortDir('asc'); } }}
                    className="inline-flex items-center gap-1 hover:text-slate-800">
                    {c.label}
                    {sortKey === c.key ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
                  </button>
                </th>
              ))}
              <th scope="col" className="px-3 py-2.5 text-xs font-semibold text-slate-500 bg-slate-50">Ações</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={visible.length + 1} className="px-4 py-10 text-center text-xs text-slate-400">Nenhuma solicitação encontrada.</td></tr>
            ) : pageRows.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 transition-colors cursor-pointer"
                onClick={() => onView(r.id)}>
                {visible.map((c) => (
                  <td key={c.key} className={`px-3 py-2.5 text-xs text-slate-600 ${c.align === 'right' ? 'text-right' : ''}`}>
                    {c.render ? c.render(r) : c.value(r)}
                  </td>
                ))}
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => onView(r.id)} title="Ver detalhes" aria-label={`Ver ${r.number}`}
                    className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg"><Eye size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 text-xs text-slate-500">
        <span>{rows.length} solicitações</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} aria-label="Página anterior"
            className="p-1 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50"><ChevronLeft size={14} /></button>
          <span>Página {safePage} de {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} aria-label="Próxima página"
            className="p-1 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50"><ChevronRight size={14} /></button>
        </div>
      </div>
    </div>
  );
}
