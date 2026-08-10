import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PiggyBank, TrendingUp, ShieldCheck, Hourglass, Filter, X, Download, FileSpreadsheet,
  ExternalLink, RefreshCw, AlertTriangle, Lock, CloudOff, ChevronRight,
} from 'lucide-react';
import { Header } from '../components/Layout/Header';
import { StackedBars, ChartEmpty } from '../components/UI/ChartKit';
import { PurchaseRequest, Priority, Sector } from '../types';
import { InstallmentStatus } from '../types/finance';
import { AppUser, canViewFinance } from '../data/users';
import { exportCSV, exportExcel, exportName } from '../utils/export';
import { monthKeyOf } from '../lib/finance';
import { getFinanceSettings } from '../lib/financeSettings';
import { BackfillPanel } from '../components/Finance/BackfillPanel';
import { clearFinanceLog, pendingCount, readFinanceLog, useInstallments } from '../lib/financeStore';
import { reconcile } from '../lib/financeSync';
import {
  applyFilters, commitmentSummary, EMPTY_FILTERS, EXPORT_HEADERS, exportRows, FinanceFilters,
  filterOptions, groupByRequest, hasActiveFilters, joinInstallments, limboRequests, monthLabelLong,
  monthlyProjection, rowsOfMonth,
} from '../lib/financeQueries';
const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtCompact = (v: number) =>
  v >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : fmtBRL(v);
const fmtDate = (iso: string) => new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR');

const PRIORITIES: Priority[] = ['Máquina Parada', 'Urgente', 'Não Urgente'];
const SECTORS: Sector[] = ['Produção', 'Manutenção', 'Administrativo', 'TI', 'RH', 'Logística'];
const STATUSES: InstallmentStatus[] = ['Previsto', 'Confirmado', 'Pago', 'Cancelado'];

const SEGMENTS = [
  { key: 'confirmado', label: 'Confirmado', color: '#0d9488' },
  { key: 'previsto', label: 'Previsto', color: '#a78bfa' },
  { key: 'pago', label: 'Pago', color: '#059669' },
];

const STATUS_STYLE: Record<InstallmentStatus, string> = {
  Previsto: 'bg-violet-100 text-violet-700',
  Confirmado: 'bg-teal-100 text-teal-700',
  Pago: 'bg-emerald-100 text-emerald-700',
  Cancelado: 'bg-slate-100 text-slate-500 line-through',
};

const MONTHS_AHEAD = 12;

interface FinancePageProps {
  requests: PurchaseRequest[];
  setRequests: React.Dispatch<React.SetStateAction<PurchaseRequest[]>>;
  currentUser: AppUser;
}

function Kpi({ icon: Icon, label, value, note, tone }: {
  icon: typeof PiggyBank; label: string; value: string; note?: string; tone: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} className={tone} />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      </div>
      <p className="text-xl font-bold text-slate-800">{value}</p>
      {note && <p className="text-[11px] text-slate-400 mt-0.5">{note}</p>}
    </div>
  );
}

export function FinancePage({ requests, setRequests, currentUser }: FinancePageProps) {
  const navigate = useNavigate();
  const installments = useInstallments();
  const [filters, setFilters] = useState<FinanceFilters>(EMPTY_FILTERS);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [log, setLog] = useState(() => readFinanceLog());
  const [queued, setQueued] = useState(() => pendingCount());

  const allowed = canViewFinance(currentUser.role);
  const settings = getFinanceSettings();

  /**
   * Varredura de reconciliação ao abrir a tela. Rede de segurança para a
   * ausência de backend: se o navegador de quem moveu o card não conseguiu
   * gravar, a diferença é corrigida aqui.
   */
  useEffect(() => {
    if (!allowed || requests.length === 0) return;
    let cancelled = false;
    setSyncing(true);
    reconcile(requests)
      .then((report) => {
        if (cancelled) return;
        setSyncNote(
          report.installmentsFixed > 0
            ? `${report.installmentsFixed} parcela(s) de ${report.requestsFixed} pedido(s) corrigidas na reconciliação.`
            : null
        );
      })
      .finally(() => {
        if (cancelled) return;
        setSyncing(false);
        setLog(readFinanceLog());
        setQueued(pendingCount());
      });
    return () => { cancelled = true; };
  }, [allowed, requests]);

  const allRows = useMemo(() => joinInstallments(installments, requests), [installments, requests]);
  const rows = useMemo(() => applyFilters(allRows, filters), [allRows, filters]);
  const options = useMemo(() => filterOptions(allRows), [allRows]);

  const todayISO = new Date().toISOString();
  const months = useMemo(
    () => monthlyProjection(rows, monthKeyOf(todayISO), MONTHS_AHEAD),
    [rows, todayISO]
  );
  const summary = useMemo(() => commitmentSummary(rows, todayISO, MONTHS_AHEAD), [rows, todayISO]);
  const limbo = useMemo(
    () => limboRequests(requests, settings.limboDays, todayISO),
    [requests, settings.limboDays, todayISO]
  );

  const chartData = months.map((m) => ({
    label: m.label,
    values: [m.confirmado, m.previsto, m.pago],
    total: m.total,
  }));

  const monthRows = selectedMonth ? rowsOfMonth(rows, selectedMonth) : [];
  const monthGroups = groupByRequest(monthRows);

  const patch = (p: Partial<FinanceFilters>) => setFilters((f) => ({ ...f, ...p }));
  const openCard = (id: string) => navigate(`/?pedido=${id}`);

  if (!allowed) {
    return (
      <div className="flex flex-col h-screen pl-60">
        <Header title="Previsão Financeira" subtitle="Compromissos dos próximos meses" requests={requests} />
        <div className="flex-1 flex items-center justify-center pt-16">
          <div className="text-center max-w-md">
            <Lock size={28} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700">Projeção consolidada restrita</p>
            <p className="text-xs text-slate-500 mt-1">
              A previsão financeira da empresa é visível para os perfis <strong>Gestor</strong> e{' '}
              <strong>Financeiro</strong>. As parcelas de cada pedido continuam visíveis no card,
              na aba de cotação.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen pl-60">
      <Header
        title="Previsão Financeira"
        subtitle="Compromisso assumido na aprovação de valor, antes da compra acontecer"
        searchValue={filters.search ?? ''}
        onSearchChange={(v) => patch({ search: v })}
        requests={requests}
      />

      <div className="flex-1 overflow-auto pt-16 bg-slate-50">
        <div className="p-6 space-y-4">
          {/* Avisos de estado */}
          {(syncing || syncNote || queued > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {syncing && (
                <span className="flex items-center gap-1.5 text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-1.5">
                  <RefreshCw size={12} className="animate-spin" /> Reconciliando parcelas com os pedidos…
                </span>
              )}
              {syncNote && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                  <ShieldCheck size={12} /> {syncNote}
                </span>
              )}
              {queued > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                  <CloudOff size={12} /> {queued} parcela(s) aguardando envio ao servidor. Serão reenviadas automaticamente.
                </span>
              )}
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi
              icon={PiggyBank} tone="text-violet-600"
              label={`Comprometido ${MONTHS_AHEAD} meses`}
              value={fmtBRL(summary.total)}
              note={`${rows.filter((r) => r.installment.status !== 'Cancelado').length} parcela(s)`}
            />
            <Kpi
              icon={TrendingUp} tone="text-violet-500"
              label="Previsto" value={fmtBRL(summary.previsto)}
              note="Aprovado, ainda não comprado"
            />
            <Kpi
              icon={ShieldCheck} tone="text-teal-600"
              label="Confirmado" value={fmtBRL(summary.confirmado)}
              note="Compra efetivada, datas definitivas"
            />
            <Kpi
              icon={Hourglass} tone={limbo.length > 0 ? 'text-red-600' : 'text-slate-400'}
              label={`No limbo (${settings.limboDays}+ dias)`}
              value={String(limbo.length)}
              note={limbo.length > 0 ? `${fmtBRL(limbo.reduce((s, l) => s + l.committedValue, 0))} parados` : 'Nenhum pedido parado'}
            />
          </div>

          {/* Filtros */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter size={14} className="text-slate-400" />
              <input
                type="date" value={filters.from ?? ''} onChange={(e) => patch({ from: e.target.value })}
                title="Vencimento a partir de"
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <span className="text-xs text-slate-400">até</span>
              <input
                type="date" value={filters.to ?? ''} onChange={(e) => patch({ to: e.target.value })}
                title="Vencimento até"
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <select value={filters.status ?? ''} onChange={(e) => patch({ status: e.target.value as InstallmentStatus | '' })}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500">
                <option value="">Todos os status</option>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filters.priority ?? ''} onChange={(e) => patch({ priority: e.target.value as Priority | '' })}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500">
                <option value="">Todas as prioridades</option>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={filters.sector ?? ''} onChange={(e) => patch({ sector: e.target.value as Sector | '' })}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500">
                <option value="">Todos os setores</option>
                {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filters.supplier ?? ''} onChange={(e) => patch({ supplier: e.target.value })}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500">
                <option value="">Todos os fornecedores</option>
                {options.suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filters.requester ?? ''} onChange={(e) => patch({ requester: e.target.value })}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500">
                <option value="">Todos os solicitantes</option>
                {options.requesters.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filters.buyer ?? ''} onChange={(e) => patch({ buyer: e.target.value })}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500">
                <option value="">Todos os compradores</option>
                {options.buyers.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>

              {hasActiveFilters(filters) && (
                <button onClick={() => setFilters(EMPTY_FILTERS)}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium transition-colors">
                  <X size={12} /> Limpar
                </button>
              )}

              <div className="ml-auto flex items-center gap-2">
                <span className="text-[11px] text-slate-400">
                  {rows.length} de {allRows.length} parcelas
                </span>
                <button
                  onClick={() => exportCSV(EXPORT_HEADERS, exportRows(rows), exportName('previsao-financeira'))}
                  className="flex items-center gap-1 text-xs text-slate-600 hover:text-violet-700 border border-slate-200 rounded-lg px-2 py-1.5 transition-colors"
                >
                  <Download size={12} /> CSV
                </button>
                <button
                  onClick={() => exportExcel(EXPORT_HEADERS, exportRows(rows), exportName('previsao-financeira'))}
                  className="flex items-center gap-1 text-xs text-slate-600 hover:text-emerald-700 border border-slate-200 rounded-lg px-2 py-1.5 transition-colors"
                >
                  <FileSpreadsheet size={12} /> Excel
                </button>
              </div>
            </div>
          </div>

          {/* Projeção 12 meses */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-slate-700 text-sm">Comprometido nos próximos {MONTHS_AHEAD} meses</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Clique num mês para ver quais pedidos compõem o valor
                </p>
              </div>
              {selectedMonth && (
                <button onClick={() => setSelectedMonth(null)}
                  className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
                  <X size={12} /> Limpar seleção
                </button>
              )}
            </div>
            {summary.total > 0 ? (
              <StackedBars
                data={chartData}
                segments={SEGMENTS}
                format={fmtCompact}
                selected={selectedMonth ? months.findIndex((m) => m.monthKey === selectedMonth) : null}
                onSelect={(i) => setSelectedMonth((cur) => (cur === months[i].monthKey ? null : months[i].monthKey))}
              />
            ) : (
              <ChartEmpty note="Nenhuma parcela projetada. As parcelas nascem quando o gestor aprova o valor cotado." />
            )}

            {/* Tabela mensal */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-100">
                    <th className="text-left font-medium py-2">Mês</th>
                    <th className="text-right font-medium py-2">Previsto</th>
                    <th className="text-right font-medium py-2">Confirmado</th>
                    <th className="text-right font-medium py-2">Pago</th>
                    <th className="text-right font-medium py-2">Total</th>
                    <th className="text-right font-medium py-2">Parcelas</th>
                    <th className="w-6" />
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr
                      key={m.monthKey}
                      onClick={() => setSelectedMonth((cur) => (cur === m.monthKey ? null : m.monthKey))}
                      className={`border-b border-slate-50 cursor-pointer transition-colors ${
                        selectedMonth === m.monthKey ? 'bg-violet-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2 font-medium text-slate-700">{m.label}</td>
                      <td className="py-2 text-right text-violet-600">{m.previsto > 0 ? fmtBRL(m.previsto) : '—'}</td>
                      <td className="py-2 text-right text-teal-600">{m.confirmado > 0 ? fmtBRL(m.confirmado) : '—'}</td>
                      <td className="py-2 text-right text-emerald-600">{m.pago > 0 ? fmtBRL(m.pago) : '—'}</td>
                      <td className="py-2 text-right font-semibold text-slate-800">{m.total > 0 ? fmtBRL(m.total) : '—'}</td>
                      <td className="py-2 text-right text-slate-400">{m.count || '—'}</td>
                      <td className="py-2 text-slate-300">{m.count > 0 && <ChevronRight size={12} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detalhe do mês selecionado */}
          {selectedMonth && (
            <div className="bg-white rounded-2xl border border-violet-200 p-5 shadow-sm">
              <h3 className="font-semibold text-slate-700 text-sm mb-1">
                Pedidos que compõem {monthLabelLong(selectedMonth)}
              </h3>
              <p className="text-[11px] text-slate-400 mb-3">
                {monthGroups.length} pedido(s) · {monthRows.length} parcela(s) ·{' '}
                {fmtBRL(monthGroups.reduce((s, g) => s + g.amount, 0))}
              </p>
              {monthGroups.length === 0 ? (
                <p className="text-xs text-slate-400">Nenhuma parcela vence neste mês com os filtros atuais.</p>
              ) : (
                <div className="space-y-2">
                  {monthGroups.map((g) => (
                    <div key={g.request.id} className="border border-slate-100 rounded-xl p-3 hover:border-violet-200 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => openCard(g.request.id)}
                              className="text-sm font-semibold text-violet-700 hover:text-violet-900 flex items-center gap-1"
                              title="Abrir o card no Kanban"
                            >
                              {g.request.number} <ExternalLink size={11} />
                            </button>
                            <span className="text-[10px] text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">{g.request.status}</span>
                            <span className="text-[10px] text-slate-500">{g.request.sector}</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 truncate">
                            {g.request.supplier ?? 'sem fornecedor'} · solicitante {g.request.requester}
                            {g.buyer && ` · comprador ${g.buyer}`}
                          </p>
                        </div>
                        <p className="text-sm font-bold text-slate-800 whitespace-nowrap">{fmtBRL(g.amount)}</p>
                      </div>
                      <div className="mt-2 space-y-1">
                        {g.installments.map((i) => (
                          <div key={i.id} className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-500">
                              Parcela {i.number}/{i.count} · vence {fmtDate(i.dueDate)} · {i.paymentTermsLabel}
                            </span>
                            <span className="flex items-center gap-2">
                              {i.divergenceNote && (
                                <span title={i.divergenceNote}>
                                  <AlertTriangle size={11} className="text-amber-500" />
                                </span>
                              )}
                              <span className={`rounded px-1.5 py-0.5 font-medium ${STATUS_STYLE[i.status]}`}>{i.status}</span>
                              <span className="font-medium text-slate-700">{fmtBRL(i.amount)}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Limbo */}
          <div className={`rounded-2xl border p-5 shadow-sm ${limbo.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-2 mb-1">
              <Hourglass size={15} className={limbo.length > 0 ? 'text-red-600' : 'text-slate-400'} />
              <h3 className="font-semibold text-slate-700 text-sm">
                Aprovados há mais de {settings.limboDays} dias e ainda não comprados
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 mb-3">
              Caixa comprometido sem compra efetivada. O alerta também é enviado por ntfy, uma vez por dia por pedido.
            </p>
            {limbo.length === 0 ? (
              <p className="text-xs text-slate-400">Nenhum pedido parado nesse intervalo.</p>
            ) : (
              <div className="space-y-1.5">
                {limbo.map((l) => (
                  <div key={l.request.id} className="flex items-center justify-between gap-3 bg-white border border-red-100 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <button
                        onClick={() => openCard(l.request.id)}
                        className="text-xs font-semibold text-violet-700 hover:text-violet-900 flex items-center gap-1"
                      >
                        {l.request.number} <ExternalLink size={10} />
                      </button>
                      <p className="text-[11px] text-slate-500 truncate">
                        {l.request.status} · aprovado em {fmtDate(l.approvedAt)} por {l.request.valueApproval?.approvedBy}
                        {l.buyer && ` · comprador ${l.buyer}`}
                      </p>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <p className="text-xs font-bold text-red-700">{l.daysWaiting} dias</p>
                      <p className="text-[11px] text-slate-600">{fmtBRL(l.committedValue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Backfill dos pedidos anteriores ao módulo */}
          <BackfillPanel
            requests={requests}
            onApply={(patched) => {
              const byId = new Map(patched.map((r) => [r.id, r]));
              setRequests((prev) => prev.map((r) => byId.get(r.id) ?? r));
              setLog(readFinanceLog());
              setQueued(pendingCount());
            }}
          />

          {/* Log de erros */}
          {log.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-200 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={15} className="text-amber-500" />
                  <h3 className="font-semibold text-slate-700 text-sm">
                    Ocorrências da projeção financeira ({log.length})
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setLogOpen((v) => !v)} className="text-xs text-slate-500 hover:text-slate-700">
                    {logOpen ? 'Recolher' : 'Ver'}
                  </button>
                  <button
                    onClick={() => { clearFinanceLog(); setLog([]); }}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Limpar
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Falhas registradas sem interromper aprovações. As parcelas afetadas ficam no navegador e na fila de reenvio.
              </p>
              {logOpen && (
                <div className="mt-3 space-y-1.5 max-h-64 overflow-auto">
                  {log.map((e, i) => (
                    <div key={`${e.at}-${i}`} className="text-[11px] border-b border-slate-50 pb-1.5">
                      <span className="text-slate-400">{new Date(e.at).toLocaleString('pt-BR')}</span>{' '}
                      <span className="font-medium text-slate-700">{e.requestNumber}</span>{' '}
                      <span className="text-slate-600">{e.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
