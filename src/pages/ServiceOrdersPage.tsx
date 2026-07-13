import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList, FolderOpen, Loader2, ShieldAlert, PackageSearch, Wrench, FlaskConical,
  CheckCircle2, XCircle, AlarmClock, Timer, Gauge, DollarSign, Users, Plus, Search,
  X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Columns3, Download,
  FileSpreadsheet, Printer, ArrowRight, MessageSquare, Clock, Paperclip,
  Trash2, ShoppingCart, HardHat, Info, FilterX, Eye, Kanban, List, Calendar,
} from 'lucide-react';
import { Header } from '../components/Layout/Header';
import { colorFromInitials } from '../utils/colors';
import { sendNotification } from '../utils/notify';
import { generateRequestNumber } from '../utils/numbering';
import { PurchaseRequest } from '../types';
import { AppUser, loadUsers } from '../data/users';
import {
  ServiceOrder, OSStatus, OSPriority, MaintenanceType, OS_FLOW,
  loadServiceOrders, saveServiceOrders, generateOSNumber, osCost, osIsOverdue, osSlaMet, osElapsedHours,
} from '../types/serviceOrders';

/* ------------------------------------------------------------------ */
const STATUS_COLORS: Record<OSStatus, string> = {
  'Aberta': '#7c3aed', 'Em Análise': '#6366f1', 'Aguardando Aprovação': '#d97706',
  'Aguardando Peças': '#f97316', 'Em Execução': '#2563eb', 'Em Testes': '#0891b2',
  'Concluída': '#059669', 'Cancelada': '#dc2626',
};
const STATUS_BADGE: Record<OSStatus, string> = {
  'Aberta': 'bg-violet-100 text-violet-700', 'Em Análise': 'bg-indigo-100 text-indigo-700',
  'Aguardando Aprovação': 'bg-amber-100 text-amber-700', 'Aguardando Peças': 'bg-orange-100 text-orange-700',
  'Em Execução': 'bg-blue-100 text-blue-700', 'Em Testes': 'bg-cyan-100 text-cyan-700',
  'Concluída': 'bg-emerald-100 text-emerald-700', 'Cancelada': 'bg-red-100 text-red-700',
};
const PRIORITY_BADGE: Record<OSPriority, string> = {
  'Crítica': 'bg-red-100 text-red-700', 'Alta': 'bg-orange-100 text-orange-700',
  'Média': 'bg-blue-100 text-blue-700', 'Baixa': 'bg-slate-100 text-slate-600',
};
const TYPES: MaintenanceType[] = ['Corretiva', 'Preventiva', 'Preditiva', 'Melhoria'];
const PRIORITIES: OSPriority[] = ['Crítica', 'Alta', 'Média', 'Baixa'];
const CATEGORIES = ['Mecânica', 'Elétrica', 'Hidráulica', 'Predial', 'TI', 'Outros'];
const SECTORS = ['Produção', 'Manutenção', 'Administrativo', 'TI', 'RH', 'Logística'];
const CAT_COLORS = ['#7c3aed', '#059669', '#d97706', '#2563eb', '#dc2626', '#0891b2'];

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (s?: string) => (s ? new Date(s.length === 10 ? s + 'T12:00:00' : s).toLocaleDateString('pt-BR') : '—');
const fmtHours = (h: number | null) => {
  if (h === null) return '—';
  if (h < 1) return `${Math.round(h * 60)}min`;
  if (h < 48) return `${h.toFixed(1).replace('.', ',')}h`;
  return `${(h / 24).toFixed(1).replace('.', ',')}d`;
};

/* ------------------------------------------------------------------ */
/* Exportação                                                          */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/* Gráficos SVG compactos                                              */
/* ------------------------------------------------------------------ */
function Donut({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <ChartEmpty />;
  const r = 46, c = 56, C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width="112" height="112" viewBox="0 0 112 112" role="img" aria-label="Distribuição por status">
      <circle cx={c} cy={c} r={r} fill="none" stroke="#f1f5f9" strokeWidth="16" />
      {slices.map((s, i) => {
        if (!s.value) return null;
        const rot = (acc / total) * 360 - 90;
        acc += s.value;
        return (
          <circle key={i} cx={c} cy={c} r={r} fill="none" stroke={s.color} strokeWidth="16"
            strokeDasharray={`${Math.max((s.value / total) * C - 2, 0.5)} ${C}`} transform={`rotate(${rot} ${c} ${c})`}>
            <title>{`${s.label}: ${s.value}`}</title>
          </circle>
        );
      })}
      <text x={c} y={c - 2} textAnchor="middle" fontSize="17" fontWeight="700" fill="#1e293b">{total}</text>
      <text x={c} y={c + 13} textAnchor="middle" fontSize="8" fill="#94a3b8">O.S.</text>
    </svg>
  );
}

function HBars({ data, format }: { data: { label: string; value: number; color?: string }[]; format?: (v: number) => string }) {
  if (!data.length || data.every((d) => !d.value)) return <ChartEmpty />;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={d.label} title={`${d.label}: ${format ? format(d.value) : d.value}`}>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-600 truncate pr-2">{d.label}</span>
            <span className="font-semibold text-slate-800 whitespace-nowrap">{format ? format(d.value) : d.value}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(d.value / max) * 100}%`, backgroundColor: d.color ?? CAT_COLORS[i % CAT_COLORS.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MonthBars({ data, format }: { data: { label: string; value: number }[]; format: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length || data.every((d) => !d.value)) return <ChartEmpty />;
  const w = 320, h = 120, max = Math.max(...data.map((d) => d.value), 1);
  const slot = w / data.length, bw = Math.min(slot * 0.55, 34);
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Custos mensais">
        {data.map((d, i) => {
          const bh = Math.max((d.value / max) * (h - 28), d.value > 0 ? 3 : 0);
          const x = i * slot + (slot - bw) / 2, y = h - 6 - bh;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * slot} y={0} width={slot} height={h} fill="transparent" />
              <path d={`M${x},${y + bh} L${x},${y + 4} Q${x},${y} ${x + 4},${y} L${x + bw - 4},${y} Q${x + bw},${y} ${x + bw},${y + 4} L${x + bw},${y + bh} Z`}
                fill="#7c3aed" opacity={hover === null || hover === i ? 1 : 0.45} />
              {hover === i && <text x={x + bw / 2} y={y - 5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#1e293b">{format(d.value)}</text>}
              <title>{`${d.label}: ${format(d.value)}`}</title>
            </g>
          );
        })}
      </svg>
      <div className="grid mt-1" style={{ gridTemplateColumns: `repeat(${data.length}, 1fr)` }}>
        {data.map((d, i) => <span key={i} className="text-[9px] text-center text-slate-400 truncate">{d.label}</span>)}
      </div>
    </div>
  );
}

function ChartEmpty() {
  return (
    <div className="h-28 flex flex-col items-center justify-center text-slate-300 gap-1.5">
      <Info size={16} />
      <p className="text-xs text-slate-400">Sem dados para o período</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */
interface ServiceOrdersPageProps {
  currentUser: AppUser;
  requests: PurchaseRequest[];
  onCreatePurchaseRequest: (r: PurchaseRequest) => void;
}

type PeriodKey = 'todos' | '7d' | '30d' | 'mes' | 'ano';
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'todos', label: 'Todo o período' }, { key: '7d', label: 'Últimos 7 dias' },
  { key: '30d', label: 'Últimos 30 dias' }, { key: 'mes', label: 'Este mês' }, { key: 'ano', label: 'Este ano' },
];

export function ServiceOrdersPage({ currentUser, requests, onCreatePurchaseRequest }: ServiceOrdersPageProps) {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<ServiceOrder[]>(loadServiceOrders);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [view, setView] = useState<'kanban' | 'lista'>('kanban');

  // filtros
  const [period, setPeriod] = useState<PeriodKey>('todos');
  const [fStatus, setFStatus] = useState('');
  const [fPriority, setFPriority] = useState('');
  const [fTechnician, setFTechnician] = useState('');
  const [fRequester, setFRequester] = useState('');
  const [fSector, setFSector] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [fType, setFType] = useState('');
  const [fEquipment, setFEquipment] = useState('');
  const [fOverdue, setFOverdue] = useState(false);

  useEffect(() => { const t = setTimeout(() => setLoading(false), 350); return () => clearTimeout(t); }, []);
  useEffect(() => { saveServiceOrders(orders); }, [orders]);

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
  const requesters = useMemo(() => [...new Set(orders.map((o) => o.requester))].sort(), [orders]);
  const equipments = useMemo(() => [...new Set(orders.map((o) => o.equipment.name).filter(Boolean))].sort(), [orders]);

  const hasFilters = period !== 'todos' || fStatus || fPriority || fTechnician || fRequester || fSector || fCategory || fType || fEquipment || fOverdue;
  const clearFilters = () => { setPeriod('todos'); setFStatus(''); setFPriority(''); setFTechnician(''); setFRequester(''); setFSector(''); setFCategory(''); setFType(''); setFEquipment(''); setFOverdue(false); };

  const filtered = useMemo(() => {
    const now = new Date();
    const startOf = (): Date | null => {
      switch (period) {
        case '7d': return new Date(now.getTime() - 7 * 86400000);
        case '30d': return new Date(now.getTime() - 30 * 86400000);
        case 'mes': return new Date(now.getFullYear(), now.getMonth(), 1);
        case 'ano': return new Date(now.getFullYear(), 0, 1);
        default: return null;
      }
    };
    const start = startOf();
    return orders.filter((o) =>
      (!start || new Date(o.openedAt) >= start) &&
      (!fStatus || o.status === fStatus) &&
      (!fPriority || o.priority === fPriority) &&
      (!fTechnician || o.technician === fTechnician) &&
      (!fRequester || o.requester === fRequester) &&
      (!fSector || o.costCenter === fSector) &&
      (!fCategory || o.category === fCategory) &&
      (!fType || o.type === fType) &&
      (!fEquipment || o.equipment.name === fEquipment) &&
      (!fOverdue || osIsOverdue(o))
    );
  }, [orders, period, fStatus, fPriority, fTechnician, fRequester, fSector, fCategory, fType, fEquipment, fOverdue]);

  /* ---------------- KPIs ---------------- */
  const kpis = useMemo(() => {
    const by = (s: OSStatus) => filtered.filter((o) => o.status === s).length;
    const inProgress = filtered.filter((o) => ['Em Análise', 'Em Execução', 'Em Testes'].includes(o.status)).length;
    const overdue = filtered.filter(osIsOverdue).length;
    const concluded = filtered.filter((o) => o.status === 'Concluída');
    const times = concluded.map(osElapsedHours).filter((t): t is number => t !== null);
    const avgTime = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
    const slaResults = filtered.map(osSlaMet).filter((x): x is boolean => x !== null);
    const slaPct = slaResults.length ? Math.round((slaResults.filter(Boolean).length / slaResults.length) * 100) : null;
    const cost = filtered.reduce((s, o) => s + osCost(o), 0);
    const activeTechs = new Set(filtered.filter((o) => !['Concluída', 'Cancelada'].includes(o.status) && o.technician).map((o) => o.technician)).size;
    return [
      { label: 'Total de O.S.', value: String(filtered.length), icon: ClipboardList, color: 'text-violet-600', bg: 'bg-violet-50', tip: 'Total de ordens de serviço no período e filtros selecionados.' },
      { label: 'Abertas', value: String(by('Aberta')), icon: FolderOpen, color: 'text-violet-600', bg: 'bg-violet-50', tip: 'Ordens recém-criadas aguardando análise.' },
      { label: 'Em Andamento', value: String(inProgress), icon: Loader2, color: 'text-blue-600', bg: 'bg-blue-50', tip: 'Em análise, execução ou testes.' },
      { label: 'Aguard. Aprovação', value: String(by('Aguardando Aprovação')), icon: ShieldAlert, color: 'text-amber-600', bg: 'bg-amber-50', tip: 'Aguardando aprovação do gestor.' },
      { label: 'Aguard. Peças', value: String(by('Aguardando Peças')), icon: PackageSearch, color: 'text-orange-600', bg: 'bg-orange-50', tip: 'Paradas aguardando materiais — podem gerar solicitação no módulo de Compras.' },
      { label: 'Concluídas', value: String(by('Concluída')), icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', tip: 'Ordens finalizadas.' },
      { label: 'Canceladas', value: String(by('Cancelada')), icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', tip: 'Ordens canceladas com justificativa.' },
      { label: 'Atrasadas', value: String(overdue), icon: AlarmClock, color: 'text-red-600', bg: 'bg-red-50', tip: 'Ordens abertas com prazo vencido.' },
      { label: 'Tempo Médio', value: fmtHours(avgTime), icon: Timer, color: 'text-indigo-600', bg: 'bg-indigo-50', tip: 'Tempo médio entre abertura e conclusão.' },
      { label: 'SLA Cumprido', value: slaPct !== null ? `${slaPct}%` : '—', icon: Gauge, color: 'text-cyan-600', bg: 'bg-cyan-50', tip: 'Percentual de O.S. concluídas dentro do SLA definido.' },
      { label: 'Custo Total', value: fmtBRL(cost), icon: DollarSign, color: 'text-emerald-700', bg: 'bg-emerald-50', tip: 'Materiais + mão de obra de todas as O.S. filtradas.' },
      { label: 'Técnicos em Atendimento', value: String(activeTechs), icon: Users, color: 'text-blue-700', bg: 'bg-blue-50', tip: 'Técnicos distintos com O.S. ativas.' },
    ];
  }, [filtered]);

  /* ---------------- Gráficos ---------------- */
  const statusSlices = useMemo(() =>
    (Object.keys(STATUS_COLORS) as OSStatus[]).map((s) => ({ label: s, value: filtered.filter((o) => o.status === s).length, color: STATUS_COLORS[s] })),
  [filtered]);
  const byTech = useMemo(() => topCount(filtered.map((o) => o.technician || 'Sem técnico')), [filtered]);
  const byCat = useMemo(() => topCount(filtered.map((o) => o.category)), [filtered]);
  const byEquip = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((o) => { if (o.equipment.name) m.set(o.equipment.name, (m.get(o.equipment.name) ?? 0) + osCost(o)); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value], i) => ({ label, value, color: CAT_COLORS[i % 6] }));
  }, [filtered]);
  const monthlyCost = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((o) => {
      const k = o.openedAt.slice(0, 7);
      m.set(k, (m.get(k) ?? 0) + osCost(o));
    });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([k, v]) => ({ label: `${k.slice(5, 7)}/${k.slice(2, 4)}`, value: v }));
  }, [filtered]);

  function topCount(items: string[]) {
    const m = new Map<string, number>();
    items.filter(Boolean).forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value], i) => ({ label, value, color: CAT_COLORS[i % 6] }));
  }

  /* ---------------- Mutações ---------------- */
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
  };

  const canAdvanceFrom = (status: OSStatus): boolean => {
    if (status === 'Concluída' || status === 'Cancelada') return false;
    if (status === 'Aguardando Aprovação') return currentUser.role === 'gestor';
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
      completedAt: next === 'Concluída' ? new Date().toISOString() : o.completedAt,
    }, os.status === 'Aguardando Aprovação' ? 'O.S. aprovada' : 'Status alterado', os.status, next));
    sendNotification({
      title: next === 'Concluída' ? `✅ ${os.number} — Concluída` : `🛠️ ${os.number} — ${next}`,
      message: `"${os.title}" avançou para "${next}".`,
      priority: 3, tags: [next === 'Concluída' ? 'white_check_mark' : 'gear'],
    });
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
    const req: PurchaseRequest = {
      id: `req-${Date.now()}`,
      number,
      requester: currentUser.name,
      requesterInitials: currentUser.initials,
      sector: 'Manutenção',
      priority: os.priority === 'Crítica' ? 'Máquina Parada' : os.priority === 'Alta' ? 'Urgente' : 'Não Urgente',
      status: 'Nova Solicitação',
      createdAt: now,
      deliveryForecast: os.dueDate || now.slice(0, 10),
      items: (os.materials.length > 0 ? os.materials : [{ id: 'm0', product: `Peças para ${os.title}`, code: '', quantity: 1, unit: 'un', unitValue: 0 }]).map((m, i) => ({
        id: `item-${Date.now()}-${i}`,
        description: m.product,
        quantity: m.quantity,
        application: 'Manutenção Geral',
        priority: os.priority === 'Crítica' ? 'Máquina Parada' : os.priority === 'Alta' ? 'Urgente' : 'Não Urgente',
        deliveryForecast: os.dueDate || now.slice(0, 10),
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

  const selected = orders.find((o) => o.id === selectedId);

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen lg:pl-60 bg-slate-50">
        <Header title="Ordens de Serviço" subtitle="Gestão completa de manutenção e serviços" requests={requests} />
        <div className="flex-1 pt-16 px-6 py-6 space-y-5 animate-pulse" aria-busy="true">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => <div key={i} className="h-24 bg-slate-200/60 rounded-2xl" />)}
          </div>
          <div className="h-12 bg-slate-200/60 rounded-2xl" />
          <div className="h-80 bg-slate-200/60 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen lg:pl-60 bg-slate-50">
      <Header title="Ordens de Serviço" subtitle="Gestão completa de manutenção e serviços" requests={requests} />

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-800 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          <CheckCircle2 size={15} className="text-emerald-400" /> {toast}
        </div>
      )}

      <div className="flex-1 pt-16 px-4 md:px-6 py-6 space-y-5">

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
          {kpis.map(({ label, value, icon: Icon, color, bg, tip }) => (
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

        {/* Filtros + Nova O.S. */}
        <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex flex-wrap items-center gap-2">
          {([
            [period, setPeriod as (v: string) => void, PERIODS.map((p) => [p.key, p.label]), 'Período'],
            [fStatus, setFStatus, Object.keys(STATUS_COLORS).map((s) => [s, s]), 'Status'],
            [fPriority, setFPriority, PRIORITIES.map((p) => [p, p]), 'Prioridade'],
            [fTechnician, setFTechnician, technicians.map((t) => [t, t]), 'Técnico'],
            [fRequester, setFRequester, requesters.map((t) => [t, t]), 'Solicitante'],
            [fSector, setFSector, SECTORS.map((s) => [s, s]), 'Centro de custo'],
            [fCategory, setFCategory, CATEGORIES.map((c) => [c, c]), 'Categoria'],
            [fType, setFType, TYPES.map((t) => [t, t]), 'Tipo'],
            [fEquipment, setFEquipment, equipments.map((e) => [e, e]), 'Equipamento'],
          ] as [string, (v: string) => void, string[][], string][]).map(([value, setter, options, label]) => (
            <select key={label} value={value} onChange={(e) => setter(e.target.value)} aria-label={label}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500">
              {label !== 'Período' && <option value="">{label}</option>}
              {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer px-1">
            <input type="checkbox" checked={fOverdue} onChange={(e) => setFOverdue(e.target.checked)} className="accent-red-500" />
            Só atrasadas
          </label>
          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-2.5 py-2">
              <FilterX size={13} /> Limpar
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
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
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm shadow-violet-200">
              <Plus size={15} /> Nova O.S.
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
              {([...OS_FLOW, 'Cancelada'] as OSStatus[]).map((status) => {
                const colOrders = filtered.filter((o) => o.status === status);
                return (
                  <div key={status} className="flex-shrink-0 w-72 flex flex-col rounded-2xl bg-white border border-slate-200 self-start">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
                      <span className="text-sm font-semibold text-slate-700">{status}</span>
                      <span className="bg-slate-50 text-slate-500 text-xs font-bold px-2 py-0.5 rounded-full border border-slate-200">{colOrders.length}</span>
                    </div>
                    <div className="p-3 space-y-3">
                      {colOrders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-slate-300">
                          <p className="text-xs">Nenhuma O.S.</p>
                        </div>
                      ) : colOrders.map((o) => <OSKanbanCard key={o.id} os={o} onClick={() => setSelectedId(o.id)} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            {/* Indicadores */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-semibold text-slate-700 text-sm mb-3">O.S. por Status</h3>
                <div className="flex items-center gap-3">
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
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-semibold text-slate-700 text-sm mb-4">O.S. por Técnico</h3>
                <HBars data={byTech} />
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-semibold text-slate-700 text-sm mb-4">O.S. por Categoria</h3>
                <HBars data={byCat} />
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-semibold text-slate-700 text-sm mb-4">Custo por Equipamento</h3>
                <HBars data={byEquip} format={fmtBRL} />
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-semibold text-slate-700 text-sm mb-4">Custos Mensais</h3>
              <MonthBars data={monthlyCost} format={fmtBRL} />
            </div>

            {/* Tabela */}
            <OrdersTable orders={filtered} onView={setSelectedId} onAdvance={handleAdvance} canAdvanceFrom={canAdvanceFrom} />
          </>
        )}
      </div>

      {showNew && (
        <NewOSModal
          currentUser={currentUser}
          existingNumbers={orders.map((o) => o.number)}
          onClose={() => setShowNew(false)}
          onCreate={handleCreate}
        />
      )}

      {selected && (
        <OSDetailModal
          os={selected}
          currentUser={currentUser}
          onClose={() => setSelectedId(null)}
          onAdvance={handleAdvance}
          canAdvanceFrom={canAdvanceFrom}
          onCancel={handleCancel}
          onUpdate={(fn) => updateOrder(selected.id, fn)}
          onRequestParts={() => handleRequestParts(selected)}
          addEvent={addEvent}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card do Kanban de O.S. — mesmo padrão visual do Kanban de Compras   */
/* ------------------------------------------------------------------ */
const PRIORITY_BORDER: Record<OSPriority, string> = {
  'Crítica': 'border-l-red-500', 'Alta': 'border-l-orange-400', 'Média': 'border-l-blue-400', 'Baixa': 'border-l-slate-300',
};

function OSKanbanCard({ os, onClick }: { os: ServiceOrder; onClick: () => void }) {
  const isCancelled = os.status === 'Cancelada';
  const overdue = osIsOverdue(os);
  const cost = osCost(os);
  const initials = os.requester.trim().slice(0, 2).toUpperCase();
  return (
    <div onClick={onClick}
      className={`bg-white rounded-xl border border-slate-200 border-l-4 ${isCancelled ? 'border-l-slate-300 opacity-70' : PRIORITY_BORDER[os.priority]} p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group ${overdue ? 'ring-1 ring-red-300' : ''} ${os.status === 'Aguardando Aprovação' ? 'ring-1 ring-amber-300' : ''}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${PRIORITY_BADGE[os.priority]}`}>{os.priority}</span>
        <span className="text-xs font-bold text-slate-400 group-hover:text-violet-600 transition-colors">{os.number}</span>
      </div>

      <p className="text-sm font-semibold text-slate-800 mb-1 line-clamp-2">{os.title}</p>

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
        <div className="mb-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs text-amber-700 font-medium">⏳ Aguardando aprovação do gestor</p>
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

      {cost > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-50 flex items-center gap-1">
          <DollarSign size={11} className="text-violet-400" />
          <span className="text-xs font-semibold text-violet-600">{fmtBRL(cost)}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabela de O.S.                                                      */
/* ------------------------------------------------------------------ */
function OrdersTable({ orders, onView, onAdvance, canAdvanceFrom }: {
  orders: ServiceOrder[]; onView: (id: string) => void; onAdvance: (id: string) => void; canAdvanceFrom: (s: OSStatus) => boolean;
}) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string>('openedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [hidden, setHidden] = useState<Set<string>>(new Set(['setor', 'tipo', 'conclusao']));
  const [showCols, setShowCols] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const PAGE = 10;

  const columns: { key: string; label: string; value: (o: ServiceOrder) => string | number; render?: (o: ServiceOrder) => React.ReactNode; align?: 'right' }[] = [
    { key: 'number', label: 'Nº O.S.', value: (o) => o.number, render: (o) => <span className="font-semibold text-slate-700 whitespace-nowrap">{o.number}</span> },
    { key: 'title', label: 'Título', value: (o) => o.title, render: (o) => <span className="line-clamp-1">{o.title}</span> },
    { key: 'equipment', label: 'Equipamento', value: (o) => o.equipment.name || '—' },
    { key: 'requester', label: 'Solicitante', value: (o) => o.requester },
    { key: 'technician', label: 'Técnico', value: (o) => o.technician || '—' },
    { key: 'setor', label: 'Setor', value: (o) => o.costCenter },
    { key: 'category', label: 'Categoria', value: (o) => o.category },
    { key: 'tipo', label: 'Tipo', value: (o) => o.type },
    {
      key: 'priority', label: 'Prioridade', value: (o) => PRIORITIES.indexOf(o.priority),
      render: (o) => <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${PRIORITY_BADGE[o.priority]}`}>{o.priority}</span>,
    },
    {
      key: 'status', label: 'Status', value: (o) => o.status,
      render: (o) => <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_BADGE[o.status]}`}>{o.status}</span>,
    },
    {
      key: 'sla', label: 'SLA', value: (o) => o.slaHours,
      render: (o) => {
        const met = osSlaMet(o);
        return met === null
          ? <span className="text-xs text-slate-500">{o.slaHours}h</span>
          : <span className={`text-[11px] font-medium ${met ? 'text-emerald-600' : 'text-red-500'}`}>{met ? '✓ Cumprido' : '✗ Estourado'}</span>;
      },
    },
    { key: 'openedAt', label: 'Abertura', value: (o) => o.openedAt, render: (o) => fmtDate(o.openedAt) },
    {
      key: 'dueDate', label: 'Prazo', value: (o) => o.dueDate,
      render: (o) => <span className={osIsOverdue(o) ? 'text-red-500 font-semibold' : ''}>{fmtDate(o.dueDate)}</span>,
    },
    { key: 'conclusao', label: 'Conclusão', value: (o) => o.completedAt ?? '', render: (o) => fmtDate(o.completedAt) },
    { key: 'tempo', label: 'Tempo', value: (o) => osElapsedHours(o) ?? -1, render: (o) => fmtHours(osElapsedHours(o)), align: 'right' },
    { key: 'custo', label: 'Custo', value: (o) => osCost(o), render: (o) => <span className="font-semibold text-slate-800">{fmtBRL(osCost(o))}</span>, align: 'right' },
  ];

  const visible = columns.filter((c) => !hidden.has(c.key));

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = q ? orders.filter((o) =>
      [o.number, o.title, o.equipment.name, o.requester, o.technician, o.category, o.status].join(' ').toLowerCase().includes(q)
    ) : [...orders];
    const col = columns.find((c) => c.key === sortKey);
    if (col) out.sort((a, b) => {
      const va = col.value(a), vb = col.value(b);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE, safePage * PAGE);

  const exportRows = () => {
    const src = selectedRows.size ? rows.filter((r) => selectedRows.has(r.id)) : rows;
    return src.map((o) => visible.map((c) => (c.key === 'custo' ? fmtBRL(osCost(o)) : c.key === 'tempo' ? fmtHours(osElapsedHours(o)) : c.value(o))));
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
        <h3 className="font-semibold text-slate-700 text-sm mr-auto">Lista de Ordens de Serviço</h3>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Pesquisar..." aria-label="Pesquisar O.S."
            className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg w-44 focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>
        <div className="relative">
          <button onClick={() => setShowCols((v) => !v)} className="flex items-center gap-1 text-xs text-slate-500 border border-slate-200 rounded-lg px-2 py-1.5 hover:bg-slate-50">
            <Columns3 size={13} /> Colunas
          </button>
          {showCols && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowCols(false)} />
              <div className="absolute right-0 top-9 bg-white border border-slate-200 rounded-xl shadow-lg z-30 p-2 w-44 max-h-64 overflow-y-auto">
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
        <button onClick={() => toCSV(visible.map((c) => c.label), exportRows(), 'ordens-de-servico')}
          className="flex items-center gap-1 text-xs text-slate-500 border border-slate-200 rounded-lg px-2 py-1.5 hover:bg-slate-50 hover:text-violet-700">
          <Download size={13} /> CSV
        </button>
        <button onClick={() => toXLS(visible.map((c) => c.label), exportRows(), 'ordens-de-servico')}
          className="flex items-center gap-1 text-xs text-slate-500 border border-slate-200 rounded-lg px-2 py-1.5 hover:bg-slate-50 hover:text-emerald-700">
          <FileSpreadsheet size={13} /> Excel
        </button>
        <button onClick={() => window.print()} title="Imprimir / salvar em PDF"
          className="flex items-center gap-1 text-xs text-slate-500 border border-slate-200 rounded-lg px-2 py-1.5 hover:bg-slate-50">
          <Printer size={13} /> PDF
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th scope="col" className="px-3 py-2.5 w-8">
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
                <th key={c.key} scope="col" className={`px-3 py-2.5 text-xs font-semibold text-slate-500 whitespace-nowrap ${c.align === 'right' ? 'text-right' : ''}`}>
                  <button onClick={() => { if (sortKey === c.key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setSortKey(c.key); setSortDir('asc'); } }}
                    className="inline-flex items-center gap-1 hover:text-slate-800">
                    {c.label}
                    {sortKey === c.key ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
                  </button>
                </th>
              ))}
              <th scope="col" className="px-3 py-2.5 text-xs font-semibold text-slate-500">Ações</th>
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
                    {canAdvanceFrom(o.status) && OS_FLOW.indexOf(o.status) < OS_FLOW.length - 1 && OS_FLOW.includes(o.status) && (
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

/* ------------------------------------------------------------------ */
/* Modal Nova O.S.                                                     */
/* ------------------------------------------------------------------ */
function NewOSModal({ currentUser, existingNumbers, onClose, onCreate }: {
  currentUser: AppUser; existingNumbers: string[]; onClose: () => void; onCreate: (os: ServiceOrder) => void;
}) {
  const users = loadUsers();
  const [f, setF] = useState({
    title: '', description: '', type: 'Corretiva' as MaintenanceType, category: CATEGORIES[0],
    equipName: '', equipCode: '', equipModel: '', equipManufacturer: '', equipSerial: '', equipPatrimony: '', equipLocation: '',
    costCenter: SECTORS[1], technician: '', priority: 'Média' as OSPriority, slaHours: '48',
    dueDate: '', observations: '',
  });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const valid = f.title.trim() && f.dueDate && f.equipName.trim();

  const submit = () => {
    if (!valid) return;
    const now = new Date().toISOString();
    onCreate({
      id: `os-${Date.now()}`,
      number: generateOSNumber(now, existingNumbers),
      title: f.title.trim(),
      description: f.description.trim(),
      type: f.type,
      category: f.category,
      equipment: { code: f.equipCode, name: f.equipName.trim(), model: f.equipModel, manufacturer: f.equipManufacturer, serial: f.equipSerial, patrimony: f.equipPatrimony, location: f.equipLocation },
      costCenter: f.costCenter,
      requester: currentUser.name,
      technician: f.technician,
      priority: f.priority,
      slaHours: Number(f.slaHours) || 48,
      openedAt: now,
      dueDate: f.dueDate,
      status: 'Aberta',
      observations: f.observations.trim() || undefined,
      materials: [], labor: [], comments: [],
      history: [{ id: `e-${Date.now()}`, date: now, user: currentUser.name, action: 'O.S. criada', to: 'Aberta' }],
    });
  };

  const input = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white';
  const label = 'block text-xs font-medium text-slate-600 mb-1';

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-slate-800">Nova Ordem de Serviço</h3>
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
            <label className={label}>Observações</label>
            <textarea value={f.observations} onChange={(e) => set('observations')(e.target.value)} rows={2} className={`${input} resize-none`} />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancelar</button>
          <button onClick={submit} disabled={!valid}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-medium">
            <Plus size={15} /> Criar O.S.
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal de detalhes                                                   */
/* ------------------------------------------------------------------ */
function OSDetailModal({ os, currentUser, onClose, onAdvance, canAdvanceFrom, onCancel, onUpdate, onRequestParts, addEvent }: {
  os: ServiceOrder; currentUser: AppUser; onClose: () => void;
  onAdvance: (id: string) => void; canAdvanceFrom: (s: OSStatus) => boolean;
  onCancel: (id: string, reason: string) => void;
  onUpdate: (fn: (o: ServiceOrder) => ServiceOrder) => void;
  onRequestParts: () => void;
  addEvent: (o: ServiceOrder, action: string, from?: OSStatus, to?: OSStatus) => ServiceOrder;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [comment, setComment] = useState('');
  const [mat, setMat] = useState({ product: '', code: '', quantity: '1', unit: 'un', unitValue: '' });
  const [lab, setLab] = useState({ technician: os.technician || '', hours: '', hourRate: '', extraHours: '0' });

  const idx = OS_FLOW.indexOf(os.status);
  const isTerminal = os.status === 'Concluída' || os.status === 'Cancelada';
  const canEdit = !isTerminal && (currentUser.role === 'comprador' || currentUser.role === 'gestor');
  const canCancel = !isTerminal && (currentUser.role === 'comprador' || currentUser.role === 'gestor');
  const cost = osCost(os);
  const matCost = os.materials.reduce((s, m) => s + m.quantity * m.unitValue, 0);
  const labCost = cost - matCost;

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

  const input = 'border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white';

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex justify-end" onClick={onClose}>
      <div className="bg-slate-50 w-full max-w-3xl h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="font-bold text-slate-800">{os.number}</h2>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${PRIORITY_BADGE[os.priority]}`}>{os.priority}</span>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[os.status]}`}>{os.status}</span>
              {osIsOverdue(os) && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Atrasada</span>}
            </div>
            <button onClick={onClose} aria-label="Fechar" className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>
          <p className="text-sm text-slate-600 mt-1">{os.title}</p>

          {/* Stepper */}
          <div className="flex items-center gap-1 mt-3 overflow-x-auto pb-1">
            {OS_FLOW.map((s, i) => (
              <Fragment key={s}>
                <div className="flex flex-col items-center min-w-[64px]">
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
        </div>

        <div className="p-6 space-y-5">
          {os.status === 'Cancelada' && (
            <div className="rounded-xl p-4 border bg-red-50 border-red-200">
              <p className="text-sm text-red-700 font-semibold">Cancelada por {os.cancelledBy}</p>
              {os.cancelReason && <p className="text-xs text-red-600 mt-1">Motivo: {os.cancelReason}</p>}
            </div>
          )}

          {/* Dados + Equipamento */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5"><ClipboardList size={13} className="text-violet-600" /> Dados da O.S.</h3>
              <dl className="space-y-1.5 text-xs">
                {[
                  ['Solicitante', os.requester], ['Técnico', os.technician || 'Não atribuído'],
                  ['Tipo', os.type], ['Categoria', os.category], ['Centro de custo', os.costCenter],
                  ['Abertura', new Date(os.openedAt).toLocaleString('pt-BR')], ['Prazo', fmtDate(os.dueDate)],
                  ['Início execução', os.startedAt ? new Date(os.startedAt).toLocaleString('pt-BR') : '—'],
                  ['Conclusão', os.completedAt ? new Date(os.completedAt).toLocaleString('pt-BR') : '—'],
                  ['SLA', `${os.slaHours}h`], ['Tempo decorrido', fmtHours(osElapsedHours(os))],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="text-slate-400">{k}</dt>
                    <dd className="text-slate-700 font-medium text-right">{v}</dd>
                  </div>
                ))}
              </dl>
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
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-400">
                <Paperclip size={12} />
                Anexos (fotos, PDFs, laudos) serão habilitados com o armazenamento do backend.
              </div>
            </div>
          </div>

          {/* Custos: materiais + mão de obra */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5"><PackageSearch size={13} className="text-violet-600" /> Materiais Utilizados</h3>
              <span className="text-xs font-bold text-slate-800">{fmtBRL(matCost)}</span>
            </div>
            {os.materials.length === 0 ? (
              <p className="text-xs text-slate-400 mb-3">Nenhum material lançado.</p>
            ) : (
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

          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5"><HardHat size={13} className="text-violet-600" /> Mão de Obra</h3>
              <span className="text-xs font-bold text-slate-800">{fmtBRL(labCost)}</span>
            </div>
            {os.labor.length === 0 ? (
              <p className="text-xs text-slate-400 mb-3">Nenhuma hora lançada.</p>
            ) : (
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
            <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between text-sm">
              <span className="font-semibold text-slate-600">Custo total da O.S. (atualizado automaticamente)</span>
              <span className="font-bold text-violet-700">{fmtBRL(cost)}</span>
            </div>
          </div>

          {/* Integração com Compras */}
          {os.status === 'Aguardando Peças' && !os.purchaseRequestId && (currentUser.role === 'comprador' || currentUser.role === 'gestor') && (
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

          {/* Comentários */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5"><MessageSquare size={13} className="text-violet-600" /> Comentários</h3>
            <div className="space-y-2.5 mb-3 max-h-56 overflow-y-auto">
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
                      <span className="text-[10px] text-slate-400">{new Date(c.date).toLocaleString('pt-BR')}</span>
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

          {/* Timeline */}
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
                    <p className="text-[10px] text-slate-400">{new Date(e.date).toLocaleString('pt-BR')} · IP e dispositivo registrados pelo backend</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
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
            </div>
            {isTerminal ? (
              <span className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${os.status === 'Concluída' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {os.status === 'Concluída' ? <><CheckCircle2 size={15} /> O.S. Concluída</> : <><XCircle size={15} /> O.S. Cancelada</>}
              </span>
            ) : os.status === 'Aguardando Aprovação' && currentUser.role !== 'gestor' ? (
              <span className="flex items-center gap-2 bg-amber-100 text-amber-700 px-4 py-2 rounded-lg text-sm font-medium">
                <ShieldAlert size={15} /> Aguardando aprovação do gestor
              </span>
            ) : canAdvanceFrom(os.status) && idx < OS_FLOW.length - 1 ? (
              <button onClick={() => onAdvance(os.id)}
                className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-5 py-2 rounded-lg text-sm font-medium shadow-sm shadow-violet-200">
                {os.status === 'Aguardando Aprovação' ? <><ShieldAlert size={15} /> Aprovar e Avançar</> : <><ArrowRight size={15} /> Avançar para {OS_FLOW[idx + 1]}</>}
              </button>
            ) : (
              <span className="flex items-center gap-2 bg-slate-100 text-slate-500 px-4 py-2 rounded-lg text-sm font-medium">
                <FlaskConical size={14} /> Sem ações disponíveis para o seu perfil
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
