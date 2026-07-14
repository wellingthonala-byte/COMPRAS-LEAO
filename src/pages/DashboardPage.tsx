import { ReactNode, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, CheckCircle2, AlertTriangle, Clock, Activity, DollarSign, TrendingUp,
  Plus, Kanban, BarChart3, Settings, Truck, Box, Tag, ArrowUpRight,
  ArrowDownRight, Minus, MoreVertical, RefreshCw, Download, Maximize2, X,
  ExternalLink, CalendarDays, ChevronLeft, ChevronRight, ShieldAlert, AlarmClock,
  Siren, FilterX, Sun, HardHat, PiggyBank, Zap,
} from 'lucide-react';
import { Header } from '../components/Layout/Header';
import { colorFromInitials } from '../utils/colors';
import { PurchaseRequest } from '../types';
import { ServiceOrder, loadServiceOrders, osIsOverdue } from '../types/serviceOrders';
import { Donut, LineChart, Bars, HBars, Sparkline, ChartEmpty } from '../components/UI/ChartKit';

interface DashboardPageProps { requests: PurchaseRequest[] }

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const isActive = (r: PurchaseRequest) => r.status !== 'Finalizado' && r.status !== 'Cancelada';

const STATUS_COLORS: Record<string, string> = {
  'Nova Solicitação': '#7c3aed', 'Em Aprovação': '#6366f1', 'Em Cotação': '#2563eb',
  'Comprado': '#059669', 'Em Rota': '#d97706', 'Em Serviço': '#ea580c',
  'Disponível para Retirada': '#64748b', 'Finalizado': '#8b5cf6', 'Cancelada': '#dc2626',
};
const OS_STATUS_COLORS: Record<string, string> = {
  'Aberta': '#64748b', 'Aguardando Aprovação': '#d97706', 'Programada': '#7c3aed',
  'Em Execução': '#0284c7', 'Pausada': '#f97316', 'Finalizada': '#059669',
  'Faturada': '#0d9488', 'Cancelada': '#dc2626',
};

function exportCSV(headers: string[], rows: (string | number)[][], name: string) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';'))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${name}.csv`; a.click();
  URL.revokeObjectURL(url);
}

/* ================================================================== */
/* Card inteligente com menu de opções                                 */
/* ================================================================== */
function SmartCard({ title, subtitle, children, onExport, detailsTo, onNavigate, onRefresh, expandable = true, className = '' }: {
  title: string; subtitle?: string; children: ReactNode;
  onExport?: () => void; detailsTo?: string; onNavigate?: (to: string) => void;
  onRefresh?: () => void; expandable?: boolean; className?: string;
}) {
  const [menu, setMenu] = useState(false);
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <div className={`bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow ${className}`}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-slate-700 text-sm">{title}</h3>
            {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <div className="relative">
            <button onClick={() => setMenu((v) => !v)} aria-label={`Opções de ${title}`}
              className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
              <MoreVertical size={15} />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1 w-44">
                  {onRefresh && (
                    <button onClick={() => { onRefresh(); setMenu(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-600 hover:bg-slate-50">
                      <RefreshCw size={12} /> Atualizar
                    </button>
                  )}
                  {expandable && (
                    <button onClick={() => { setExpanded(true); setMenu(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-600 hover:bg-slate-50">
                      <Maximize2 size={12} /> Expandir
                    </button>
                  )}
                  {onExport && (
                    <button onClick={() => { onExport(); setMenu(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-600 hover:bg-slate-50">
                      <Download size={12} /> Exportar CSV
                    </button>
                  )}
                  {detailsTo && onNavigate && (
                    <button onClick={() => { onNavigate(detailsTo); setMenu(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-600 hover:bg-slate-50">
                      <ExternalLink size={12} /> Abrir detalhes
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        {children}
      </div>

      {expanded && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-6" onClick={() => setExpanded(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800">{title}</h3>
              <button onClick={() => setExpanded(false)} aria-label="Fechar" className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            {children}
          </div>
        </div>
      )}
    </>
  );
}

/* ================================================================== */
/* Página                                                              */
/* ================================================================== */
export function DashboardPage({ requests }: DashboardPageProps) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<ServiceOrder[]>(loadServiceOrders);
  const [toast, setToast] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [calDay, setCalDay] = useState<string | null>(null);

  // filtros globais
  const [fPeriod, setFPeriod] = useState('');
  const [fSector, setFSector] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [fSupplier, setFSupplier] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fPriority, setFPriority] = useState('');

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };
  const refresh = () => { setOrders(loadServiceOrders()); showToast('Dados atualizados'); };

  const sectors = useMemo(() => [...new Set(requests.map((r) => r.sector))].sort(), [requests]);
  const categories = useMemo(() => [...new Set(requests.flatMap((r) => r.items.map((i) => i.application)).filter(Boolean))].sort(), [requests]);
  const suppliers = useMemo(() => [...new Set(requests.map((r) => r.supplier).filter((s): s is string => !!s))].sort(), [requests]);

  const hasFilters = fPeriod || fSector || fCategory || fSupplier || fStatus || fPriority;
  const clearFilters = () => { setFPeriod(''); setFSector(''); setFCategory(''); setFSupplier(''); setFStatus(''); setFPriority(''); };

  const periodStart = useMemo(() => {
    const now = new Date();
    switch (fPeriod) {
      case '7d': return new Date(now.getTime() - 7 * 86400000);
      case '30d': return new Date(now.getTime() - 30 * 86400000);
      case 'mes': return new Date(now.getFullYear(), now.getMonth(), 1);
      case 'ano': return new Date(now.getFullYear(), 0, 1);
      default: return null;
    }
  }, [fPeriod]);

  const filtered = useMemo(() => requests.filter((r) =>
    (!periodStart || new Date(r.createdAt) >= periodStart) &&
    (!fSector || r.sector === fSector) &&
    (!fCategory || r.items.some((i) => i.application === fCategory)) &&
    (!fSupplier || r.supplier === fSupplier) &&
    (!fStatus || r.status === fStatus) &&
    (!fPriority || r.priority === fPriority)
  ), [requests, periodStart, fSector, fCategory, fSupplier, fStatus, fPriority]);

  /* ------------------- KPIs com sparkline e delta ------------------- */
  const daySeries = (rs: { createdAt: string }[], days: number): number[] => {
    const out: number[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      out.push(rs.filter((r) => r.createdAt.slice(0, 10) === key).length);
    }
    return out;
  };
  const delta = (cur: number, prev: number): number | null => {
    if (prev === 0) return cur > 0 ? 100 : null;
    return Math.round(((cur - prev) / prev) * 100);
  };

  const kpis = useMemo(() => {
    const now = Date.now();
    const last7 = filtered.filter((r) => now - new Date(r.createdAt).getTime() < 7 * 86400000);
    const prev7 = filtered.filter((r) => {
      const age = now - new Date(r.createdAt).getTime();
      return age >= 7 * 86400000 && age < 14 * 86400000;
    });
    const open = filtered.filter(isActive);
    const finalized = filtered.filter((r) => r.status === 'Finalizado');
    const overdue = open.filter((r) => new Date(r.deliveryForecast + 'T23:59:59') < new Date());
    const machine = open.filter((r) => r.priority === 'Máquina Parada');
    const totalValue = filtered.reduce((s, r) => s + (r.value ?? 0), 0);
    const spark = daySeries(filtered, 14);
    return [
      { label: 'Total de Solicitações', value: String(filtered.length), icon: Package, color: '#7c3aed', bg: 'bg-violet-50', text: 'text-violet-600', d: delta(last7.length, prev7.length), spark, to: '/', tip: 'Total no filtro atual. Variação: últimos 7 dias vs. 7 anteriores. Clique para abrir o Kanban.' },
      { label: 'Em Aberto', value: String(open.length), icon: Activity, color: '#2563eb', bg: 'bg-blue-50', text: 'text-blue-600', d: delta(last7.filter(isActive).length, prev7.filter(isActive).length), spark: daySeries(open, 14), to: '/', tip: 'Solicitações ainda não finalizadas nem canceladas.' },
      { label: 'Finalizadas', value: String(finalized.length), icon: CheckCircle2, color: '#059669', bg: 'bg-emerald-50', text: 'text-emerald-600', d: null, spark: daySeries(finalized, 14), to: '/', tip: 'Solicitações concluídas com sucesso.' },
      { label: 'Máquina Parada', value: String(machine.length), icon: AlertTriangle, color: '#dc2626', bg: 'bg-red-50', text: 'text-red-600', d: null, invert: true, spark: daySeries(machine, 14), to: '/', tip: 'Prioridade máxima em aberto — atenção imediata.' },
      { label: 'Em Atraso', value: String(overdue.length), icon: Clock, color: '#ea580c', bg: 'bg-orange-50', text: 'text-orange-600', d: null, invert: true, spark: daySeries(overdue, 14), to: '/', tip: 'Solicitações abertas com previsão de entrega vencida.' },
      { label: 'Valor Total', value: fmtBRL(totalValue), icon: DollarSign, color: '#059669', bg: 'bg-emerald-50', text: 'text-emerald-700', d: null, spark, to: '/relatorios', tip: 'Soma dos valores das compras registradas. Clique para os Relatórios.' },
    ];
  }, [filtered]);

  /* ------------------- Resumo do dia ------------------- */
  const today = new Date().toISOString().slice(0, 10);
  const daySummary = useMemo(() => {
    const openToday = requests.filter((r) => r.createdAt.slice(0, 10) === today).length;
    const doneToday = requests.filter((r) => r.status === 'Finalizado' && r.history.some((h) => h.date.slice(0, 10) === today && h.to === 'Finalizado')).length;
    const lateReq = requests.filter((r) => isActive(r) && new Date(r.deliveryForecast + 'T23:59:59') < new Date()).length;
    const lateOS = orders.filter(osIsOverdue).length;
    const waiting = requests.filter((r) => r.status === 'Em Aprovação' || r.status === 'Nova Solicitação').length;
    const urgent = requests.filter((r) => isActive(r) && r.priority !== 'Não Urgente').length;
    const boughtToday = requests.filter((r) => r.history.some((h) => h.date.slice(0, 10) === today && h.to === 'Comprado')).reduce((s, r) => s + (r.value ?? 0), 0);
    return [
      { label: 'Abertas hoje', value: String(openToday), icon: Plus, cls: 'text-violet-600 bg-violet-50', to: '/' },
      { label: 'Finalizadas hoje', value: String(doneToday), icon: CheckCircle2, cls: 'text-emerald-600 bg-emerald-50', to: '/' },
      { label: 'Solicitações atrasadas', value: String(lateReq), icon: AlarmClock, cls: 'text-red-600 bg-red-50', to: '/' },
      { label: 'O.S. em atraso', value: String(lateOS), icon: HardHat, cls: 'text-orange-600 bg-orange-50', to: '/ordens' },
      { label: 'Aguardando aprovação', value: String(waiting), icon: ShieldAlert, cls: 'text-amber-600 bg-amber-50', to: '/' },
      { label: 'Compras urgentes', value: String(urgent), icon: Zap, cls: 'text-red-600 bg-red-50', to: '/' },
      { label: 'Comprado hoje', value: fmtBRL(boughtToday), icon: DollarSign, cls: 'text-emerald-700 bg-emerald-50', to: '/relatorios' },
      { label: 'Economia obtida', value: '—', icon: PiggyBank, cls: 'text-cyan-600 bg-cyan-50', to: '/relatorios', dev: true },
    ];
  }, [requests, orders, today]);

  /* ------------------- Gráficos ------------------- */
  const evolution = useMemo(() => {
    const out: { label: string; value: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      out.push({ label: `${key.slice(8, 10)}/${key.slice(5, 7)}`, value: filtered.filter((r) => r.createdAt.slice(0, 10) === key).length });
    }
    // se não houver nada nos últimos 14 dias, mostra por semana usando todo o histórico
    if (out.every((o) => o.value === 0) && filtered.length > 0) {
      const byDay = new Map<string, number>();
      filtered.forEach((r) => byDay.set(r.createdAt.slice(0, 10), (byDay.get(r.createdAt.slice(0, 10)) ?? 0) + 1));
      return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-14)
        .map(([k, v]) => ({ label: `${k.slice(8, 10)}/${k.slice(5, 7)}`, value: v }));
    }
    return out;
  }, [filtered]);

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((r) => r.items.forEach((i) => { if (i.application) m.set(i.application, (m.get(i.application) ?? 0) + i.quantity); }));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, value]) => ({ label, value }));
  }, [filtered]);

  const bySupplier = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((r) => { if (r.supplier && r.value) m.set(r.supplier, (m.get(r.supplier) ?? 0) + r.value); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, value]) => ({ label, value }));
  }, [filtered]);

  const monthlySpend = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((r) => { if (r.value) m.set(r.createdAt.slice(0, 7), (m.get(r.createdAt.slice(0, 7)) ?? 0) + r.value); });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6)
      .map(([k, v]) => ({ label: `${k.slice(5, 7)}/${k.slice(2, 4)}`, value: v }));
  }, [filtered]);

  const bySector = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((r) => { if (r.value) m.set(r.sector, (m.get(r.sector) ?? 0) + r.value); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, value]) => ({ label, value }));
  }, [filtered]);

  const statusSlices = useMemo(() =>
    Object.keys(STATUS_COLORS).map((s) => ({ label: s, value: filtered.filter((r) => r.status === s).length, color: STATUS_COLORS[s] })),
  [filtered]);

  const osSlices = useMemo(() =>
    Object.keys(OS_STATUS_COLORS).map((s) => ({ label: s, value: orders.filter((o) => o.status === s).length, color: OS_STATUS_COLORS[s] })),
  [orders]);

  const topBuyers = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((r) => r.history.forEach((h) => { if (h.action.toLowerCase().includes('status')) m.set(h.user, (m.get(h.user) ?? 0) + 1); }));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([label, value]) => ({ label, value }));
  }, [filtered]);

  /* ------------------- Atividades recentes ------------------- */
  const activities = useMemo(() => {
    const fromReq = requests.flatMap((r) => r.history.map((h) => ({
      id: `r-${r.id}-${h.id}`, user: h.user, action: h.action, ref: r.number, date: h.date,
      kind: h.action.toLowerCase().includes('aprovad') ? 'approve' as const
        : h.action.toLowerCase().includes('cancelada') ? 'cancel' as const
        : h.action.toLowerCase().includes('criada') ? 'create' as const : 'move' as const,
      to: '/' as const,
    })));
    const fromOS = orders.flatMap((o) => o.history.map((h) => ({
      id: `o-${o.id}-${h.id}`, user: h.user, action: h.action, ref: o.number, date: h.date,
      kind: h.action.toLowerCase().includes('aprovad') ? 'approve' as const
        : h.action.toLowerCase().includes('cancelada') ? 'cancel' as const
        : h.action.toLowerCase().includes('criada') ? 'create' as const : 'move' as const,
      to: '/ordens' as const,
    })));
    return [...fromReq, ...fromOS].sort((a, b) => (b.date > a.date ? 1 : -1)).slice(0, 9);
  }, [requests, orders]);

  const relTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const min = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
    if (d > 0) return `${d}d`;
    if (h > 0) return `${h}h`;
    if (min > 0) return `${min}min`;
    return 'agora';
  };

  /* ------------------- Pendências ------------------- */
  const pendings = useMemo(() => {
    const machine = requests.filter((r) => isActive(r) && r.priority === 'Máquina Parada');
    const approval = requests.filter((r) => r.status === 'Em Aprovação');
    const urgent = requests.filter((r) => isActive(r) && r.priority === 'Urgente');
    const lateOS = orders.filter(osIsOverdue);
    const objections = requests.filter((r) => r.items.some((i) => (i.objections ?? []).some((o) => !o.resolved)));
    return [
      { label: 'Máquinas paradas', count: machine.length, icon: Siren, cls: 'text-red-600 bg-red-50 border-red-100', to: '/' },
      { label: 'Aguardando aprovação', count: approval.length, icon: ShieldAlert, cls: 'text-amber-600 bg-amber-50 border-amber-100', to: '/' },
      { label: 'Compras urgentes', count: urgent.length, icon: Zap, cls: 'text-orange-600 bg-orange-50 border-orange-100', to: '/' },
      { label: 'O.S. em atraso', count: lateOS.length, icon: HardHat, cls: 'text-red-600 bg-red-50 border-red-100', to: '/ordens' },
      { label: 'Com objeções abertas', count: objections.length, icon: AlertTriangle, cls: 'text-orange-600 bg-orange-50 border-orange-100', to: '/' },
    ];
  }, [requests, orders]);

  /* ------------------- Calendário ------------------- */
  const calEvents = useMemo(() => {
    const m = new Map<string, { label: string; kind: 'entrega' | 'os'; to: string }[]>();
    requests.filter(isActive).forEach((r) => {
      const k = r.deliveryForecast;
      m.set(k, [...(m.get(k) ?? []), { label: `${r.number} — entrega prevista`, kind: 'entrega', to: '/' }]);
    });
    orders.filter((o) => !['Finalizada', 'Faturada', 'Cancelada'].includes(o.status)).forEach((o) => {
      const k = o.dueDate;
      m.set(k, [...(m.get(k) ?? []), { label: `${o.number} — ${o.type.toLowerCase()} programada`, kind: 'os', to: '/ordens' }]);
    });
    return m;
  }, [requests, orders]);

  const calGrid = useMemo(() => {
    const first = new Date(calMonth.y, calMonth.m, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(calMonth.y, calMonth.m + 1, 0).getDate();
    const cells: (string | null)[] = Array.from({ length: startWeekday }, () => null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${calMonth.y}-${String(calMonth.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return cells;
  }, [calMonth]);

  /* ------------------- Ações rápidas ------------------- */
  const quickActions = [
    { icon: Plus, label: 'Nova Solicitação', desc: 'Criar solicitação de compra', to: '/nova-solicitacao', cls: 'from-violet-500 to-violet-600' },
    { icon: HardHat, label: 'Nova O.S.', desc: 'Abrir ordem de serviço', to: '/ordens', cls: 'from-blue-500 to-blue-600' },
    { icon: Kanban, label: 'Kanban', desc: 'Fluxo de solicitações', to: '/', cls: 'from-indigo-500 to-indigo-600' },
    { icon: BarChart3, label: 'Relatórios', desc: 'BI e indicadores', to: '/relatorios', cls: 'from-emerald-500 to-emerald-600' },
    { icon: Truck, label: 'Novo Fornecedor', desc: 'Cadastrar fornecedor', to: '/configuracoes', cls: 'from-orange-500 to-orange-600' },
    { icon: Tag, label: 'Nova Categoria', desc: 'Cadastrar categoria', to: '/configuracoes', cls: 'from-cyan-500 to-cyan-600' },
    { icon: Box, label: 'Novo Produto', desc: 'Catálogo de produtos', dev: true, cls: 'from-slate-400 to-slate-500' },
    { icon: Settings, label: 'Configurações', desc: 'Central do sistema', to: '/configuracoes', cls: 'from-slate-500 to-slate-600' },
  ];

  const selectCls = 'text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500';
  const monthName = new Date(calMonth.y, calMonth.m, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div className="flex flex-col min-h-screen lg:pl-60 bg-slate-50">
      <Header title="Dashboard" subtitle="Painel de controle — visão geral de compras e serviços" requests={requests} />

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-800 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          <CheckCircle2 size={15} className="text-emerald-400" /> {toast}
        </div>
      )}

      <div className="flex-1 pt-16 px-4 md:px-6 py-5 space-y-5">

        {/* Filtros globais */}
        <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex flex-wrap items-center gap-2">
          <select value={fPeriod} onChange={(e) => setFPeriod(e.target.value)} className={selectCls} aria-label="Período">
            <option value="">Todo o período</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="mes">Este mês</option>
            <option value="ano">Este ano</option>
          </select>
          <select value={fSector} onChange={(e) => setFSector(e.target.value)} className={selectCls} aria-label="Setor">
            <option value="">Setor</option>
            {sectors.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={fCategory} onChange={(e) => setFCategory(e.target.value)} className={selectCls} aria-label="Categoria">
            <option value="">Categoria</option>
            {categories.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={fSupplier} onChange={(e) => setFSupplier(e.target.value)} className={selectCls} aria-label="Fornecedor">
            <option value="">Fornecedor</option>
            {suppliers.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={selectCls} aria-label="Status">
            <option value="">Status</option>
            {Object.keys(STATUS_COLORS).map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={fPriority} onChange={(e) => setFPriority(e.target.value)} className={selectCls} aria-label="Prioridade">
            <option value="">Prioridade</option>
            {['Máquina Parada', 'Urgente', 'Não Urgente'].map((p) => <option key={p}>{p}</option>)}
          </select>
          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium">
              <FilterX size={13} /> Limpar
            </button>
          )}
          <button onClick={refresh} className="ml-auto flex items-center gap-1 text-xs text-slate-500 border border-slate-200 rounded-lg px-2.5 py-2 hover:bg-slate-50">
            <RefreshCw size={13} /> Atualizar
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {kpis.map((k) => {
            const Icon = k.icon;
            const positive = k.d !== null && ((k as { invert?: boolean }).invert ? k.d < 0 : k.d > 0);
            return (
              <button key={k.label} onClick={() => navigate(k.to)}
                className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-left group relative">
                <div className="flex items-center justify-between mb-2">
                  <div className={`w-9 h-9 rounded-xl ${k.bg} flex items-center justify-center`}>
                    <Icon size={17} className={k.text} />
                  </div>
                  <Sparkline data={k.spark} color={k.color} />
                </div>
                <p className="text-xl font-bold text-slate-800 truncate">{k.value}</p>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-[11px] text-slate-500">{k.label}</p>
                  {k.d !== null ? (
                    <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${positive ? 'text-emerald-600' : 'text-red-500'}`}>
                      {k.d > 0 ? <ArrowUpRight size={10} /> : k.d < 0 ? <ArrowDownRight size={10} /> : <Minus size={10} />}
                      {Math.abs(k.d)}%
                    </span>
                  ) : null}
                </div>
                <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 bg-slate-800 text-white text-[11px] leading-snug rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity z-30 shadow-lg">
                  {k.tip}
                  <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Resumo do dia + Ações rápidas */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 bg-amber-50 rounded-lg flex items-center justify-center"><Sun size={15} className="text-amber-500" /></div>
              <h3 className="font-semibold text-slate-700 text-sm">Resumo do Dia</h3>
              <span className="text-[11px] text-slate-400 ml-auto">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {daySummary.map((d) => {
                const Icon = d.icon;
                return (
                  <button key={d.label}
                    onClick={() => (d as { dev?: boolean }).dev ? showToast('Recurso em desenvolvimento — requer backend') : navigate(d.to)}
                    className="flex items-center gap-2.5 border border-slate-100 rounded-xl p-3 hover:border-violet-200 hover:shadow-sm transition-all text-left">
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${d.cls}`}><Icon size={15} /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-slate-800 truncate">{d.value}</span>
                      <span className="block text-[10px] text-slate-500 leading-tight">{d.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-semibold text-slate-700 text-sm mb-4">Ações Rápidas</h3>
            <div className="grid grid-cols-2 gap-2.5">
              {quickActions.map((a) => {
                const Icon = a.icon;
                return (
                  <button key={a.label}
                    onClick={() => (a as { dev?: boolean }).dev ? showToast('Recurso em desenvolvimento — requer backend') : navigate(a.to!)}
                    className="group flex items-center gap-2.5 rounded-xl border border-slate-100 p-2.5 hover:border-transparent hover:shadow-md transition-all text-left relative overflow-hidden">
                    <span className={`w-8 h-8 rounded-lg bg-gradient-to-br ${a.cls} text-white flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-slate-700 truncate">{a.label}</span>
                      <span className="block text-[9px] text-slate-400 leading-tight truncate">{a.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Linha principal: gráficos + painel lateral */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <SmartCard title="Evolução das Solicitações" subtitle="Últimos 14 dias" onRefresh={refresh} onNavigate={navigate} detailsTo="/relatorios"
                onExport={() => exportCSV(['Data', 'Solicitações'], evolution.map((e) => [e.label, e.value]), 'evolucao')}>
                <LineChart data={evolution} />
              </SmartCard>
              <SmartCard title="Gastos por Mês" subtitle="Valores registrados nas compras" onRefresh={refresh} onNavigate={navigate} detailsTo="/relatorios"
                onExport={() => exportCSV(['Mês', 'Valor'], monthlySpend.map((e) => [e.label, e.value]), 'gastos-mensais')}>
                <Bars data={monthlySpend} color="#2563eb" format={(v) => fmtBRL(v)} />
              </SmartCard>
              <SmartCard title="Compras por Categoria" subtitle="Itens solicitados" onRefresh={refresh} onNavigate={navigate} detailsTo="/relatorios"
                onExport={() => exportCSV(['Categoria', 'Itens'], byCategory.map((e) => [e.label, e.value]), 'por-categoria')}>
                <HBars data={byCategory} />
              </SmartCard>
              <SmartCard title="Compras por Fornecedor" subtitle="Ranking por valor" onRefresh={refresh} onNavigate={navigate} detailsTo="/relatorios"
                onExport={() => exportCSV(['Fornecedor', 'Valor'], bySupplier.map((e) => [e.label, e.value]), 'por-fornecedor')}>
                <HBars data={bySupplier} format={(v) => fmtBRL(v)} />
              </SmartCard>
              <SmartCard title="Gastos por Setor" subtitle="Centro de custo" onRefresh={refresh} onNavigate={navigate} detailsTo="/relatorios"
                onExport={() => exportCSV(['Setor', 'Valor'], bySector.map((e) => [e.label, e.value]), 'por-setor')}>
                <HBars data={bySector} format={(v) => fmtBRL(v)} />
              </SmartCard>
              <SmartCard title="Compradores Mais Ativos" subtitle="Movimentações no fluxo" onRefresh={refresh} onNavigate={navigate} detailsTo="/relatorios"
                onExport={() => exportCSV(['Usuário', 'Movimentações'], topBuyers.map((e) => [e.label, e.value]), 'compradores')}>
                <HBars data={topBuyers} />
              </SmartCard>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <SmartCard title="Solicitações por Status" onRefresh={refresh} onNavigate={navigate} detailsTo="/"
                onExport={() => exportCSV(['Status', 'Qtd'], statusSlices.map((s) => [s.label, s.value]), 'status-solicitacoes')}>
                <div className="flex items-center gap-4">
                  <Donut slices={statusSlices} />
                  <div className="space-y-1 flex-1 min-w-0">
                    {statusSlices.filter((s) => s.value > 0).map((s) => (
                      <div key={s.label} className="flex items-center gap-1.5 text-[11px]">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="text-slate-600 truncate">{s.label}</span>
                        <span className="text-slate-800 font-semibold ml-auto">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </SmartCard>
              <SmartCard title="Ordens de Serviço por Status" onRefresh={refresh} onNavigate={navigate} detailsTo="/ordens"
                onExport={() => exportCSV(['Status', 'Qtd'], osSlices.map((s) => [s.label, s.value]), 'status-os')}>
                {orders.length === 0 ? <ChartEmpty note="Nenhuma O.S. cadastrada ainda" /> : (
                  <div className="flex items-center gap-4">
                    <Donut slices={osSlices} centerLabel="O.S." />
                    <div className="space-y-1 flex-1 min-w-0">
                      {osSlices.filter((s) => s.value > 0).map((s) => (
                        <div key={s.label} className="flex items-center gap-1.5 text-[11px]">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                          <span className="text-slate-600 truncate">{s.label}</span>
                          <span className="text-slate-800 font-semibold ml-auto">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </SmartCard>
            </div>
          </div>

          {/* Painel lateral */}
          <div className="space-y-5">
            {/* Pendências */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={14} className="text-red-500" />
                <h3 className="font-semibold text-slate-700 text-sm">Pendências</h3>
              </div>
              <div className="space-y-2">
                {pendings.map((p) => {
                  const Icon = p.icon;
                  return (
                    <button key={p.label} onClick={() => navigate(p.to)}
                      className={`w-full flex items-center gap-2.5 border rounded-xl px-3 py-2.5 transition-all hover:shadow-sm text-left ${p.count > 0 ? p.cls : 'text-slate-400 bg-white border-slate-100'}`}>
                      <Icon size={15} className="flex-shrink-0" />
                      <span className="text-xs font-medium flex-1">{p.label}</span>
                      <span className={`text-sm font-bold ${p.count > 0 ? '' : 'text-slate-300'}`}>{p.count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Calendário */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CalendarDays size={14} className="text-violet-600" />
                  <h3 className="font-semibold text-slate-700 text-sm capitalize">{monthName}</h3>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setCalMonth((c) => ({ y: c.m === 0 ? c.y - 1 : c.y, m: c.m === 0 ? 11 : c.m - 1 }))}
                    aria-label="Mês anterior" className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg"><ChevronLeft size={14} /></button>
                  <button onClick={() => setCalMonth((c) => ({ y: c.m === 11 ? c.y + 1 : c.y, m: c.m === 11 ? 0 : c.m + 1 }))}
                    aria-label="Próximo mês" className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg"><ChevronRight size={14} /></button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
                  <span key={i} className="text-[9px] text-slate-400 text-center font-semibold">{d}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calGrid.map((day, i) => {
                  if (!day) return <span key={`e-${i}`} />;
                  const events = calEvents.get(day) ?? [];
                  const isToday = day === today;
                  const isSelected = day === calDay;
                  return (
                    <button key={day} onClick={() => setCalDay(isSelected ? null : day)}
                      aria-label={`Dia ${day.slice(8, 10)}${events.length ? `, ${events.length} evento(s)` : ''}`}
                      className={`relative aspect-square rounded-lg text-[11px] font-medium transition-colors flex flex-col items-center justify-center ${
                        isSelected ? 'bg-violet-600 text-white' : isToday ? 'bg-violet-100 text-violet-700' :
                        events.length ? 'bg-slate-50 text-slate-700 hover:bg-violet-50' : 'text-slate-400 hover:bg-slate-50'
                      }`}>
                      {Number(day.slice(8, 10))}
                      {events.length > 0 && (
                        <span className={`absolute bottom-0.5 w-1 h-1 rounded-full ${isSelected ? 'bg-white' : events.some((e) => e.kind === 'os') ? 'bg-blue-500' : 'bg-violet-500'}`} />
                      )}
                    </button>
                  );
                })}
              </div>
              {calDay && (
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                  {(calEvents.get(calDay) ?? []).length === 0 ? (
                    <p className="text-xs text-slate-400">Nenhum evento em {calDay.slice(8, 10)}/{calDay.slice(5, 7)}.</p>
                  ) : (calEvents.get(calDay) ?? []).map((e, i) => (
                    <button key={i} onClick={() => navigate(e.to)}
                      className="w-full flex items-center gap-2 text-left text-xs text-slate-600 hover:text-violet-700 py-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${e.kind === 'os' ? 'bg-blue-500' : 'bg-violet-500'}`} />
                      <span className="truncate">{e.label}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3 mt-3 pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-500" /> Entregas</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> O.S. / Manutenções</span>
              </div>
            </div>

            {/* Atividades recentes */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Activity size={14} className="text-violet-600" />
                  <h3 className="font-semibold text-slate-700 text-sm">Atividades Recentes</h3>
                </div>
              </div>
              <div className="space-y-2.5">
                {activities.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">Nenhuma atividade registrada.</p>}
                {activities.map((a) => {
                  const initials = a.user.trim().slice(0, 2).toUpperCase();
                  return (
                    <button key={a.id} onClick={() => navigate(a.to)}
                      className="w-full flex items-start gap-2.5 text-left hover:bg-slate-50 rounded-xl px-1.5 py-1.5 transition-colors">
                      <span className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: colorFromInitials(initials) }}>{initials}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs text-slate-700 leading-snug">
                          <strong>{a.user}</strong> — {a.action.length > 60 ? a.action.slice(0, 60) + '…' : a.action}
                        </span>
                        <span className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[9px] font-semibold px-1.5 py-px rounded-full ${
                            a.kind === 'approve' ? 'bg-emerald-100 text-emerald-700' :
                            a.kind === 'cancel' ? 'bg-red-100 text-red-700' :
                            a.kind === 'create' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'
                          }`}>{a.ref}</span>
                          <span className="text-[9px] text-slate-400">{relTime(a.date)} atrás</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
