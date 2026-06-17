import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Header } from '../components/Layout/Header';
import { Priority, Sector } from '../types';

interface ItemForm {
  id: string;
  description: string;
  quantity: number;
  application: string;
  priority: Priority;
  deliveryForecast: string;
  technicalSpec: string;
  observations: string;
}

const priorities: Priority[] = ['Não Urgente', 'Urgente', 'Máquina Parada'];
const sectors: Sector[] = ['Produção', 'Manutenção', 'Administrativo', 'TI', 'RH', 'Logística'];
const applications = ['Manutenção Geral', 'Produção', 'EPI', 'Escritório', 'TI', 'Logística'];

function newItem(n: number): ItemForm {
  return { id: String(n), description: '', quantity: 1, application: '', priority: 'Não Urgente', deliveryForecast: '', technicalSpec: '', observations: '' };
}

export function NewRequestPage() {
  const navigate = useNavigate();
  const [requester, setRequester] = useState('');
  const [sector, setSector] = useState<Sector | ''>('');
  const [priority, setPriority] = useState<Priority>('Não Urgente');
  const [deliveryForecast, setDeliveryForecast] = useState('');
  const [observations, setObservations] = useState('');
  const [items, setItems] = useState<ItemForm[]>([newItem(1)]);
  const [submitted, setSubmitted] = useState(false);

  const addItem = () => setItems((prev) => [...prev, newItem(prev.length + 1)]);
  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));
  const updateItem = (id: string, field: keyof ItemForm, value: string | number) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => navigate('/'), 1500);
  };

  if (submitted) {
    return (
      <div className="flex flex-col min-h-screen pl-60 bg-slate-50">
        <Header title="Nova Solicitação" />
        <div className="flex-1 pt-16 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✓</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Solicitação criada!</h2>
            <p className="text-slate-500">Redirecionando para o Kanban...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen pl-60 bg-slate-50">
      <Header title="Nova Solicitação de Compra" />
      <div className="flex-1 pt-16 px-6 py-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-5 transition-colors">
          <ArrowLeft size={16} /> Voltar
        </button>

        <form onSubmit={handleSubmit} className="max-w-3xl space-y-5">
          {/* Dados Gerais */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center font-bold">1</span>
              Dados Gerais
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Solicitante <span className="text-red-500">*</span></label>
                <input
                  type="text" required value={requester}
                  onChange={(e) => setRequester(e.target.value)}
                  placeholder="Nome do solicitante"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Setor <span className="text-red-500">*</span></label>
                <select required value={sector} onChange={(e) => setSector(e.target.value as Sector)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white text-slate-700">
                  <option value="">Selecione o setor</option>
                  {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Prioridade <span className="text-red-500">*</span></label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white text-slate-700">
                  {priorities.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Previsão de Entrega</label>
                <input type="date" value={deliveryForecast} onChange={(e) => setDeliveryForecast(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Observações Gerais</label>
                <textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows={3}
                  placeholder="Observações sobre a solicitação..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
              </div>
            </div>
          </div>

          {/* Itens */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-700 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                Itens da Solicitação
              </h2>
              <button type="button" onClick={addItem}
                className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 font-medium border border-violet-200 hover:border-violet-400 px-3 py-1.5 rounded-lg transition-colors">
                <Plus size={14} /> Adicionar Item
              </button>
            </div>

            <div className="space-y-4">
              {items.map((item, idx) => (
                <div key={item.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-slate-600">Item {idx + 1}</span>
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Descrição <span className="text-red-500">*</span></label>
                      <input type="text" required value={item.description}
                        onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                        placeholder="Descrição do material/serviço"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Quantidade <span className="text-red-500">*</span></label>
                      <input type="number" min={1} required value={item.quantity}
                        onChange={(e) => updateItem(item.id, 'quantity', Number(e.target.value))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Aplicação</label>
                      <select value={item.application} onChange={(e) => updateItem(item.id, 'application', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white text-slate-700">
                        <option value="">Selecione</option>
                        {applications.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Prioridade do Item</label>
                      <select value={item.priority} onChange={(e) => updateItem(item.id, 'priority', e.target.value as Priority)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white text-slate-700">
                        {priorities.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Previsão do Item</label>
                      <input type="date" value={item.deliveryForecast}
                        onChange={(e) => updateItem(item.id, 'deliveryForecast', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white" />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Especificação Técnica</label>
                      <textarea value={item.technicalSpec} onChange={(e) => updateItem(item.id, 'technicalSpec', e.target.value)} rows={2}
                        placeholder="Especificações técnicas..."
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none bg-white" />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Observações do Item</label>
                      <textarea value={item.observations} onChange={(e) => updateItem(item.id, 'observations', e.target.value)} rows={2}
                        placeholder="Observações sobre este item..."
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none bg-white" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pb-8">
            <button type="button" onClick={() => navigate(-1)}
              className="px-5 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium border border-slate-200">
              Cancelar
            </button>
            <button type="submit"
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm shadow-violet-200">
              <Plus size={15} /> Criar Solicitação
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
