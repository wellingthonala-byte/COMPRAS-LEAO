import { TrendingUp, Package, CheckCircle, AlertTriangle, Clock, Activity } from 'lucide-react';
import { Header } from '../components/Layout/Header';
import { mockRequests } from '../data/mockData';

export function DashboardPage() {
  const total = mockRequests.length;
  const finalized = mockRequests.filter((r) => r.status === 'Finalizado').length;
  const open = mockRequests.filter((r) => r.status !== 'Finalizado').length;
  const machineStopped = mockRequests.filter((r) => r.priority === 'Máquina Parada' && r.status !== 'Finalizado').length;
  const overdue = mockRequests.filter(
    (r) => r.status !== 'Finalizado' && new Date(r.deliveryForecast) < new Date()
  ).length;
  const totalValue = mockRequests.reduce((sum, r) => sum + (r.value || 0), 0);

  const stats = [
    { label: 'Total', value: total, icon: Package, color: 'text-slate-600', bg: 'bg-slate-100', border: '' },
    { label: 'Em Aberto', value: open, icon: Activity, color: 'text-blue-600', bg: 'bg-blue-100', border: '' },
    { label: 'Finalizadas', value: finalized, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-100', border: '' },
    { label: 'Máq. Parada', value: machineStopped, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-100', border: machineStopped > 0 ? 'ring-2 ring-red-200' : '' },
    { label: 'Em Atraso', value: overdue, icon: Clock, color: 'text-orange-600', bg: 'bg-orange-100', border: overdue > 0 ? 'ring-2 ring-orange-200' : '' },
    { label: 'Valor Total', value: totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), icon: TrendingUp, color: 'text-violet-600', bg: 'bg-violet-100', border: '' },
  ];

  const byStatus = [
    'Nova Solicitação', 'Em Aprovação', 'Em Cotação', 'Comprado', 'Em Rota', 'Em Serviço', 'Disponível p/ Retirada', 'Finalizado',
  ].map((s) => ({ status: s, count: mockRequests.filter((r) => r.status === s).length }));

  const recentRequests = [...mockRequests].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8);

  return (
    <div className="flex flex-col min-h-screen pl-60 bg-slate-50">
      <Header title="Dashboard" subtitle="Visão geral das solicitações de compra" />
      <div className="flex-1 pt-16 px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
          {stats.map(({ label, value, icon: Icon, color, bg, border }) => (
            <div key={label} className={`bg-white rounded-2xl p-4 border border-slate-200 shadow-sm ${border}`}>
              <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3`}>
                <Icon size={18} className={color} />
              </div>
              <p className="text-2xl font-bold text-slate-800">{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* By Status */}
          <div className="col-span-1 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-semibold text-slate-700 mb-4 text-sm">Solicitações por Status</h3>
            <div className="space-y-3">
              {byStatus.map(({ status, count }) => (
                <div key={status}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 truncate">{status}</span>
                    <span className="font-semibold text-slate-800 ml-2">{count}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all"
                      style={{ width: total > 0 ? `${(count / total) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Requests */}
          <div className="col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-semibold text-slate-700 mb-4 text-sm">Solicitações Recentes</h3>
            <div className="space-y-2">
              {recentRequests.map((r) => (
                <div key={r.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: r.requesterColor }}>
                    {r.requesterInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-700">{r.number}</span>
                      <span className="text-xs text-slate-500 truncate">{r.items[0]?.description}</span>
                    </div>
                    <p className="text-xs text-slate-400">{r.requester} · {r.sector}</p>
                  </div>
                  <div className="flex-shrink-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      r.priority === 'Máquina Parada' ? 'bg-red-100 text-red-700' :
                      r.priority === 'Urgente' ? 'bg-orange-100 text-orange-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>{r.priority}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
