import { Plus, Bell, Search, X, ShieldCheck, Clock, ArrowRight, Send } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PurchaseRequest } from '../../types';
import { sendTestNotification, NTFY_TOPIC } from '../../utils/notify';

interface HeaderProps {
  title: string;
  subtitle?: string;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  requests?: PurchaseRequest[];
}

export function Header({ title, subtitle, searchValue, onSearchChange, requests = [] }: HeaderProps) {
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [testStatus, setTestStatus] = useState<string | null>(null);

  const handleTestNotification = async () => {
    setTestStatus('enviando...');
    const result = await sendTestNotification();
    if (result.ok) {
      setTestStatus('✓ enviado!');
    } else {
      setTestStatus(`✗ erro: ${result.error ?? 'rede'}`);
    }
    setTimeout(() => setTestStatus(null), 5000);
  };

  const notifications = requests
    .flatMap((r) =>
      r.history.slice(-1).map((h) => ({
        id: `${r.id}-${h.id}`,
        requestNumber: r.number,
        message: h.action,
        from: h.from,
        to: h.to,
        user: h.user,
        date: h.date,
        isApproval: h.action.includes('Aprovad'),
      }))
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  const markAllRead = () => {
    setReadIds(new Set(notifications.map((n) => n.id)));
  };

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const min = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (d > 0) return `${d}d atrás`;
    if (h > 0) return `${h}h atrás`;
    if (min > 0) return `${min}min atrás`;
    return 'agora';
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 gap-4 fixed top-0 right-0 left-60 z-20">
      <div className="flex-1">
        <h1 className="font-bold text-slate-800 text-base leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>

      {onSearchChange !== undefined && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar solicitação..."
            className="pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
          />
        </div>
      )}

      {/* Notifications */}
      <div className="relative">
        <button
          onClick={() => { setShowNotifications(!showNotifications); if (!showNotifications) markAllRead(); }}
          className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-[9px] font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {showNotifications && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setShowNotifications(false)} />
            <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl border border-slate-200 shadow-xl z-40 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800 text-sm">Notificações</h3>
                <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={16} />
                </button>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-sm">Nenhuma notificação</div>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className={`px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${!readIds.has(n.id) ? 'bg-violet-50/40' : ''}`}>
                      <div className="flex items-start gap-2.5">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${n.isApproval ? 'bg-emerald-100' : 'bg-violet-100'}`}>
                          {n.isApproval ? <ShieldCheck size={13} className="text-emerald-600" /> : <Clock size={13} className="text-violet-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-700">{n.requestNumber} — {n.message}</p>
                          {n.from && n.to && (
                            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                              {n.from} <ArrowRight size={9} /> {n.to}
                            </p>
                          )}
                          <p className="text-xs text-slate-400 mt-0.5">{n.user} · {formatTime(n.date)}</p>
                        </div>
                        {!readIds.has(n.id) && <span className="w-1.5 h-1.5 bg-violet-500 rounded-full flex-shrink-0 mt-2" />}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleTestNotification}
          title={`Testar notificação ntfy (tópico: ${NTFY_TOPIC})`}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-violet-700 border border-slate-200 hover:border-violet-300 px-3 py-2 rounded-lg transition-colors"
        >
          <Send size={13} />
          {testStatus ?? 'Testar ntfy'}
        </button>
        <button
          onClick={() => navigate('/nova-solicitacao')}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm shadow-violet-200"
        >
          <Plus size={16} />
          Nova Solicitação
        </button>
      </div>
    </header>
  );
}
