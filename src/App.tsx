import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Layout/Sidebar';
import { KanbanPage } from './pages/KanbanPage';
import { DashboardPage } from './pages/DashboardPage';
import { NewRequestPage } from './pages/NewRequestPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

export default function App() {
  return (
    <BrowserRouter>
      <Sidebar />
      <Routes>
        <Route path="/" element={<KanbanPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/nova-solicitacao" element={<NewRequestPage />} />
        <Route path="/ordens" element={<PlaceholderPage title="Ordens de Serviço" />} />
        <Route path="/relatorios" element={<PlaceholderPage title="Relatórios" />} />
        <Route path="/configuracoes" element={<PlaceholderPage title="Configurações" />} />
      </Routes>
    </BrowserRouter>
  );
}
