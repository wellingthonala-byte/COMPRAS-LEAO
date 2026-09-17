import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Layout/Sidebar';
import { KanbanPage } from './pages/KanbanPage';
import { DashboardPage } from './pages/DashboardPage';
import { NewRequestPage } from './pages/NewRequestPage';
import { ReportsPage } from './pages/ReportsPage';
import { FinancePage } from './pages/FinancePage';
import { SettingsPage } from './pages/SettingsPage';
import { ServiceOrdersPage } from './pages/ServiceOrdersPage';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { PurchaseRequest } from './types';
import { AppUser } from './data/users';
import { getSupabase } from './lib/supabase';
import { fetchRequests, insertStatusHistory, logoutSupabase, revalidateSession } from './lib/backend';
import { initInstallments } from './lib/financeStore';
import { useLimboAlert } from './lib/useFinanceAlerts';
import { enqueueRequests, flushRequestQueue, getQueuedRequests, pendingRequestSyncCount, syncRequests } from './lib/requestSyncQueue';

const REQUESTS_KEY = 'compras-leao-requests';
const USER_KEY = 'compras-leao-user';

function loadRequests(): PurchaseRequest[] {
  try {
    const raw = localStorage.getItem(REQUESTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* cache corrompido: começa vazio */ }
  return [];
}

function isValidAppUser(parsed: unknown): parsed is AppUser {
  return (
    typeof parsed === 'object' &&
    parsed !== null &&
    typeof (parsed as { id?: unknown }).id === 'string' &&
    typeof (parsed as { role?: unknown }).role === 'string' &&
    ['gestor', 'solicitante', 'comprador', 'financeiro'].includes(
      (parsed as { role: string }).role
    )
  );
}

function loadUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidAppUser(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [requests, setRequests] = useState<PurchaseRequest[]>(loadRequests);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(loadUser);
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'online' | 'offline'>('idle');
  const [pendingSync, setPendingSync] = useState(0);
  const prevRequests = useRef<PurchaseRequest[]>(requests);
  const remoteLoaded = useRef(false);
  // O link do e-mail "Esqueci minha senha" autentica no Supabase e dispara
  // este evento antes de qualquer outra coisa — sem isso, a tela normal de
  // login abriria por cima e o usuário nunca veria onde digitar a senha nova.
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    const { data } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Cache local sempre atualizado (fallback offline)
  useEffect(() => {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
  }, [requests]);

  useEffect(() => {
    if (currentUser) localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
    else localStorage.removeItem(USER_KEY);
  }, [currentUser]);

  // Ao logar: busca as solicitações do Supabase — fonte da verdade.
  // Se o servidor não responder (offline / login local), mantém o cache do navegador.
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    setSyncState('syncing');
    // As parcelas têm cache e fila próprios (lib/financeStore) e carregam em
    // paralelo: uma falha aqui não deve impedir o Kanban de abrir.
    void initInstallments();
    void (async () => {
      // Reenvia pendências de uma sessão anterior ANTES do fetch: se o fetch
      // respondesse primeiro (ou em paralelo), setRequests(remote) substituiria
      // a tela por uma versão do servidor que ainda não contém essas pendências,
      // e elas deixariam de aparecer como "changed" (diff por identidade).
      await flushRequestQueue(currentUser.id);
      if (cancelled) return;
      setPendingSync(pendingRequestSyncCount());
      const remote = await fetchRequests();
      if (cancelled) return;
      if (remote === null) {
        setSyncState('offline');
        return;
      }
      remoteLoaded.current = true;
      // O que ainda restar na fila (o flush acima pode ter falhado de novo,
      // ou algo foi enfileirado durante a própria janela de sincronização)
      // vence sobre o remoto — senão a pendência some silenciosamente da tela.
      const queued = getQueuedRequests();
      const merged = queued.length === 0
        ? remote
        : (() => {
            const byId = new Map(remote.map((r) => [r.id, r]));
            for (const q of queued) byId.set(q.id, q);
            return [...byId.values()];
          })();
      prevRequests.current = merged;
      setRequests(merged);
      setSyncState('online');
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  // Sincroniza com o Supabase apenas as solicitações que mudaram (debounce).
  // O que falhar entra numa fila (lib/requestSyncQueue) em vez de sumir num
  // console.warn — o usuário passa a ver quando algo não chegou ao servidor.
  useEffect(() => {
    if (!currentUser) { prevRequests.current = requests; return; }
    const prev = prevRequests.current;
    const prevById = new Map(prev.map((r) => [r.id, r]));
    const changed = requests.filter((r) => prevById.get(r.id) !== r);
    // Entradas de histórico novas desde a última sincronização CONFIRMADA —
    // só estas vão para status_history. O baseline (prevRequests.current) só
    // avança quando o envio é confirmado (ver abaixo), então uma falha ou um
    // ciclo cancelado faz este cálculo se acumular corretamente no próximo
    // ciclo, em vez de perder entradas.
    const newHistoryByRequest = changed.map((r) => ({
      r,
      newEntries: r.history.slice(prevById.get(r.id)?.history.length ?? 0),
    }));
    if (!remoteLoaded.current) {
      // Remoto ainda não chegou (ou o fetch falhou de vez, sem retry nesta
      // sessão): não há como fazer upsert com segurança, mas uma edição
      // genuína feita nesta janela não pode ser descartada — vai para a fila
      // e é reenviada quando o remoto carregar (mesclado por id) ou pelo
      // flush periódico caso o fetch tenha falhado.
      if (changed.length > 0) {
        enqueueRequests(changed);
        setPendingSync(pendingRequestSyncCount());
      }
      prevRequests.current = requests;
      return;
    }
    if (changed.length === 0) return;
    const historyByRequest = new Map(
      newHistoryByRequest
        .filter(({ newEntries }) => newEntries.length > 0)
        .map(({ r, newEntries }) => [r.id, { entries: newEntries, fallbackStatus: r.status }])
    );
    const t = setTimeout(() => {
      syncRequests(changed, currentUser.id, historyByRequest).then((ok) => {
        setPendingSync(pendingRequestSyncCount());
        if (!ok) return;
        // Só avança o baseline quando o envio é confirmado: se este efeito
        // tivesse sido cancelado antes de disparar (nova mudança de requests
        // em menos de 800ms) ou o upsert tivesse falhado, o próximo ciclo
        // recalcula o diff contra o baseline antigo e inclui esta alteração
        // — nunca é descartada silenciosamente.
        prevRequests.current = requests;
        for (const { r, newEntries } of newHistoryByRequest) {
          if (newEntries.length > 0) void insertStatusHistory(r.id, currentUser.id, newEntries, r.status);
        }
      });
    }, 800);
    return () => clearTimeout(t);
  }, [requests, currentUser]);

  // Enquanto houver solicitações pendentes, tenta reenviar periodicamente
  useEffect(() => {
    if (!currentUser || pendingSync === 0) return;
    const t = setInterval(() => {
      flushRequestQueue(currentUser.id).then(() => setPendingSync(pendingRequestSyncCount()));
    }, 20000);
    return () => clearInterval(t);
  }, [currentUser, pendingSync]);

  // Alerta de pedidos aprovados e não comprados. Fica aqui, e não na tela do
  // Financeiro, para disparar no login independentemente da página aberta.
  useLimboAlert(requests, currentUser);

  // Fecha a escalação de privilégio de editar `compras-leao-user` no
  // localStorage: o papel era aceito sem checagem nenhuma no boot, então
  // trocar "role":"solicitante" por "role":"gestor" e recarregar bastava
  // para aprovar mérito/valor em nome de outra pessoa. Revalida contra o
  // Supabase assim que a sessão é uma sessão real — se a sessão não existir
  // mais ou for de outro usuário, desloga; se só não der pra verificar
  // agora (rede fora), não mexe em nada (mesma tolerância a offline que o
  // resto do app já tem).
  useEffect(() => {
    if (!currentUser || currentUser.authSource !== 'supabase') return;
    let cancelled = false;
    revalidateSession(currentUser).then((result) => {
      if (cancelled) return;
      if (result.status === 'invalid') {
        setCurrentUser(null);
      } else if (result.status === 'ok' && (result.user.role !== currentUser.role || result.user.name !== currentUser.name)) {
        setCurrentUser(result.user);
      }
    });
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  const handleLogout = () => {
    logoutSupabase();
    setCurrentUser(null);
  };

  if (passwordRecovery) {
    return <ResetPasswordPage onDone={() => { setPasswordRecovery(false); getSupabase().auth.signOut(); }} />;
  }

  if (!currentUser) {
    return <LoginPage onLogin={setCurrentUser} />;
  }

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      {syncState === 'syncing' && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-violet-600 text-white text-xs px-4 py-1.5 rounded-b-xl shadow-lg">
          Sincronizando com o servidor...
        </div>
      )}
      {syncState === 'offline' && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-white text-xs px-4 py-1.5 rounded-b-xl shadow-lg">
          Sem conexão com o servidor — exibindo dados locais. Entre com seu e-mail para sincronizar.
        </div>
      )}
      {syncState !== 'offline' && pendingSync > 0 && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-white text-xs px-4 py-1.5 rounded-b-xl shadow-lg">
          {pendingSync === 1
            ? '1 solicitação não foi salva no servidor — tentando novamente...'
            : `${pendingSync} solicitações não foram salvas no servidor — tentando novamente...`}
        </div>
      )}
      <Sidebar currentUser={currentUser} onLogout={handleLogout} />
      <Routes>
        <Route path="/" element={<KanbanPage requests={requests} setRequests={setRequests} currentUser={currentUser} />} />
        <Route path="/dashboard" element={<DashboardPage requests={requests} currentUser={currentUser} />} />
        <Route path="/nova-solicitacao" element={<NewRequestPage requests={requests} currentUser={currentUser} onAdd={(r) => setRequests((prev) => [r, ...prev])} />} />
        <Route path="/ordens" element={<ServiceOrdersPage currentUser={currentUser} requests={requests} onCreatePurchaseRequest={(r) => setRequests((prev) => [r, ...prev])} />} />
        <Route path="/financeiro" element={<FinancePage requests={requests} setRequests={setRequests} currentUser={currentUser} />} />
        <Route path="/relatorios" element={<ReportsPage requests={requests} />} />
        <Route path="/configuracoes" element={<SettingsPage currentUser={currentUser} requests={requests} />} />
      </Routes>
    </BrowserRouter>
  );
}
