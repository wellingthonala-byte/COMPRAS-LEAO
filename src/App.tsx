import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Layout/Sidebar';
import { KanbanPage } from './pages/KanbanPage';
import { DashboardPage } from './pages/DashboardPage';
import { NewRequestPage } from './pages/NewRequestPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { mockRequests } from './data/mockData';
import { PurchaseRequest } from './types';

export default function App() {
  const [requests, setRequests] = useState<PurchaseRequest[]>(mockRequests);

  return (
    <BrowserRouter>
      <Sidebar />
      <Routes>
        <Route path="/" element={<KanbanPage requests={requests} setRequests={setRequests} />} />
        <Route path="/dashboard" element={<DashboardPage requests={requests} />} />
        <Route path="/nova-solicitacao" element={<NewRequestPage requests={requests} onAdd={(r) => setRequests((prev) => [r, ...prev])} />} />
        <Route path="/ordens" element={<PlaceholderPage title="Ordens de Serviço" />} />
        <Route path="/relatorios" element={<PlaceholderPage title="Relatórios" />} />
        <Route path="/configuracoes" element={<PlaceholderPage title="Configurações" />} />
      </Routes>
    </BrowserRouter>
  );
}
