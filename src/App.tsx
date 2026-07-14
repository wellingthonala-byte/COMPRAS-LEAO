import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Layout/Sidebar';
import { KanbanPage } from './pages/KanbanPage';
import { DashboardPage } from './pages/DashboardPage';
import { NewRequestPage } from './pages/NewRequestPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ServiceOrdersPage } from './pages/ServiceOrdersPage';
import { LoginPage } from './pages/LoginPage';
import { mockRequests } from './data/mockData';
import { PurchaseRequest } from './types';
import { AppUser } from './data/users';
import { fetchRequests, upsertRequests, logoutSupabase } from './lib/backend';

const REQUESTS_KEY = 'compras-leao-requests';
const USER_KEY = 'compras-leao-user';

function loadRequests(): PurchaseRequest[] {
  try {
    const raw = localStorage.getItem(REQUESTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* dados corrompidos: recomeça do mock */ }
  return mockRequests;
}

function loadUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AppUser) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [requests, setRequests] = useState<PurchaseRequest[]>(loadRequests);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(loadUser);
  const prevRequests = useRef<PurchaseRequest[]>(requests);
  const remoteLoaded = useRef(false);

  // Cache local sempre atualizado (fallback offline)
  useEffect(() => {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
  }, [requests]);

  useEffect(() => {
    if (currentUser) localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
    else localStorage.removeItem(USER_KEY);
  }, [currentUser]);

  // Ao logar: busca as solicitações do Supabase (se disponível)
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    fetchRequests().then((remote) => {
      if (cancelled || !remote) return;
      remoteLoaded.current = true;
      if (remote.length > 0) {
        prevRequests.current = remote;
        setRequests(remote);
      }
    });
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  // Sincroniza com o Supabase apenas as solicitações que mudaram (debounce)
  useEffect(() => {
    if (!currentUser || !remoteLoaded.current) { prevRequests.current = requests; return; }
    const prev = prevRequests.current;
    const prevById = new Map(prev.map((r) => [r.id, r]));
    const changed = requests.filter((r) => prevById.get(r.id) !== r);
    prevRequests.current = requests;
    if (changed.length === 0) return;
    const t = setTimeout(() => { upsertRequests(changed, currentUser.id); }, 800);
    return () => clearTimeout(t);
  }, [requests, currentUser]);

  const handleLogout = () => {
    logoutSupabase();
    setCurrentUser(null);
  };

  if (!currentUser) {
    return <LoginPage onLogin={setCurrentUser} />;
  }

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Sidebar currentUser={currentUser} onLogout={handleLogout} />
      <Routes>
        <Route path="/" element={<KanbanPage requests={requests} setRequests={setRequests} currentUser={currentUser} />} />
        <Route path="/dashboard" element={<DashboardPage requests={requests} />} />
        <Route path="/nova-solicitacao" element={<NewRequestPage requests={requests} currentUser={currentUser} onAdd={(r) => setRequests((prev) => [r, ...prev])} />} />
        <Route path="/ordens" element={<ServiceOrdersPage currentUser={currentUser} requests={requests} onCreatePurchaseRequest={(r) => setRequests((prev) => [r, ...prev])} />} />
        <Route path="/relatorios" element={<ReportsPage requests={requests} />} />
        <Route path="/configuracoes" element={<SettingsPage currentUser={currentUser} requests={requests} />} />
      </Routes>
    </BrowserRouter>
  );
}
