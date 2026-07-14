import { useState } from 'react';
import { ShoppingCart, Eye, EyeOff } from 'lucide-react';
import { AppUser, authenticate } from '../data/users';
import { loginWithSupabase } from '../lib/backend';

interface LoginPageProps {
  onLogin: (user: AppUser) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const input = name.trim();

    // E-mail → autentica no Supabase (usuários reais migrados)
    if (input.includes('@')) {
      try {
        const user = await loginWithSupabase(input, password);
        if (user) { onLogin(user); return; }
        setError('E-mail ou senha incorretos.');
      } catch {
        setError('Não foi possível conectar ao servidor. Verifique sua internet.');
      }
      setLoading(false);
      return;
    }

    // Nome de usuário → autenticação local (usuários de teste)
    setTimeout(() => {
      const user = authenticate(input, password);
      if (user) {
        onLogin(user);
      } else {
        setError('Usuário ou senha incorretos.');
        setLoading(false);
      }
    }, 400);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-200">
            <ShoppingCart size={26} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Compras Leão</h1>
          <p className="text-slate-500 text-sm mt-1">Sistema de gestão de compras</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Usuário ou e-mail</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => { setName(e.target.value); setError(''); }}
                placeholder="E-mail (conta migrada) ou nome de usuário"
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="••••••"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm shadow-violet-200"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
