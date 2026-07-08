import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Layout/Sidebar';
import { KanbanPage } from './pages/KanbanPage';
import { DashboardPage } from './pages/DashboardPage';
import { NewRequestPage } from './pages/NewRequestPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { LoginPage } from './pages/LoginPage';
import { mockRequests } from './data/mockData';
import { PurchaseRequest } from './types';
import { AppUser } from './data/users';

export default function App() {
  const [requests, setRequests] = useState<PurchaseRequest[]>(mockRequests);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);

  if (!currentUser) {
    return <LoginPage onLogin={setCurrentUser} />;
  }

  return (
    <BrowserRouter>
      <Sidebar currentUser={currentUser} onLogout={() => setCurrentUser(null)} />
      <Routes>
        <Route path="/" element={<KanbanPage requests={requests} setRequests={setRequests} currentUser={currentUser} />} />
        <Route path="/dashboard" element={<DashboardPage requests={requests} />} />
        <Route path="/nova-solicitacao" element={<NewRequestPage requests={requests} currentUser={currentUser} onAdd={(r) => setRequests((prev) => [r, ...prev])} />} />
        <Route path="/ordens" element={<PlaceholderPage title="Ordens de Serviço" />} />
        <Route path="/relatorios" element={<PlaceholderPage title="Relatórios" />} />
        <Route path="/configuracoes" element={<PlaceholderPage title="Configurações" />} />
      </Routes>
    </BrowserRouter>
  );
}
