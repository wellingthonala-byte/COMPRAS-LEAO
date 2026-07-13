import { Plus } from 'lucide-react';
import { ReactNode } from 'react';

/**
 * Casca visual de coluna de Kanban — compartilhada entre o Kanban de
 * Solicitações de Compra e o Kanban de Ordens de Serviço para garantir
 * o mesmo padrão visual e de comportamento.
 */
interface KanbanColumnShellProps {
  label: string;
  count: number;
  dotClass?: string;
  dotColor?: string;
  bgClass: string;
  children: ReactNode;
}

export function KanbanColumnShell({ label, count, dotClass, dotColor, bgClass, children }: KanbanColumnShellProps) {
  return (
    <div className={`flex-shrink-0 w-72 flex flex-col rounded-2xl ${bgClass} border border-slate-200 self-start`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${dotClass ?? ''}`} style={dotColor ? { backgroundColor: dotColor } : undefined} />
          <span className="text-sm font-semibold text-slate-700">{label}</span>
          <span className="bg-white text-slate-500 text-xs font-bold px-2 py-0.5 rounded-full border border-slate-200">{count}</span>
        </div>
      </div>
      <div className="p-3 space-y-3">
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-300">
            <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center mb-2">
              <Plus size={18} className="text-slate-300" />
            </div>
            <p className="text-xs">Nenhum registro</p>
          </div>
        ) : children}
      </div>
    </div>
  );
}
