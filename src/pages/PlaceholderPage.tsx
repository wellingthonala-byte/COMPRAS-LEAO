import { Construction } from 'lucide-react';
import { Header } from '../components/Layout/Header';

interface Props { title: string }

export function PlaceholderPage({ title }: Props) {
  return (
    <div className="flex flex-col min-h-screen pl-60 bg-slate-50">
      <Header title={title} />
      <div className="flex-1 pt-16 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <Construction size={48} className="mx-auto mb-3 opacity-40" />
          <p className="text-lg font-semibold">Em construção</p>
          <p className="text-sm">Esta página estará disponível em breve.</p>
        </div>
      </div>
    </div>
  );
}
