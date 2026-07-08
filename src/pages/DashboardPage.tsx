import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, CheckCircle, AlertTriangle, Clock, Activity,
  DollarSign, Kanban, ClipboardList, BarChart3, Users, RefreshCw,
  ArrowUpRight,
} from 'lucide-react';
import { Header } from '../components/Layout/Header';
import { colorFromInitials } from '../utils/colors';
import { PurchaseRequest } from '../types';

interface DashboardPageProps { requests: PurchaseRequest[] }

const STATUS_COLORS: Record<string, string> = {
  'Nova Solicitação': '#7c3aed',
  'Em Aprovação': '#6366f1',
  'Em Cotação': '#3b82f6',
  'Comprado': '#10b981',
  'Em Rota': '#f59e0b',
  'Em Serviço': '#f97316',
  'Disponível para Retirada': '#94a3b8',
  'Finalizado': '#8b5cf6',
};

const STATUS_DOT: Record<string, string> = {
  'Nova Solicitação': 'bg-violet-700',
  'Em Aprovação': 'bg-indigo-500',
  'Em Cotação': 'bg-blue-500',
  'Comprado': 'bg-emerald-500',
  'Em Rota': 'bg-amber-500',
  'Em Serviço': 'bg-orange-500',
  'Disponível para Retirada': 'bg-slate-400',
  'Finalizado': 'bg-purple-500',
};

const SECTOR_COLORS = ['#3b82f6', '#10b981', '#6366f1', '#f59e0b', '#ef4444', '#ec4899'];

function MiniSparkline({ color, up }: { color: string; up: boolean }) {
  const points = up
    ? '0,28 10,22 20,25 30,18 40,20 50,12 60,8'
    : '0,10 10,16 20,12 30,18 40,14 50,20 60,24';
  return (
    <svg width="64" height="32" viewBox="0 0 64 32" fill="none">
      <polyline points={points} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DonutChart({ slices }: { slices: { value: number; color: string }[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <div className="w-32 h-32 rounded-full bg-slate-100 flex items-center justify-center text-xs text-slate-400">Sem dados</div>;

  let cumulative = 0;
  const r = 54;
  const cx = 64;
  const cy = 64;
  const circumference = 2 * Math.PI * r;

  return (
    <svg width="128" height="128" viewBox="0 0 128 128">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth="20" />
      {slices.map((s, i) => {
        if (s.value === 0) return null;
        const offset = circumference - (s.value / total) * circumference;
        const rotation = (cumulative / total) * 360 - 90;
        cumulative += s.value;
        return (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="20"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(${rotation} ${cx} ${cy})`}
            strokeLinecap="butt"
          />
        );
      })}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="18" fontWeight="700" fill="#1e293b">{total}</text>
      <text x={cx} y={cx + 10} textAnchor="middle" fontSize="10" fill="#94a3b8">Total</text>
    </svg>
  );
}

function LineChart({ data }: { data: { label: string; value: number }[] }) {
  if (data.length < 2) return null;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const w = 300;
  const h = 120;
  const padX = 8;
  const padY = 10;
  const step = (w - padX * 2) / (data.length - 1);

  const pts = data.map((d, i) => {
    const x = padX + i * step;
    const y = padY + (1 - d.value / maxVal) * (h - padY * 2);
    return { x, y };
  });

  const path = pts.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ');
  const area = `${path} L${pts[pts.length - 1].x},${h} L${pts[0].x},${h} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="overflow-visible">
      <defs>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#lineGrad)" />
      <path d={path} stroke="#7c3aed" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="white" stroke="#7c3aed" strokeWidth="2" />
      ))}
    </svg>
  );
}

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (d > 0) return `Há ${d}d`;
  if (h > 0) return `Há ${h}h`;
  return 'Agora';
}

export function DashboardPage({ requests }: DashboardPageProps) {
  const navigate = useNavigate();
  const [dateRange] = useState('01/06/2024 - 07/06/2024');

  const total = requests.length;
  const finalized = requests.filter((r) => r.status === 'Finalizado').length;
  const open = requests.filter((r) => r.status !== 'Finalizado').length;
  const machineStopped = requests.filter((r) => r.priority === 'Máquina Parada' && r.status !== 'Finalizado').length;
  const overdue = requests.filter((r) => r.status !== 'Finalizado' && new Date(r.deliveryForecast) < new Date()).length;
  const totalValue = requests.reduce((sum, r) => sum + (r.value || 0), 0);
  const avgValue = total > 0 ? totalValue / total : 0;
  const maxRequest = requests.reduce((max, r) => ((r.value || 0) > (max?.value || 0) ? r : max), requests[0]);

  const byStatus = [
    'Nova Solicitação', 'Em Aprovação', 'Em Cotação', 'Comprado',
    'Em Rota', 'Em Serviço', 'Disponível para Retirada', 'Finalizado',
  ].map((s) => ({ status: s, count: requests.filter((r) => r.status === s).length }));

  const donutSlices = byStatus.map((s) => ({ value: s.count, color: STATUS_COLORS[s.status] }));

  const recentRequests = useMemo(
    () => [...requests].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8),
    [requests]
  );

  const sectors = ['Produção', 'Manutenção', 'TI', 'Administrativo', 'RH', 'Logística'];
  const sectorData = sectors.map((s, i) => ({
    name: s,
    count: requests.filter((r) => r.sector === s).length,
    color: SECTOR_COLORS[i],
  })).filter((s) => s.count > 0);
  const sectorTotal = sectorData.reduce((s, x) => s + x.count, 0);

  const evolutionData = useMemo(() => {
    const days: { label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      const dateStr = d.toISOString().slice(0, 10);
      const value = requests.filter((r) => r.createdAt.slice(0, 10) === dateStr).length;
      days.push({ label, value });
    }
    return days;
  }, [requests]);

  const totalEvolution = evolutionData.reduce((s, d) => s + d.value, 0);

  const stats = [
    { label: 'Total de Solicitações', value: total, icon: Package, color: 'text-violet-600', bg: 'bg-violet-50', sparkColor: '#7c3aed', up: true, pct: 18 },
    { label: 'Em Aberto', value: open, icon: Activity, color: 'text-blue-600', bg: 'bg-blue-50', sparkColor: '#3b82f6', up: true, pct: 8 },
    { label: 'Finalizadas', value: finalized, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', sparkColor: '#10b981', up: true, pct: 50 },
    { label: 'Máquina Parada', value: machineStopped, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', sparkColor: '#ef4444', up: machineStopped > 0, pct: 20 },
    { label: 'Em Atraso', value: overdue, icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50', sparkColor: '#f97316', up: false, pct: 25 },
    { label: 'Valor Total', value: formatCurrency(totalValue), icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50', sparkColor: '#10b981', up: true, pct: 12, isString: true },
  ];

  const shortcuts = [
    { icon: ClipboardList, label: 'Nova Solicitação', sub: 'Criar uma nova solicitação de compra', to: '/nova-solicitacao', color: 'bg-violet-50 text-violet-600' },
    { icon: Kanban, label: 'Kanban', sub: 'Visualizar fluxo de solicitações', to: '/', color: 'bg-blue-50 text-blue-600' },
    { icon: BarChart3, label: 'Relatórios', sub: 'Analisar dados e indicadores', to: '/relatorios', color: 'bg-emerald-50 text-emerald-600' },
    { icon: Users, label: 'Fornecedores', sub: 'Gerenciar fornecedores', to: '/configuracoes', color: 'bg-orange-50 text-orange-600' },
  ];

  return (
    <div className="flex flex-col min-h-screen pl-60 bg-slate-50">
      <Header title="Dashboard" subtitle="Visão geral das solicitações de compra" requests={requests} />

      <div className="flex-1 pt-16 px-6 py-6 space-y-5">

        {/* Date range */}
        <div className="flex items-center justify-between">
          <div />
          <div className="flex items-center gap-2 text-sm text-slate-500 border border-slate-200 bg-white rounded-lg px-3 py-1.5">
            <Clock size={14} className="text-slate-400" />
            {dateRange}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-6 gap-4">
          {stats.map(({ label, value, icon: Icon, color, bg, sparkColor, up, pct, isString }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center`}>
                  <Icon size={17} className={color} />
                </div>
                <MiniSparkline color={sparkColor} up={up} />
              </div>
              <p className={`text-2xl font-bold text-slate-800 ${isString ? 'text-lg' : ''}`}>{value}</p>
              <p className="text-xs text-slate-500 leading-tight">{label}</p>
              <p className={`text-xs font-medium ${up ? 'text-emerald-500' : 'text-red-400'}`}>
                <ArrowUpRight size={11} className={`inline ${up ? '' : 'rotate-180'}`} />
                {' '}{pct}% vs. período anterior
              </p>
            </div>
          ))}
        </div>

        {/* Middle row: Status chart + Evolution + Recent */}
        <div className="grid grid-cols-3 gap-5">

          {/* Solicitações por Status */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-700 text-sm">Solicitações por Status</h3>
              <button className="text-slate-400 hover:text-slate-600"><RefreshCw size={13} /></button>
            </div>
            <div className="flex justify-center mb-4">
              <DonutChart slices={donutSlices} />
            </div>
            <div className="space-y-1.5">
              <div className="grid grid-cols-3 text-xs text-slate-400 font-medium mb-1 px-1">
                <span>Status</span>
                <span className="text-center">Qtd</span>
                <span className="text-right">%</span>
              </div>
              {byStatus.map(({ status, count }) => (
                <div key={status} className="grid grid-cols-3 text-xs items-center px-1 py-0.5 hover:bg-slate-50 rounded">
                  <span className="flex items-center gap-1.5 truncate text-slate-600">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[status]}`} />
                    <span className="truncate">{status}</span>
                  </span>
                  <span className="text-center font-semibold text-slate-800">{count}</span>
                  <span className="text-right text-slate-500">{total > 0 ? Math.round((count / total) * 100) : 0}%</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1 mt-3 text-xs text-slate-400">
              <RefreshCw size={10} /> Atualizado agora há pouco
            </div>
          </div>

          {/* Evolução das Solicitações */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-slate-700 text-sm">Evolução das Solicitações</h3>
              <span className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-500">Últimos 7 dias</span>
            </div>
            <div className="mt-4 mb-2">
              <LineChart data={evolutionData} />
            </div>
            <div className="flex justify-between mt-1 px-1">
              {evolutionData.map((d) => (
                <span key={d.label} className="text-[10px] text-slate-400">{d.label}</span>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4 border-t border-slate-100 pt-3">
              <div className="text-center">
                <p className="text-xs text-slate-500">Abertas</p>
                <p className="font-bold text-slate-800">{open} <span className="text-emerald-500 text-xs font-medium">↑8%</span></p>
              </div>
              <div className="text-center border-x border-slate-100">
                <p className="text-xs text-slate-500">Finalizadas</p>
                <p className="font-bold text-slate-800">{finalized} <span className="text-emerald-500 text-xs font-medium">↑50%</span></p>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500">Total</p>
                <p className="font-bold text-slate-800">{totalEvolution} <span className="text-emerald-500 text-xs font-medium">↑18%</span></p>
              </div>
            </div>
          </div>

          {/* Solicitações Recentes */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-700 text-sm">Solicitações Recentes</h3>
              <button onClick={() => navigate('/')} className="text-xs text-violet-600 hover:text-violet-800 font-medium">Ver todas</button>
            </div>
            <div className="space-y-2.5 overflow-y-auto max-h-[360px]">
              {recentRequests.map((r) => (
                <div key={r.id} className="flex items-center gap-3 py-1.5 border-b border-slate-50 last:border-0">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: colorFromInitials(r.requesterInitials) }}
                  >
                    {r.requesterInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700">{r.number}</p>
                    <p className="text-xs text-slate-500 truncate">{r.items[0]?.description}</p>
                    <p className="text-[10px] text-slate-400">{r.requester} · {r.sector}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                      r.priority === 'Máquina Parada' ? 'bg-red-100 text-red-700' :
                      r.priority === 'Urgente' ? 'bg-orange-100 text-orange-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>{r.priority}</span>
                    <span className="text-[10px] text-slate-400">{relativeTime(r.createdAt)}</span>
                  </div>
                </div>
              ))}
              {recentRequests.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-8">Nenhuma solicitação</p>
              )}
            </div>
            <div className="flex items-center gap-1 mt-3 text-xs text-slate-400">
              <RefreshCw size={10} /> Atualizado agora há pouco
            </div>
          </div>
        </div>

        {/* Bottom row: Financial + Category + Shortcuts + Insight */}
        <div className="grid grid-cols-3 gap-5">

          {/* Resumo Financeiro */}
          <div className="col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center">
                <DollarSign size={15} className="text-blue-600" />
              </div>
              <h3 className="font-semibold text-slate-700 text-sm">Resumo Financeiro</h3>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Valor Total</p>
                  <p className="text-2xl font-bold text-slate-800">{formatCurrency(totalValue)}</p>
                  <p className="text-xs text-emerald-500 font-medium mt-0.5">↑ 12% vs. período anterior</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Média por Solicitação</p>
                  <p className="text-xl font-bold text-slate-800">{formatCurrency(avgValue)}</p>
                  <p className="text-xs text-emerald-500 font-medium mt-0.5">↑ 8% vs. período anterior</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Maior Solicitação</p>
                  <p className="text-xl font-bold text-slate-800">{formatCurrency(maxRequest?.value || 0)}</p>
                  <p className="text-xs text-emerald-500 font-medium mt-0.5">↑ 15% vs. período anterior</p>
                </div>
              </div>

              {/* Valor por Categoria */}
              <div>
                <p className="text-xs font-medium text-slate-600 mb-3">Valor por Categoria</p>
                <div className="flex items-center gap-4">
                  <DonutChart slices={sectorData.map((s) => ({ value: s.count, color: s.color }))} />
                  <div className="space-y-1.5">
                    {sectorData.map((s) => (
                      <div key={s.name} className="flex items-center gap-2 text-xs">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="text-slate-600">{s.name}</span>
                        <span className="text-slate-400 ml-auto">{sectorTotal > 0 ? Math.round((s.count / sectorTotal) * 100) : 0}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Atalhos + Insight */}
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-semibold text-slate-700 text-sm mb-3">Atalhos Rápidos</h3>
              <div className="grid grid-cols-2 gap-2">
                {shortcuts.map(({ icon: Icon, label, sub, to, color }) => (
                  <button
                    key={label}
                    onClick={() => navigate(to)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all text-center"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
                      <Icon size={16} />
                    </div>
                    <p className="text-xs font-semibold text-slate-700 leading-tight">{label}</p>
                    <p className="text-[10px] text-slate-400 leading-tight">{sub}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-violet-600 rounded-2xl p-5 shadow-sm flex-1 relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-white">Insight do Período</p>
                  <button className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center text-white hover:bg-white/30">
                    <ArrowUpRight size={13} />
                  </button>
                </div>
                <p className="text-xs text-violet-200 leading-relaxed">
                  Aumento de 18% nas solicitações em comparação ao período anterior
                </p>
              </div>
              <div className="absolute bottom-0 right-0 opacity-10">
                <MiniSparkline color="white" up={true} />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
