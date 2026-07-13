import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Layout/Sidebar';
import { KanbanPage } from './pages/KanbanPage';
import { DashboardPage } from './pages/DashboardPage';
import { NewRequestPage } from './pages/NewRequestPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { mockRequests } from './data/mockData';
import { PurchaseRequest } from './types';
import { AppUser } from './data/users';

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

  useEffect(() => {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
  }, [requests]);

  useEffect(() => {
    if (currentUser) localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
    else localStorage.removeItem(USER_KEY);
  }, [currentUser]);

  if (!currentUser) {
    return <LoginPage onLogin={setCurrentUser} />;
  }

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Sidebar currentUser={currentUser} onLogout={() => setCurrentUser(null)} />
      <Routes>
        <Route path="/" element={<KanbanPage requests={requests} setRequests={setRequests} currentUser={currentUser} />} />
        <Route path="/dashboard" element={<DashboardPage requests={requests} />} />
        <Route path="/nova-solicitacao" element={<NewRequestPage requests={requests} currentUser={currentUser} onAdd={(r) => setRequests((prev) => [r, ...prev])} />} />
        <Route path="/ordens" element={<PlaceholderPage title="Ordens de Serviço" />} />
        <Route path="/relatorios" element={<ReportsPage requests={requests} />} />
        <Route path="/configuracoes" element={<SettingsPage currentUser={currentUser} requests={requests} />} />
      </Routes>
    </BrowserRouter>
  );
}
