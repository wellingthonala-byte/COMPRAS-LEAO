import { Plus, Bell, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  title: string;
  subtitle?: string;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
}

export function Header({ title, subtitle, searchValue, onSearchChange }: HeaderProps) {
  const navigate = useNavigate();
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

      <button className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
        <Bell size={18} />
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
      </button>

      <button
        onClick={() => navigate('/nova-solicitacao')}
        className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm shadow-violet-200"
      >
        <Plus size={16} />
        Nova Solicitação
      </button>
    </header>
  );
}
