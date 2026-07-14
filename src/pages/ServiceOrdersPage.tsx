import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList, FolderOpen, Loader2, ShieldAlert, Wrench, CheckCircle2, XCircle,
  AlarmClock, DollarSign, Plus, Search, X, ChevronLeft, ChevronRight, ChevronUp,
  ChevronDown, Columns3, Download, FileSpreadsheet, Printer, ArrowRight,
  MessageSquare, Clock, Paperclip, Trash2, ShoppingCart, HardHat, Info, FilterX,
  Eye, Kanban, List, Calendar, RefreshCw, Copy, Pause, Play, ListChecks,
  PenLine, Camera,
} from 'lucide-react';
import { Header } from '../components/Layout/Header';
import { KanbanColumnShell } from '../components/Kanban/KanbanColumnShell';
import { colorFromInitials } from '../utils/colors';
import { sendNotification } from '../utils/notify';
import { generateRequestNumber } from '../utils/numbering';
import { printServiceOrder } from '../utils/printDocument';
import { fetchServiceOrders, upsertServiceOrders } from '../lib/backend';
import { ObjectLinkInput, ObjectLinkView, normalizeUrl } from '../components/UI/ObjectLink';
import { PurchaseRequest } from '../types';
import { AppUser, loadUsers } from '../data/users';
import {
  ServiceOrder, OSStatus, OSPriority, MaintenanceType, OS_FLOW, OS_COLUMNS,
  loadServiceOrders, saveServiceOrders, generateOSNumber, osCost, osIsOverdue,
  osSlaMet, osElapsedHours, osIsClosed, osLastUpdate,
} from '../types/serviceOrders';

/* ------------------------------------------------------------------ */
/* Mapas visuais — mesmo padrão do Kanban de Compras                   */
/* ------------------------------------------------------------------ */
const COLUMN_DOT: Record<OSStatus, string> = {
  'Aberta': 'bg-slate-500', 'Aguardando Aprovação': 'bg-yellow-500', 'Programada': 'bg-violet-500',
  'Em Execução': 'bg-sky-500', 'Pausada': 'bg-orange-400', 'Finalizada': 'bg-emerald-500',
  'Faturada': 'bg-teal-500', 'Cancelada': 'bg-red-400',
};
const COLUMN_BG: Record<OSStatus, string> = {
  'Aberta': 'bg-slate-50', 'Aguardando Aprovação': 'bg-yellow-50', 'Programada': 'bg-violet-50',
  'Em Execução': 'bg-sky-50', 'Pausada': 'bg-orange-50', 'Finalizada': 'bg-emerald-50',
  'Faturada': 'bg-teal-50', 'Cancelada': 'bg-red-50/50',
};
const STATUS_BADGE: Record<OSStatus, string> = {
  'Aberta': 'bg-slate-100 text-slate-700', 'Aguardando Aprovação': 'bg-yellow-100 text-yellow-700',
  'Programada': 'bg-violet-100 text-violet-700', 'Em Execução': 'bg-sky-100 text-sky-700',
  'Pausada': 'bg-orange-100 text-orange-700', 'Finalizada': 'bg-emerald-100 text-emerald-700',
  'Faturada': 'bg-teal-100 text-teal-700', 'Cancelada': 'bg-red-100 text-red-700',
};
const PRIORITY_BADGE: Record<OSPriority, string> = {
  'Crítica': 'bg-red-100 text-red-700 border border-red-200', 'Alta': 'bg-orange-100 text-orange-700 border border-orange-200',
  'Média': 'bg-blue-100 text-blue-700 border border-blue-200', 'Baixa': 'bg-slate-100 text-slate-600 border border-slate-200',
};
const PRIORITY_BORDER: Record<OSPriority, string> = {
  'Crítica': 'border-l-red-500', 'Alta': 'border-l-orange-400', 'Média': 'border-l-blue-400', 'Baixa': 'border-l-slate-300',
};

const TYPES: MaintenanceType[] = ['Corretiva', 'Preventiva', 'Preditiva', 'Melhoria'];
const PRIORITIES: OSPriority[] = ['Crítica', 'Alta', 'Média', 'Baixa'];
const CATEGORIES = ['Mecânica', 'Elétrica', 'Hidráulica', 'Predial', 'TI', 'Outros'];
const SECTORS = ['Produção', 'Manutenção', 'Administrativo', 'TI', 'RH', 'Logística'];

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (s?: string) => (s ? new Date(s.length === 10 ? s + 'T12:00:00' : s).toLocaleDateString('pt-BR') : '—');
const fmtDateTime = (s?: string) => (s ? new Date(s).toLocaleString('pt-BR') : '—');
const fmtHours = (h: number | null) => {
  if (h === null) return '—';
  if (h < 1) return `${Math.round(h * 60)}min`;
  if (h < 48) return `${h.toFixed(1).replace('.', ',')}h`;
  return `${(h / 24).toFixed(1).replace('.', ',')}d`;
};

function download(content: string, filename: string, mime: string) {
  const blob = new Blob(['﻿' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function toCSV(headers: string[], rows: (string | number)[][], name: string) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  download([headers.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';'))].join('\n'), `${name}.csv`, 'text/csv;charset=utf-8');
}
function toXLS(headers: string[], rows: (string | number)[][], name: string) {
  const esc = (v: string | number) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  download(`<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table border="1"><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></body></html>`, `${name}.xls`, 'application/vnd.ms-excel');
}

/* ================================================================== */
/* Página                                                              */
/* ================================================================== */
interface ServiceOrdersPageProps {
  currentUser: AppUser;
  requests: PurchaseRequest[];
  onCreatePurchaseRequest: (r: PurchaseRequest) => void;
}

export function ServiceOrdersPage({ currentUser, requests, onCreatePurchaseRequest }: ServiceOrdersPageProps) {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<ServiceOrder[]>(loadServiceOrders);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [duplicating, setDuplicating] = useState<ServiceOrder | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [view, setView] = useState<'kanban' | 'lista'>('kanban');

  // filtros — mesmo padrão da tela de Solicitações
  const [search, setSearch] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fPriority, setFPriority] = useState('');
  const [fTechnician, setFTechnician] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [fSector, setFSector] = useState('');
  const [fPeriod, setFPeriod] = useState('');
  const [fOverdue, setFOverdue] = useState(false);

  useEffect(() => { const t = setTimeout(() => setLoading(false), 350); return () => clearTimeout(t); }, []);

  // Busca do Supabase ao abrir a página — fonte da verdade quando online
  useEffect(() => {
    let cancelled = false;
    fetchServiceOrders().then((remote) => {
      if (cancelled || remote === null) return;
      setOrders(remote);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveServiceOrders(orders);
    const t = setTimeout(() => { upsertServiceOrders(orders); }, 800);
    return () => clearTimeout(t);
  }, [orders]);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  // alerta automático de O.S. atrasada (1x/dia por O.S.)
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    orders.filter(osIsOverdue).forEach((os) => {
      const key = `os-overdue-${os.id}-${today}`;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
      sendNotification({
        title: `⏰ ${os.number} — O.S. atrasada`,
        message: `"${os.title}" (${os.equipment.name}) venceu em ${fmtDate(os.dueDate)} e está em "${os.status}".`,
        priority: 4, tags: ['alarm_clock'],
      });
    });
  }, [orders]);

  const technicians = useMemo(() => [...new Set(orders.map((o) => o.technician).filter(Boolean))].sort(), [orders]);
  const hasFilters = search || fStatus || fPriority || fTechnician || fCategory || fSector || fPeriod || fOverdue;
  const clearFilters = () => { setSearch(''); setFStatus(''); setFPriority(''); setFTechnician(''); setFCategory(''); setFSector(''); setFPeriod(''); setFOverdue(false); };

  const filtered = useMemo(() => {
    const now = new Date();
    const start = fPeriod === '7d' ? new Date(now.getTime() - 7 * 86400000)
      : fPeriod === '30d' ? new Date(now.getTime() - 30 * 86400000)
      : fPeriod === 'mes' ? new Date(now.getFullYear(), now.getMonth(), 1)
      : fPeriod === 'ano' ? new Date(now.getFullYear(), 0, 1) : null;
    const q = search.trim().toLowerCase();
    return orders.filter((o) =>
      (!q || [o.number, o.title, o.customer ?? '', o.equipment.name, o.equipment.location ?? '', o.technician, o.requester].join(' ').toLowerCase().includes(q)) &&
      (!start || new Date(o.openedAt) >= start) &&
      (!fStatus || o.status === fStatus) &&
      (!fPriority || o.priority === fPriority) &&
      (!fTechnician || o.technician === fTechnician) &&
      (!fCategory || o.category === fCategory) &&
      (!fSector || o.costCenter === fSector) &&
      (!fOverdue || osIsOverdue(o))
    );
  }, [orders, search, fStatus, fPriority, fTechnician, fCategory, fSector, fPeriod, fOverdue]);

  /* ------------- Indicadores resumidos (cabeçalho) ------------- */
  const stats = useMemo(() => {
    const open = filtered.filter((o) => !osIsClosed(o)).length;
    return [
      { label: 'Total de O.S.', value: String(filtered.length), icon: ClipboardList, color: 'text-violet-600', bg: 'bg-violet-50', tip: 'Total de ordens no filtro atual.' },
      { label: 'Em Aberto', value: String(open), icon: FolderOpen, color: 'text-blue-600', bg: 'bg-blue-50', tip: 'Ordens que ainda não foram finalizadas, faturadas ou canceladas.' },
      { label: 'Em Execução', value: String(filtered.filter((o) => o.status === 'Em Execução').length), icon: Loader2, color: 'text-sky-600', bg: 'bg-sky-50', tip: 'Ordens com trabalho em andamento.' },
      { label: 'Aguard. Aprovação', value: String(filtered.filter((o) => o.status === 'Aguardando Aprovação').length), icon: ShieldAlert, color: 'text-amber-600', bg: 'bg-amber-50', tip: 'Aguardando aprovação do gestor.' },
      { label: 'Finalizadas', value: String(filtered.filter((o) => o.status === 'Finalizada' || o.status === 'Faturada').length), icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', tip: 'Finalizadas e faturadas.' },
      { label: 'Atrasadas', value: String(filtered.filter(osIsOverdue).length), icon: AlarmClock, color: 'text-red-600', bg: 'bg-red-50', tip: 'Ordens em aberto com prazo vencido.' },
      { label: 'Canceladas', value: String(filtered.filter((o) => o.status === 'Cancelada').length), icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', tip: 'Canceladas com justificativa.' },
      { label: 'Valor Total', value: fmtBRL(filtered.reduce((s, o) => s + osCost(o), 0)), icon: DollarSign, color: 'text-emerald-700', bg: 'bg-emerald-50', tip: 'Custo executado (materiais + mão de obra) das O.S. filtradas.' },
    ];
  }, [filtered]);

  /* --------------------- Mutações --------------------- */
  const updateOrder = (id: string, fn: (o: ServiceOrder) => ServiceOrder) =>
    setOrders((prev) => prev.map((o) => (o.id === id ? fn(o) : o)));

  const addEvent = (o: ServiceOrder, action: string, from?: OSStatus, to?: OSStatus): ServiceOrder => ({
    ...o,
    history: [...o.history, { id: `e-${Date.now()}`, date: new Date().toISOString(), user: currentUser.name, action, from, to }],
  });

  const handleCreate = (os: ServiceOrder) => {
    setOrders((prev) => [os, ...prev]);
    sendNotification({
      title: `🛠️ Nova O.S. ${os.number}`,
      message: `${os.requester} abriu "${os.title}" (${os.equipment.name || 'sem equipamento'}). Prioridade: ${os.priority}.`,
      priority: os.priority === 'Crítica' ? 5 : os.priority === 'Alta' ? 4 : 3, tags: ['hammer_and_wrench'],
    });
    showToast(`${os.number} criada`);
    setShowNew(false);
    setDuplicating(null);
  };

  const canAdvanceFrom = (status: OSStatus): boolean => {
    if (status === 'Faturada' || status === 'Cancelada' || status === 'Pausada') return false;
    if (status === 'Aguardando Aprovação') return currentUser.role === 'gestor';
    // Finalizada → Faturada e demais transições: comprador ou gestor
    return currentUser.role === 'comprador' || currentUser.role === 'gestor';
  };

  const handleAdvance = (id: string) => {
    const os = orders.find((o) => o.id === id);
    if (!os) return;
    const idx = OS_FLOW.indexOf(os.status);
    if (idx === -1 || idx >= OS_FLOW.length - 1 || !canAdvanceFrom(os.status)) return;
    const next = OS_FLOW[idx + 1];
    updateOrder(id, (o) => addEvent({
      ...o,
      status: next,
      startedAt: next === 'Em Execução' && !o.startedAt ? new Date().toISOString() : o.startedAt,
      completedAt: next === 'Finalizada' ? new Date().toISOString() : o.completedAt,
    }, os.status === 'Aguardando Aprovação' ? 'O.S. aprovada' : 'Status alterado', os.status, next));
    sendNotification({
      title: next === 'Finalizada' ? `✅ ${os.number} — Finalizada` : `🛠️ ${os.number} — ${next}`,
      message: `"${os.title}" avançou para "${next}".`, priority: 3,
      tags: [next === 'Finalizada' ? 'white_check_mark' : 'gear'],
    });
  };

  const handlePauseResume = (id: string) => {
    const os = orders.find((o) => o.id === id);
    if (!os) return;
    if (os.status === 'Pausada') {
      const back = os.pausedFrom ?? 'Em Execução';
      updateOrder(id, (o) => addEvent({ ...o, status: back, pausedFrom: undefined }, 'O.S. retomada', 'Pausada', back));
      sendNotification({ title: `▶️ ${os.number} — Retomada`, message: `"${os.title}" voltou para "${back}".`, priority: 3, tags: ['arrow_forward'] });
    } else if (os.status === 'Em Execução') {
      updateOrder(id, (o) => addEvent({ ...o, status: 'Pausada', pausedFrom: os.status }, 'O.S. pausada', os.status, 'Pausada'));
      sendNotification({ title: `⏸️ ${os.number} — Pausada`, message: `"${os.title}" foi pausada.`, priority: 3, tags: ['pause_button'] });
    }
  };

  const handleCancel = (id: string, reason: string) => {
    const os = orders.find((o) => o.id === id);
    if (!os) return;
    updateOrder(id, (o) => addEvent({ ...o, status: 'Cancelada', cancelReason: reason, cancelledBy: currentUser.name }, `O.S. cancelada — Motivo: ${reason}`, os.status, 'Cancelada'));
    sendNotification({ title: `🚫 ${os.number} — Cancelada`, message: `${currentUser.name} cancelou "${os.title}". Motivo: ${reason}`, priority: 3, tags: ['no_entry'] });
    setSelectedId(null);
  };

  const handleRequestParts = (os: ServiceOrder) => {
    const now = new Date().toISOString();
    const number = generateRequestNumber(now, requests.map((r) => r.number));
    const prio = os.priority === 'Crítica' ? 'Máquina Parada' : os.priority === 'Alta' ? 'Urgente' : 'Não Urgente';
    const req: PurchaseRequest = {
      id: crypto.randomUUID(), number,
      requester: currentUser.name, requesterInitials: currentUser.initials,
      sector: 'Manutenção', priority: prio, status: 'Nova Solicitação',
      createdAt: now, deliveryForecast: os.dueDate || now.slice(0, 10),
      items: (os.materials.length > 0 ? os.materials : [{ id: 'm0', product: `Peças para ${os.title}`, code: '', quantity: 1, unit: 'un', unitValue: 0 }]).map((m, i) => ({
        id: `item-${Date.now()}-${i}`, description: m.product, quantity: m.quantity,
        application: 'Manutenção Geral', priority: prio, deliveryForecast: os.dueDate || now.slice(0, 10),
        observations: `Gerado pela ${os.number} — ${os.equipment.name}`,
      })),
      observations: `Solicitação gerada automaticamente pela Ordem de Serviço ${os.number} ("${os.title}").`,
      history: [{ id: `h-${Date.now()}`, date: now, user: currentUser.name, action: `Solicitação criada a partir da O.S. ${os.number}`, to: 'Nova Solicitação' }],
    };
    onCreatePurchaseRequest(req);
    updateOrder(os.id, (o) => addEvent({ ...o, purchaseRequestId: req.id }, `Solicitação de compra ${number} gerada para as peças`));
    sendNotification({ title: `🛒 ${number} gerada pela ${os.number}`, message: `Peças da O.S. "${os.title}" solicitadas ao módulo de Compras.`, priority: 4, tags: ['shopping_cart'] });
    showToast(`Solicitação ${number} criada no Kanban de Compras`);
  };

  const exportAll = (kind: 'csv' | 'xls') => {
    const headers = ['Nº O.S.', 'Abertura', 'Cliente', 'Título', 'Equipamento', 'Local', 'Técnico', 'Categoria', 'Prioridade', 'Status', 'Valor Estimado', 'Valor Executado', 'Prazo', 'Última Atualização'];
    const rows = filtered.map((o) => [
      o.number, fmtDate(o.openedAt), o.customer ?? '—', o.title, o.equipment.name, o.equipment.location ?? '—',
      o.technician || '—', o.category, o.priority, o.status,
      o.estimatedValue ? fmtBRL(o.estimatedValue) : '—', fmtBRL(osCost(o)), fmtDate(o.dueDate), fmtDateTime(osLastUpdate(o)),
    ]);
    (kind === 'csv' ? toCSV : toXLS)(headers, rows, 'ordens-de-servico');
    showToast(`Exportação ${kind.toUpperCase()} gerada`);
  };

  const refresh = () => {
    setOrders(loadServiceOrders());
    showToast('Dados atualizados');
  };

  const selected = orders.find((o) => o.id === selectedId);

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen lg:pl-60 bg-slate-50">
        <Header title="Ordens de Serviço" subtitle="Acompanhe o ciclo completo das ordens de serviço" requests={requests} />
        <div className="flex-1 pt-16 px-6 py-6 space-y-5 animate-pulse" aria-busy="true">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 bg-slate-200/60 rounded-2xl" />)}
          </div>
          <div className="h-12 bg-slate-200/60 rounded-2xl" />
          <div className="flex gap-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-72 w-72 bg-slate-200/60 rounded-2xl" />)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen lg:pl-60 bg-slate-50">
      <Header title="Ordens de Serviço" subtitle="Acompanhe o ciclo completo das ordens de serviço" requests={requests} />

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-800 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          <CheckCircle2 size={15} className="text-emerald-400" /> {toast}
        </div>
      )}

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

        {/* Barra de filtros — mesmo padrão da tela de Solicitações */}
        <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nº, cliente, equipamento, técnico..." aria-label="Buscar O.S."
                className="pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg w-72 focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
            {([
              [fStatus, setFStatus, OS_COLUMNS.map((s) => [s, s]), 'Status'],
              [fPriority, setFPriority, PRIORITIES.map((p) => [p, p]), 'Prioridade'],
              [fTechnician, setFTechnician, technicians.map((t) => [t, t]), 'Técnico'],
              [fCategory, setFCategory, CATEGORIES.map((c) => [c, c]), 'Categoria'],
              [fSector, setFSector, SECTORS.map((s) => [s, s]), 'Centro de custo'],
              [fPeriod, setFPeriod, [['7d', 'Últimos 7 dias'], ['30d', 'Últimos 30 dias'], ['mes', 'Este mês'], ['ano', 'Este ano']], 'Período'],
            ] as [string, (v: string) => void, string[][], string][]).map(([value, setter, options, label]) => (
              <select key={label} value={value} onChange={(e) => setter(e.target.value)} aria-label={label}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500">
                <option value="">{label}</option>
                {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ))}
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer px-1">
              <input type="checkbox" checked={fOverdue} onChange={(e) => setFOverdue(e.target.checked)} className="accent-red-500" />
              Só atrasadas
            </label>
            {hasFilters && (
              <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium transition-colors">
                <FilterX size={13} /> Limpar filtros
              </button>
            )}
            <span className="ml-auto text-xs text-slate-400">{filtered.length} de {orders.length} O.S.</span>
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
            <button onClick={() => window.print()} className="flex items-center gap-1 text-xs text-slate-500 border border-slate-200 rounded-lg px-2.5 py-2 hover:bg-slate-50">
              <Printer size={13} /> Imprimir
            </button>
            <button onClick={refresh} className="flex items-center gap-1 text-xs text-slate-500 border border-slate-200 rounded-lg px-2.5 py-2 hover:bg-slate-50">
              <RefreshCw size={13} /> Atualizar
            </button>
            <button onClick={() => setShowNew(true)}
              className="ml-auto flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm shadow-violet-200">
              <Plus size={15} /> Nova Ordem de Serviço
            </button>
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center">
            <HardHat size={30} className="text-slate-300 mx-auto mb-3" />
            <h3 className="font-semibold text-slate-700 mb-1">Nenhuma Ordem de Serviço</h3>
            <p className="text-sm text-slate-400 mb-4">Crie a primeira O.S. para começar a acompanhar manutenções e serviços.</p>
            <button onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Plus size={15} /> Criar primeira O.S.
            </button>
          </div>
        ) : view === 'kanban' ? (
          <div className="overflow-x-auto -mx-4 md:-mx-6 px-4 md:px-6">
            <div className="flex gap-4 min-w-max pb-4">
              {OS_COLUMNS.map((status) => {
                const colOrders = filtered.filter((o) => o.status === status);
                return (
                  <KanbanColumnShell key={status} label={status} count={colOrders.length}
                    dotClass={COLUMN_DOT[status]} bgClass={COLUMN_BG[status]}>
                    {colOrders.map((o) => <OSKanbanCard key={o.id} os={o} onClick={() => setSelectedId(o.id)} />)}
                  </KanbanColumnShell>
                );
              })}
            </div>
          </div>
        ) : (
          <OrdersTable orders={filtered} onView={setSelectedId} onAdvance={handleAdvance} canAdvanceFrom={canAdvanceFrom} />
        )}
      </div>

      {(showNew || duplicating) && (
        <NewOSModal
          currentUser={currentUser}
          existingNumbers={orders.map((o) => o.number)}
          base={duplicating}
          onClose={() => { setShowNew(false); setDuplicating(null); }}
          onCreate={handleCreate}
        />
      )}

      {selected && (
        <OSDrawer
          os={selected}
          currentUser={currentUser}
          onClose={() => setSelectedId(null)}
          onAdvance={handleAdvance}
          canAdvanceFrom={canAdvanceFrom}
          onCancel={handleCancel}
          onPauseResume={handlePauseResume}
          onDuplicate={() => { setDuplicating(selected); setSelectedId(null); }}
          onUpdate={(fn) => updateOrder(selected.id, fn)}
          onRequestParts={() => handleRequestParts(selected)}
          addEvent={addEvent}
        />
      )}
    </div>
  );
}

/* ================================================================== */
/* Card do Kanban — mesmo padrão visual do KanbanCard de Compras       */
/* ================================================================== */
function OSKanbanCard({ os, onClick }: { os: ServiceOrder; onClick: () => void }) {
  const isCancelled = os.status === 'Cancelada';
  const overdue = osIsOverdue(os);
  const cost = osCost(os);
  const initials = os.requester.trim().slice(0, 2).toUpperCase();
  return (
    <div onClick={onClick}
      className={`bg-white rounded-xl border border-slate-200 border-l-4 ${isCancelled ? 'border-l-slate-300 opacity-70' : PRIORITY_BORDER[os.priority]} p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group ${overdue ? 'ring-1 ring-red-300' : ''} ${os.status === 'Aguardando Aprovação' ? 'ring-1 ring-yellow-300' : ''}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_BADGE[os.priority]}`}>
          {os.priority === 'Crítica' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
          {os.priority}
        </span>
        <span className="text-xs font-bold text-slate-400 group-hover:text-violet-600 transition-colors">{os.number}</span>
      </div>

      <p className="text-sm font-semibold text-slate-800 mb-1 line-clamp-2">{os.title}</p>
      {os.customer && <p className="text-xs text-slate-400 mb-1">Cliente: {os.customer}</p>}

      {os.equipment.name && (
        <div className="flex items-center gap-1 mb-2 bg-violet-50 rounded-lg px-2 py-1">
          <Wrench size={11} className="text-violet-500 flex-shrink-0" />
          <span className="text-xs text-violet-700 font-medium truncate">{os.equipment.name}</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 mb-2">
        <HardHat size={12} className="text-slate-300" />
        <span className="text-xs text-slate-500">{os.technician || 'Sem técnico'} · {os.category}</span>
      </div>

      {overdue && (
        <div className="mb-2 px-2 py-1 bg-red-50 border border-red-200 rounded-lg flex items-center gap-1.5">
          <AlarmClock size={11} className="text-red-500 flex-shrink-0" />
          <p className="text-xs text-red-700 font-medium">Atrasada — prazo {fmtDate(os.dueDate)}</p>
        </div>
      )}

      {os.status === 'Aguardando Aprovação' && (
        <div className="mb-2 px-2 py-1 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-yellow-700 font-medium">⏳ Aguardando aprovação do gestor</p>
        </div>
      )}

      {os.status === 'Pausada' && (
        <div className="mb-2 px-2 py-1 bg-orange-50 border border-orange-200 rounded-lg flex items-center gap-1.5">
          <Pause size={11} className="text-orange-500 flex-shrink-0" />
          <p className="text-xs text-orange-700 font-medium">Execução pausada</p>
        </div>
      )}

      {os.purchaseRequestId && (
        <div className="mb-2 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-1.5">
          <ShoppingCart size={11} className="text-emerald-600 flex-shrink-0" />
          <p className="text-xs text-emerald-700 font-medium">Peças solicitadas no Compras</p>
        </div>
      )}

      {isCancelled && (
        <div className="mb-2 px-2 py-1 bg-slate-100 border border-slate-200 rounded-lg">
          <p className="text-xs text-slate-500 font-medium">Cancelada{os.cancelledBy ? ` por ${os.cancelledBy}` : ''}</p>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
            style={{ backgroundColor: colorFromInitials(initials) }}>{initials}</span>
          <span className="text-xs text-slate-600 font-medium">{os.requester.split(' ')[0]}</span>
        </div>
        <div className={`flex items-center gap-1 ${overdue ? 'text-red-500' : 'text-slate-400'}`}>
          <Calendar size={11} />
          <span className="text-xs font-medium">{fmtDate(os.dueDate)}</span>
        </div>
      </div>

      {(cost > 0 || os.estimatedValue) && (
        <div className="mt-2 pt-2 border-t border-slate-50 flex items-center justify-between">
          {os.estimatedValue ? (
            <span className="text-[10px] text-slate-400">Est.: {fmtBRL(os.estimatedValue)}</span>
          ) : <span />}
          {cost > 0 && (
            <span className="flex items-center gap-1 text-xs font-semibold text-violet-600">
              <DollarSign size={11} className="text-violet-400" />{fmtBRL(cost)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* Tabela — mesmo padrão da tela de Solicitações                       */
/* ================================================================== */
function OrdersTable({ orders, onView, onAdvance, canAdvanceFrom }: {
  orders: ServiceOrder[]; onView: (id: string) => void; onAdvance: (id: string) => void; canAdvanceFrom: (s: OSStatus) => boolean;
}) {
  const [sortKey, setSortKey] = useState<string>('openedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [hidden, setHidden] = useState<Set<string>>(new Set(['local', 'ultima']));
  const [showCols, setShowCols] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const PAGE = 10;

  const columns: { key: string; label: string; value: (o: ServiceOrder) => string | number; render?: (o: ServiceOrder) => React.ReactNode; align?: 'right' }[] = [
    { key: 'number', label: 'Nº O.S.', value: (o) => o.number, render: (o) => <span className="font-semibold text-slate-700 whitespace-nowrap">{o.number}</span> },
    { key: 'openedAt', label: 'Abertura', value: (o) => o.openedAt, render: (o) => fmtDate(o.openedAt) },
    { key: 'customer', label: 'Cliente', value: (o) => o.customer ?? '—' },
    { key: 'title', label: 'Título', value: (o) => o.title, render: (o) => <span className="line-clamp-1">{o.title}</span> },
    { key: 'equipment', label: 'Equipamento', value: (o) => o.equipment.name || '—' },
    { key: 'local', label: 'Local', value: (o) => o.equipment.location ?? '—' },
    { key: 'technician', label: 'Técnico', value: (o) => o.technician || '—' },
    { key: 'category', label: 'Categoria', value: (o) => o.category },
    {
      key: 'priority', label: 'Prioridade', value: (o) => PRIORITIES.indexOf(o.priority),
      render: (o) => <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${PRIORITY_BADGE[o.priority]}`}>{o.priority}</span>,
    },
    {
      key: 'status', label: 'Status', value: (o) => o.status,
      render: (o) => <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_BADGE[o.status]}`}>{o.status}</span>,
    },
    { key: 'estimado', label: 'V. Estimado', value: (o) => o.estimatedValue ?? 0, render: (o) => (o.estimatedValue ? fmtBRL(o.estimatedValue) : '—'), align: 'right' },
    { key: 'executado', label: 'V. Executado', value: (o) => osCost(o), render: (o) => <span className="font-semibold text-slate-800">{fmtBRL(osCost(o))}</span>, align: 'right' },
    {
      key: 'dueDate', label: 'Prazo', value: (o) => o.dueDate,
      render: (o) => <span className={osIsOverdue(o) ? 'text-red-500 font-semibold' : ''}>{fmtDate(o.dueDate)}</span>,
    },
    { key: 'ultima', label: 'Última Atualização', value: (o) => osLastUpdate(o), render: (o) => fmtDateTime(osLastUpdate(o)) },
    { key: 'sla', label: 'SLA', value: (o) => o.slaHours, render: (o) => {
      const met = osSlaMet(o);
      return met === null ? <span className="text-xs text-slate-500">{o.slaHours}h</span>
        : <span className={`text-[11px] font-medium ${met ? 'text-emerald-600' : 'text-red-500'}`}>{met ? '✓ Cumprido' : '✗ Estourado'}</span>;
    } },
    { key: 'tempo', label: 'Tempo', value: (o) => osElapsedHours(o) ?? -1, render: (o) => fmtHours(osElapsedHours(o)), align: 'right' },
  ];

  const visible = columns.filter((c) => !hidden.has(c.key));

  const rows = useMemo(() => {
    const out = [...orders];
    const col = columns.find((c) => c.key === sortKey);
    if (col) out.sort((a, b) => {
      const va = col.value(a), vb = col.value(b);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE, safePage * PAGE);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
        <h3 className="font-semibold text-slate-700 text-sm mr-auto">Lista de Ordens de Serviço</h3>
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
              <th scope="col" className="px-3 py-2.5 w-8 bg-slate-50">
                <input type="checkbox" className="accent-violet-600" aria-label="Selecionar página"
                  checked={pageRows.length > 0 && pageRows.every((r) => selectedRows.has(r.id))}
                  onChange={() => setSelectedRows((prev) => {
                    const n = new Set(prev);
                    const all = pageRows.every((r) => n.has(r.id));
                    pageRows.forEach((r) => (all ? n.delete(r.id) : n.add(r.id)));
                    return n;
                  })} />
              </th>
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
              <tr><td colSpan={visible.length + 2} className="px-4 py-10 text-center text-xs text-slate-400">Nenhuma O.S. encontrada.</td></tr>
            ) : pageRows.map((o) => (
              <tr key={o.id} className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/70 transition-colors cursor-pointer ${selectedRows.has(o.id) ? 'bg-violet-50/40' : ''}`}
                onClick={() => onView(o.id)}>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" className="accent-violet-600" checked={selectedRows.has(o.id)} aria-label={`Selecionar ${o.number}`}
                    onChange={() => setSelectedRows((prev) => { const n = new Set(prev); if (n.has(o.id)) n.delete(o.id); else n.add(o.id); return n; })} />
                </td>
                {visible.map((c) => (
                  <td key={c.key} className={`px-3 py-2.5 text-xs text-slate-600 ${c.align === 'right' ? 'text-right' : ''}`}>
                    {c.render ? c.render(o) : c.value(o)}
                  </td>
                ))}
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <button onClick={() => onView(o.id)} title="Ver detalhes" aria-label={`Ver ${o.number}`}
                      className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg"><Eye size={13} /></button>
                    {canAdvanceFrom(o.status) && OS_FLOW.includes(o.status) && OS_FLOW.indexOf(o.status) < OS_FLOW.length - 1 && (
                      <button onClick={() => onAdvance(o.id)} title={`Avançar para ${OS_FLOW[OS_FLOW.indexOf(o.status) + 1]}`} aria-label={`Avançar ${o.number}`}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"><ArrowRight size={13} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 text-xs text-slate-500">
        <span>{rows.length} O.S.{selectedRows.size > 0 ? ` · ${selectedRows.size} selecionada(s)` : ''}</span>
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

/* ================================================================== */
/* Modal Nova O.S. (também usada para duplicar)                        */
/* ================================================================== */
function NewOSModal({ currentUser, existingNumbers, base, onClose, onCreate }: {
  currentUser: AppUser; existingNumbers: string[]; base?: ServiceOrder | null;
  onClose: () => void; onCreate: (os: ServiceOrder) => void;
}) {
  const users = loadUsers();
  const [f, setF] = useState({
    title: base?.title ?? '', description: base?.description ?? '', type: (base?.type ?? 'Corretiva') as MaintenanceType,
    category: base?.category ?? CATEGORIES[0], customer: base?.customer ?? '',
    equipName: base?.equipment.name ?? '', equipCode: base?.equipment.code ?? '', equipModel: base?.equipment.model ?? '',
    equipManufacturer: base?.equipment.manufacturer ?? '', equipSerial: base?.equipment.serial ?? '',
    equipPatrimony: base?.equipment.patrimony ?? '', equipLocation: base?.equipment.location ?? '',
    costCenter: base?.costCenter ?? SECTORS[1], technician: base?.technician ?? '',
    priority: (base?.priority ?? 'Média') as OSPriority, slaHours: String(base?.slaHours ?? 48),
    estimatedValue: base?.estimatedValue ? String(base.estimatedValue) : '',
    dueDate: '', observations: base?.observations ?? '',
    objectLink: base?.objectLink ?? '',
  });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const valid = f.title.trim() && f.dueDate && f.equipName.trim();

  const submit = () => {
    if (!valid) return;
    const now = new Date().toISOString();
    onCreate({
      id: crypto.randomUUID(),
      number: generateOSNumber(now, existingNumbers),
      title: f.title.trim(), description: f.description.trim(),
      type: f.type, category: f.category, customer: f.customer.trim() || undefined,
      equipment: { code: f.equipCode, name: f.equipName.trim(), model: f.equipModel, manufacturer: f.equipManufacturer, serial: f.equipSerial, patrimony: f.equipPatrimony, location: f.equipLocation },
      costCenter: f.costCenter, requester: currentUser.name, technician: f.technician,
      priority: f.priority, slaHours: Number(f.slaHours) || 48,
      estimatedValue: Number(f.estimatedValue) || undefined,
      openedAt: now, dueDate: f.dueDate, status: 'Aberta',
      observations: f.observations.trim() || undefined,
      objectLink: normalizeUrl(f.objectLink) ?? undefined,
      materials: [], labor: [], comments: [], checklist: [],
      history: [{ id: `e-${Date.now()}`, date: now, user: currentUser.name, action: base ? `O.S. criada (duplicada de ${base.number})` : 'O.S. criada', to: 'Aberta' }],
    });
  };

  const input = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white';
  const label = 'block text-xs font-medium text-slate-600 mb-1';

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-slate-800">{base ? `Duplicar ${base.number}` : 'Nova Ordem de Serviço'}</h3>
          <button onClick={onClose} aria-label="Fechar" className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="space-y-5">
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Dados da O.S.</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className={label}>Título <span className="text-red-500">*</span></label>
                <input value={f.title} onChange={(e) => set('title')(e.target.value)} className={input} placeholder="Ex.: Troca de rolamento da esteira 02" />
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Descrição</label>
                <textarea value={f.description} onChange={(e) => set('description')(e.target.value)} rows={2} className={`${input} resize-none`} placeholder="Descreva o problema ou serviço..." />
              </div>
              <div>
                <label className={label}>Cliente</label>
                <input value={f.customer} onChange={(e) => set('customer')(e.target.value)} className={input} placeholder="Cliente interno ou externo" />
              </div>
              <div>
                <label className={label}>Tipo de manutenção</label>
                <select value={f.type} onChange={(e) => set('type')(e.target.value)} className={input}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
              </div>
              <div>
                <label className={label}>Categoria</label>
                <select value={f.category} onChange={(e) => set('category')(e.target.value)} className={input}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
              </div>
              <div>
                <label className={label}>Prioridade</label>
                <select value={f.priority} onChange={(e) => set('priority')(e.target.value)} className={input}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select>
              </div>
              <div>
                <label className={label}>Centro de custo</label>
                <select value={f.costCenter} onChange={(e) => set('costCenter')(e.target.value)} className={input}>{SECTORS.map((s) => <option key={s}>{s}</option>)}</select>
              </div>
              <div>
                <label className={label}>Técnico responsável</label>
                <select value={f.technician} onChange={(e) => set('technician')(e.target.value)} className={input}>
                  <option value="">Não atribuído</option>
                  {users.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>SLA (horas)</label>
                <input type="number" min={1} value={f.slaHours} onChange={(e) => set('slaHours')(e.target.value)} className={input} />
              </div>
              <div>
                <label className={label}>Valor estimado (R$)</label>
                <input type="number" min={0} step="0.01" value={f.estimatedValue} onChange={(e) => set('estimatedValue')(e.target.value)} className={input} placeholder="0,00" />
              </div>
              <div>
                <label className={label}>Data prevista <span className="text-red-500">*</span></label>
                <input type="date" value={f.dueDate} onChange={(e) => set('dueDate')(e.target.value)} className={input} />
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Equipamento</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className={label}>Nome do equipamento <span className="text-red-500">*</span></label>
                <input value={f.equipName} onChange={(e) => set('equipName')(e.target.value)} className={input} placeholder="Ex.: Esteira transportadora linha 02" />
              </div>
              <div><label className={label}>Código</label><input value={f.equipCode} onChange={(e) => set('equipCode')(e.target.value)} className={input} /></div>
              <div><label className={label}>Modelo</label><input value={f.equipModel} onChange={(e) => set('equipModel')(e.target.value)} className={input} /></div>
              <div><label className={label}>Fabricante</label><input value={f.equipManufacturer} onChange={(e) => set('equipManufacturer')(e.target.value)} className={input} /></div>
              <div><label className={label}>Nº de série</label><input value={f.equipSerial} onChange={(e) => set('equipSerial')(e.target.value)} className={input} /></div>
              <div><label className={label}>Patrimônio</label><input value={f.equipPatrimony} onChange={(e) => set('equipPatrimony')(e.target.value)} className={input} /></div>
              <div className="sm:col-span-2"><label className={label}>Localização</label><input value={f.equipLocation} onChange={(e) => set('equipLocation')(e.target.value)} className={input} placeholder="Ex.: Galpão A — Linha 02" /></div>
            </div>
          </div>

          <div>
            <ObjectLinkInput value={f.objectLink} onChange={set('objectLink')} />
          </div>

          <div>
            <label className={label}>Observações</label>
            <textarea value={f.observations} onChange={(e) => set('observations')(e.target.value)} rows={2} className={`${input} resize-none`} />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancelar</button>
          <button onClick={submit} disabled={!valid}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-medium">
            <Plus size={15} /> {base ? 'Duplicar O.S.' : 'Criar O.S.'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Drawer de detalhes com abas                                         */
/* ================================================================== */
type DrawerTab = 'geral' | 'execucao' | 'comentarios' | 'historico';

function OSDrawer({ os, currentUser, onClose, onAdvance, canAdvanceFrom, onCancel, onPauseResume, onDuplicate, onUpdate, onRequestParts, addEvent }: {
  os: ServiceOrder; currentUser: AppUser; onClose: () => void;
  onAdvance: (id: string) => void; canAdvanceFrom: (s: OSStatus) => boolean;
  onCancel: (id: string, reason: string) => void;
  onPauseResume: (id: string) => void;
  onDuplicate: () => void;
  onUpdate: (fn: (o: ServiceOrder) => ServiceOrder) => void;
  onRequestParts: () => void;
  addEvent: (o: ServiceOrder, action: string, from?: OSStatus, to?: OSStatus) => ServiceOrder;
}) {
  const [tab, setTab] = useState<DrawerTab>('geral');
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [comment, setComment] = useState('');
  const [checkDraft, setCheckDraft] = useState('');
  const [mat, setMat] = useState({ product: '', code: '', quantity: '1', unit: 'un', unitValue: '' });
  const [lab, setLab] = useState({ technician: os.technician || '', hours: '', hourRate: '', extraHours: '0' });

  const idx = OS_FLOW.indexOf(os.status);
  const closed = osIsClosed(os);
  const canEdit = !closed && (currentUser.role === 'comprador' || currentUser.role === 'gestor');
  const canCancel = !closed && (currentUser.role === 'comprador' || currentUser.role === 'gestor');
  const cost = osCost(os);
  const matCost = os.materials.reduce((s, m) => s + m.quantity * m.unitValue, 0);

  const addMaterial = () => {
    if (!mat.product.trim() || !Number(mat.quantity)) return;
    onUpdate((o) => addEvent({
      ...o,
      materials: [...o.materials, { id: `m-${Date.now()}`, product: mat.product.trim(), code: mat.code, quantity: Number(mat.quantity), unit: mat.unit, unitValue: Number(mat.unitValue) || 0 }],
    }, `Material adicionado: ${mat.product.trim()} (${mat.quantity} ${mat.unit})`));
    setMat({ product: '', code: '', quantity: '1', unit: 'un', unitValue: '' });
  };

  const addLabor = () => {
    if (!lab.technician.trim() || !Number(lab.hours)) return;
    onUpdate((o) => addEvent({
      ...o,
      labor: [...o.labor, { id: `l-${Date.now()}`, technician: lab.technician.trim(), hours: Number(lab.hours), hourRate: Number(lab.hourRate) || 0, extraHours: Number(lab.extraHours) || 0 }],
    }, `Mão de obra registrada: ${lab.technician.trim()} (${lab.hours}h)`));
    setLab({ technician: os.technician || '', hours: '', hourRate: '', extraHours: '0' });
  };

  const addComment = () => {
    if (!comment.trim()) return;
    onUpdate((o) => ({
      ...o,
      comments: [...o.comments, { id: `c-${Date.now()}`, user: currentUser.name, text: comment.trim(), date: new Date().toISOString() }],
    }));
    setComment('');
  };

  const addCheckItem = () => {
    if (!checkDraft.trim()) return;
    onUpdate((o) => ({
      ...o,
      checklist: [...o.checklist, { id: `ck-${Date.now()}`, text: checkDraft.trim(), done: false }],
    }));
    setCheckDraft('');
  };

  const input = 'border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white';
  const tabs: { key: DrawerTab; label: string; icon: typeof Info }[] = [
    { key: 'geral', label: 'Visão Geral', icon: Info },
    { key: 'execucao', label: 'Execução e Custos', icon: Wrench },
    { key: 'comentarios', label: 'Comentários', icon: MessageSquare },
    { key: 'historico', label: 'Histórico', icon: Clock },
  ];

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex justify-end" onClick={onClose}>
      <div className="bg-slate-50 w-full max-w-3xl h-full overflow-y-auto shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Header do drawer */}
        <div className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="font-bold text-slate-800">Ordem de Serviço {os.number}</h2>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${PRIORITY_BADGE[os.priority]}`}>{os.priority}</span>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[os.status]}`}>{os.status}</span>
              {osIsOverdue(os) && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Atrasada</span>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={onDuplicate} title="Duplicar O.S." aria-label="Duplicar O.S."
                className="p-2 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg"><Copy size={15} /></button>
              <button onClick={() => printServiceOrder(os, currentUser.name)} title="Imprimir / Gerar PDF" aria-label="Imprimir O.S."
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-500 hover:text-violet-700 border border-slate-200 hover:border-violet-300 rounded-lg transition-colors">
                <Printer size={13} /> Imprimir
              </button>
              <button onClick={onClose} aria-label="Fechar" className="p-2 text-slate-400 hover:text-slate-600"><X size={17} /></button>
            </div>
          </div>
          <p className="text-sm text-slate-600 mt-1">{os.title}</p>

          {/* Stepper — mesmo padrão do modal de Solicitações */}
          <div className="flex items-center gap-1 mt-3 overflow-x-auto pb-1">
            {OS_FLOW.map((s, i) => (
              <Fragment key={s}>
                <div className="flex flex-col items-center min-w-[68px]">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ${
                    os.status === 'Cancelada' ? 'bg-slate-100 text-slate-300' :
                    i < idx ? 'bg-violet-100 text-violet-600' : i === idx ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-400'
                  }`}>{i + 1}</div>
                  <span className={`text-[8px] mt-1 text-center leading-tight ${i === idx && os.status !== 'Cancelada' ? 'text-violet-700 font-semibold' : 'text-slate-400'}`}>{s}</span>
                </div>
                {i < OS_FLOW.length - 1 && <div className={`flex-1 h-px min-w-[8px] ${i < idx ? 'bg-violet-300' : 'bg-slate-200'}`} />}
              </Fragment>
            ))}
          </div>

          {/* Abas */}
          <div className="flex gap-1 mt-3 -mb-4 border-b border-transparent">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setTab(key)} role="tab" aria-selected={tab === key}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2 ${
                  tab === key ? 'text-violet-700 border-violet-600 bg-violet-50/50' : 'text-slate-500 border-transparent hover:text-slate-700'
                }`}>
                <Icon size={13} /> {label}
                {key === 'comentarios' && os.comments.length > 0 && <span className="text-[9px] bg-violet-100 text-violet-700 rounded-full px-1.5">{os.comments.length}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 p-6 space-y-4">
          {os.status === 'Cancelada' && (
            <div className="rounded-xl p-4 border bg-red-50 border-red-200">
              <p className="text-sm text-red-700 font-semibold">Cancelada por {os.cancelledBy}</p>
              {os.cancelReason && <p className="text-xs text-red-600 mt-1">Motivo: {os.cancelReason}</p>}
            </div>
          )}

          {tab === 'geral' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5"><ClipboardList size={13} className="text-violet-600" /> Dados Gerais</h3>
                  <dl className="space-y-1.5 text-xs">
                    {[
                      ['Cliente', os.customer ?? '—'], ['Solicitante', os.requester], ['Técnico', os.technician || 'Não atribuído'],
                      ['Tipo', os.type], ['Categoria', os.category], ['Centro de custo', os.costCenter],
                      ['Abertura', fmtDateTime(os.openedAt)], ['Prazo', fmtDate(os.dueDate)],
                      ['Início execução', fmtDateTime(os.startedAt)], ['Conclusão', fmtDateTime(os.completedAt)],
                      ['SLA', `${os.slaHours}h`], ['Tempo decorrido', fmtHours(osElapsedHours(os))],
                      ['Valor estimado', os.estimatedValue ? fmtBRL(os.estimatedValue) : '—'],
                      ['Valor executado', fmtBRL(cost)],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <dt className="text-slate-400">{k}</dt>
                        <dd className="text-slate-700 font-medium text-right">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex justify-between gap-2 items-start mt-1.5 text-xs">
                    <span className="text-slate-400">Link do Objeto</span>
                    <ObjectLinkView
                      url={os.objectLink}
                      onSave={(url) => onUpdate((o) => addEvent({ ...o, objectLink: url },
                        url ? `Link do objeto ${o.objectLink ? 'alterado' : 'adicionado'}: ${url}` : 'Link do objeto removido'))}
                    />
                  </div>
                  {os.description && <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">{os.description}</p>}
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5"><Wrench size={13} className="text-violet-600" /> Equipamento</h3>
                  <dl className="space-y-1.5 text-xs">
                    {[
                      ['Nome', os.equipment.name], ['Código', os.equipment.code || '—'], ['Modelo', os.equipment.model || '—'],
                      ['Fabricante', os.equipment.manufacturer || '—'], ['Nº de série', os.equipment.serial || '—'],
                      ['Patrimônio', os.equipment.patrimony || '—'], ['Localização', os.equipment.location || '—'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <dt className="text-slate-400">{k}</dt>
                        <dd className="text-slate-700 font-medium text-right">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5 text-[11px] text-slate-400">
                    <p className="flex items-center gap-1.5"><Paperclip size={11} /> Anexos e laudos — habilitados com o backend</p>
                    <p className="flex items-center gap-1.5"><Camera size={11} /> Registro fotográfico antes/depois — habilitado com o backend</p>
                    <p className="flex items-center gap-1.5"><PenLine size={11} /> Assinatura digital — habilitada com o backend</p>
                  </div>
                </div>
              </div>

              {/* Integração com Compras */}
              {['Programada', 'Em Execução', 'Pausada'].includes(os.status) && !os.purchaseRequestId && (currentUser.role === 'comprador' || currentUser.role === 'gestor') && (
                <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-violet-800">Solicitar peças ao módulo de Compras</p>
                    <p className="text-xs text-violet-600 mt-0.5">Gera automaticamente uma solicitação no Kanban com os materiais desta O.S.</p>
                  </div>
                  <button onClick={onRequestParts}
                    className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                    <ShoppingCart size={14} /> Gerar Solicitação
                  </button>
                </div>
              )}
              {os.purchaseRequestId && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  <p className="text-xs text-emerald-700">Solicitação de compra gerada para esta O.S. — acompanhe no Kanban de Compras.</p>
                </div>
              )}
            </>
          )}

          {tab === 'execucao' && (
            <>
              {/* Checklist */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5"><ListChecks size={13} className="text-violet-600" /> Checklist</h3>
                {os.checklist.length === 0 ? (
                  <p className="text-xs text-slate-400 mb-3">Nenhum item no checklist.</p>
                ) : (
                  <div className="space-y-1.5 mb-3">
                    {os.checklist.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer group">
                        <input type="checkbox" checked={c.done} className="accent-violet-600"
                          onChange={() => onUpdate((o) => ({ ...o, checklist: o.checklist.map((x) => x.id === c.id ? { ...x, done: !x.done } : x) }))} />
                        <span className={c.done ? 'line-through text-slate-400' : ''}>{c.text}</span>
                        {canEdit && (
                          <button onClick={(e) => { e.preventDefault(); onUpdate((o) => ({ ...o, checklist: o.checklist.filter((x) => x.id !== c.id) })); }}
                            aria-label={`Remover ${c.text}`} className="ml-auto text-slate-200 group-hover:text-red-400"><Trash2 size={11} /></button>
                        )}
                      </label>
                    ))}
                  </div>
                )}
                {canEdit && (
                  <div className="flex gap-2">
                    <input value={checkDraft} onChange={(e) => setCheckDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addCheckItem(); }}
                      placeholder="Adicionar item ao checklist..." aria-label="Novo item do checklist"
                      className={`${input} flex-1`} />
                    <button onClick={addCheckItem} className="flex items-center gap-1 text-xs text-violet-600 border border-violet-200 hover:border-violet-400 px-2.5 py-1.5 rounded-lg font-medium"><Plus size={12} /> Adicionar</button>
                  </div>
                )}
                {os.checklist.length > 0 && (
                  <p className="text-[11px] text-slate-400 mt-2">{os.checklist.filter((c) => c.done).length} de {os.checklist.length} concluído(s)</p>
                )}
              </div>

              {/* Materiais */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5"><ShoppingCart size={13} className="text-violet-600" /> Materiais Utilizados</h3>
                  <span className="text-xs font-bold text-slate-800">{fmtBRL(matCost)}</span>
                </div>
                {os.materials.length === 0 ? <p className="text-xs text-slate-400 mb-3">Nenhum material lançado.</p> : (
                  <table className="w-full text-left mb-3">
                    <thead><tr className="border-b border-slate-100">
                      {['Produto', 'Código', 'Qtd', 'Un.', 'V. Unit.', 'Total', ''].map((h) => <th key={h} className="py-1.5 pr-2 text-[10px] font-semibold text-slate-400">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {os.materials.map((m) => (
                        <tr key={m.id} className="border-b border-slate-50 last:border-0">
                          <td className="py-1.5 pr-2 text-xs text-slate-700">{m.product}</td>
                          <td className="py-1.5 pr-2 text-xs text-slate-400">{m.code || '—'}</td>
                          <td className="py-1.5 pr-2 text-xs">{m.quantity}</td>
                          <td className="py-1.5 pr-2 text-xs">{m.unit}</td>
                          <td className="py-1.5 pr-2 text-xs">{fmtBRL(m.unitValue)}</td>
                          <td className="py-1.5 pr-2 text-xs font-semibold">{fmtBRL(m.quantity * m.unitValue)}</td>
                          <td className="py-1.5 text-right">
                            {canEdit && (
                              <button onClick={() => onUpdate((o) => addEvent({ ...o, materials: o.materials.filter((x) => x.id !== m.id) }, `Material removido: ${m.product}`))}
                                aria-label={`Remover ${m.product}`} className="text-slate-300 hover:text-red-500"><Trash2 size={12} /></button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {canEdit && (
                  <div className="flex flex-wrap gap-2 items-end">
                    <input value={mat.product} onChange={(e) => setMat({ ...mat, product: e.target.value })} placeholder="Produto" className={`${input} flex-1 min-w-[120px]`} aria-label="Produto" />
                    <input value={mat.code} onChange={(e) => setMat({ ...mat, code: e.target.value })} placeholder="Código" className={`${input} w-20`} aria-label="Código" />
                    <input type="number" min={1} value={mat.quantity} onChange={(e) => setMat({ ...mat, quantity: e.target.value })} className={`${input} w-16`} aria-label="Quantidade" />
                    <select value={mat.unit} onChange={(e) => setMat({ ...mat, unit: e.target.value })} className={input} aria-label="Unidade">
                      {['un', 'pç', 'kg', 'm', 'L', 'cx'].map((u) => <option key={u}>{u}</option>)}
                    </select>
                    <input type="number" min={0} step="0.01" value={mat.unitValue} onChange={(e) => setMat({ ...mat, unitValue: e.target.value })} placeholder="R$ unit." className={`${input} w-24`} aria-label="Valor unitário" />
                    <button onClick={addMaterial} className="flex items-center gap-1 text-xs text-violet-600 border border-violet-200 hover:border-violet-400 px-2.5 py-1.5 rounded-lg font-medium"><Plus size={12} /> Lançar</button>
                  </div>
                )}
              </div>

              {/* Mão de obra */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5"><HardHat size={13} className="text-violet-600" /> Mão de Obra e Horas</h3>
                  <span className="text-xs font-bold text-slate-800">{fmtBRL(cost - matCost)}</span>
                </div>
                {os.labor.length === 0 ? <p className="text-xs text-slate-400 mb-3">Nenhuma hora lançada.</p> : (
                  <table className="w-full text-left mb-3">
                    <thead><tr className="border-b border-slate-100">
                      {['Técnico', 'Horas', 'R$/h', 'H. extras', 'Total', ''].map((h) => <th key={h} className="py-1.5 pr-2 text-[10px] font-semibold text-slate-400">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {os.labor.map((l) => (
                        <tr key={l.id} className="border-b border-slate-50 last:border-0">
                          <td className="py-1.5 pr-2 text-xs text-slate-700">{l.technician}</td>
                          <td className="py-1.5 pr-2 text-xs">{l.hours}h</td>
                          <td className="py-1.5 pr-2 text-xs">{fmtBRL(l.hourRate)}</td>
                          <td className="py-1.5 pr-2 text-xs">{l.extraHours}h</td>
                          <td className="py-1.5 pr-2 text-xs font-semibold">{fmtBRL(l.hours * l.hourRate + l.extraHours * l.hourRate * 1.5)}</td>
                          <td className="py-1.5 text-right">
                            {canEdit && (
                              <button onClick={() => onUpdate((o) => addEvent({ ...o, labor: o.labor.filter((x) => x.id !== l.id) }, `Mão de obra removida: ${l.technician}`))}
                                aria-label={`Remover ${l.technician}`} className="text-slate-300 hover:text-red-500"><Trash2 size={12} /></button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {canEdit && (
                  <div className="flex flex-wrap gap-2 items-end">
                    <input value={lab.technician} onChange={(e) => setLab({ ...lab, technician: e.target.value })} placeholder="Técnico" className={`${input} flex-1 min-w-[120px]`} aria-label="Técnico" />
                    <input type="number" min={0} step="0.5" value={lab.hours} onChange={(e) => setLab({ ...lab, hours: e.target.value })} placeholder="Horas" className={`${input} w-20`} aria-label="Horas" />
                    <input type="number" min={0} step="0.01" value={lab.hourRate} onChange={(e) => setLab({ ...lab, hourRate: e.target.value })} placeholder="R$/h" className={`${input} w-20`} aria-label="Valor por hora" />
                    <input type="number" min={0} step="0.5" value={lab.extraHours} onChange={(e) => setLab({ ...lab, extraHours: e.target.value })} placeholder="H. extras" className={`${input} w-20`} aria-label="Horas extras" />
                    <button onClick={addLabor} className="flex items-center gap-1 text-xs text-violet-600 border border-violet-200 hover:border-violet-400 px-2.5 py-1.5 rounded-lg font-medium"><Plus size={12} /> Lançar</button>
                  </div>
                )}
                <p className="text-[11px] text-slate-400 mt-2">Registro de deslocamento — habilitado com o backend.</p>
                <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between text-sm">
                  <span className="font-semibold text-slate-600">Custo total da O.S. (atualizado automaticamente)</span>
                  <span className="font-bold text-violet-700">{fmtBRL(cost)}</span>
                </div>
              </div>
            </>
          )}

          {tab === 'comentarios' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5"><MessageSquare size={13} className="text-violet-600" /> Comentários Internos</h3>
              <div className="space-y-2.5 mb-3 max-h-[50vh] overflow-y-auto">
                {os.comments.length === 0 && <p className="text-xs text-slate-400">Nenhum comentário ainda.</p>}
                {os.comments.map((c) => (
                  <div key={c.id} className="flex gap-2.5">
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: colorFromInitials(c.user.slice(0, 2).toUpperCase()) }}>
                      {c.user.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="bg-slate-50 rounded-xl px-3 py-2 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-700">{c.user}</span>
                        <span className="text-[10px] text-slate-400">{fmtDateTime(c.date)}</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-wrap">{c.text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={comment} onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addComment(); }}
                  placeholder="Escreva um comentário..." aria-label="Comentário"
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                <button onClick={addComment} disabled={!comment.trim()}
                  className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white px-3.5 py-2 rounded-lg text-sm font-medium">Enviar</button>
              </div>
            </div>
          )}

          {tab === 'historico' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5"><Clock size={13} className="text-violet-600" /> Linha do Tempo / Auditoria</h3>
              <div className="space-y-3">
                {[...os.history].reverse().map((e) => (
                  <div key={e.id} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Clock size={10} className="text-violet-600" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-700">
                        <strong>{e.user}</strong> — {e.action}
                        {e.from && e.to && <span className="text-slate-400"> ({e.from} → {e.to})</span>}
                      </p>
                      <p className="text-[10px] text-slate-400">{fmtDateTime(e.date)} · IP e dispositivo registrados pelo backend</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4">
          {cancelling && (
            <div className="mb-3 bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-red-700 mb-2">Cancelar O.S. — informe o motivo (obrigatório)</p>
              <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2} autoFocus
                className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none bg-white" />
              <div className="flex gap-2 mt-2">
                <button onClick={() => { if (cancelReason.trim()) onCancel(os.id, cancelReason.trim()); }} disabled={!cancelReason.trim()}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg text-xs font-medium">Confirmar Cancelamento</button>
                <button onClick={() => { setCancelling(false); setCancelReason(''); }} className="text-xs text-slate-500 px-3 py-1.5">Voltar</button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Fechar</button>
              {canCancel && !cancelling && (
                <button onClick={() => setCancelling(true)} className="px-4 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg font-medium border border-red-200">Cancelar O.S.</button>
              )}
              {(os.status === 'Em Execução' || os.status === 'Pausada') && canEdit && (
                <button onClick={() => onPauseResume(os.id)}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm text-orange-600 hover:bg-orange-50 rounded-lg font-medium border border-orange-200">
                  {os.status === 'Pausada' ? <><Play size={14} /> Retomar</> : <><Pause size={14} /> Pausar</>}
                </button>
              )}
            </div>
            {closed ? (
              <span className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
                os.status === 'Cancelada' ? 'bg-red-100 text-red-700' : os.status === 'Faturada' ? 'bg-teal-100 text-teal-700' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {os.status === 'Cancelada' ? <><XCircle size={15} /> O.S. Cancelada</> :
                 os.status === 'Faturada' ? <><CheckCircle2 size={15} /> O.S. Faturada</> :
                 <><CheckCircle2 size={15} /> O.S. Finalizada</>}
                {os.status === 'Finalizada' && canAdvanceFrom(os.status) && (
                  <button onClick={() => onAdvance(os.id)} className="ml-2 underline text-xs">Faturar →</button>
                )}
              </span>
            ) : os.status === 'Pausada' ? (
              <span className="flex items-center gap-2 bg-orange-100 text-orange-700 px-4 py-2 rounded-lg text-sm font-medium">
                <Pause size={15} /> Execução pausada
              </span>
            ) : os.status === 'Aguardando Aprovação' && currentUser.role !== 'gestor' ? (
              <span className="flex items-center gap-2 bg-yellow-100 text-yellow-700 px-4 py-2 rounded-lg text-sm font-medium">
                <ShieldAlert size={15} /> Aguardando aprovação do gestor
              </span>
            ) : canAdvanceFrom(os.status) && idx >= 0 && idx < OS_FLOW.length - 1 ? (
              <button onClick={() => onAdvance(os.id)}
                className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-5 py-2 rounded-lg text-sm font-medium shadow-sm shadow-violet-200">
                {os.status === 'Aguardando Aprovação' ? <><ShieldAlert size={15} /> Aprovar e Avançar</> : <><ArrowRight size={15} /> Avançar para {OS_FLOW[idx + 1]}</>}
              </button>
            ) : (
              <span className="flex items-center gap-2 bg-slate-100 text-slate-500 px-4 py-2 rounded-lg text-sm font-medium">
                Sem ações disponíveis para o seu perfil
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
