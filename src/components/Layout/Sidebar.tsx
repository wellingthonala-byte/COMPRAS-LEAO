import { LayoutDashboard, Kanban, ClipboardList, BarChart3, Settings, ShoppingCart, LogOut, ShieldCheck } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { AppUser } from '../../data/users';
import { colorFromInitials } from '../../utils/colors';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', to: '/dashboard' },
  { icon: Kanban, label: 'Kanban', to: '/' },
  { icon: ClipboardList, label: 'Ordens de Serviço', to: '/ordens' },
  { icon: BarChart3, label: 'Relatórios', to: '/relatorios' },
  { icon: Settings, label: 'Configurações', to: '/configuracoes' },
];

interface SidebarProps {
  currentUser: AppUser;
  onLogout: () => void;
}

export function Sidebar({ currentUser, onLogout }: SidebarProps) {
  return (
    <aside className="w-60 bg-white border-r border-slate-200 flex flex-col h-screen fixed left-0 top-0 z-30">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100">
        <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center flex-shrink-0">
          <ShoppingCart className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="font-bold text-slate-800 text-sm leading-tight">Compras Leão</p>
          <p className="text-xs text-slate-400">Gestão de Compras</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ icon: Icon, label, to }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-violet-50 text-violet-700'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`w-4.5 h-4.5 ${isActive ? 'text-violet-600' : 'text-slate-400'}`} size={18} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-slate-100">
        <div className="flex items-center gap-3 px-3 py-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: colorFromInitials(currentUser.initials) }}
          >
            {currentUser.initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-700 truncate">{currentUser.name}</p>
            <div className="flex items-center gap-1 mt-0.5">
              {currentUser.role === 'gestor' ? (
                <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                  <ShieldCheck size={10} /> Gestor
                </span>
              ) : (
                <span className="text-[10px] text-slate-400">Solicitante</span>
              )}
            </div>
          </div>
          <button onClick={onLogout} className="text-slate-400 hover:text-red-500 transition-colors" title="Sair">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
