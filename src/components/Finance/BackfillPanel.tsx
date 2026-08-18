import { useMemo, useState } from 'react';
import { History, Play, Search, CheckCircle2, AlertTriangle } from 'lucide-react';
import { PurchaseRequest } from '../../types';
import { PAYMENT_TERMS_PRESETS } from '../../lib/paymentTerms';
import { getFinanceSettings } from '../../lib/financeSettings';
import { useInstallments, pendingCount } from '../../lib/financeStore';
import { applyBackfill, BackfillPlan, planBackfill } from '../../lib/financeBackfill';

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Backfill dos pedidos já aprovados e em aberto.
 *
 * Roda no navegador, como a ferramenta de migração que já existe em
 * Configurações — não há backend onde colocar um script. Sempre com
 * dry-run antes, e idempotente: pedido que já tem parcela é ignorado.
 */
export function BackfillPanel({ requests, onApply }: {
  requests: PurchaseRequest[];
  onApply: (patched: PurchaseRequest[]) => void;
}) {
  const installments = useInstallments();
  const [termsId, setTermsId] = useState(() => getFinanceSettings().backfillTermsId);
  const [plan, setPlan] = useState<BackfillPlan | null>(null);
  const [running, setRunning] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);

  const skipReasons = useMemo(() => {
    if (!plan) return [];
    const counts = new Map<string, number>();
    for (const s of plan.skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [plan]);

  const preview = () => {
    if (simulating) return;
    setSimulating(true);
    setResult(null);
    setPlan(planBackfill(requests, installments, { fallbackTermsId: termsId }));
    setSimulating(false);
  };

  const run = async () => {
    if (!plan || plan.candidates.length === 0) return;
    if (!window.confirm(`Confirma gerar ${plan.totalInstallments} parcela(s) para ${plan.candidates.length} pedido(s)? Esta ação grava direto em produção.`)) return;
    setRunning(true);
    try {
      const out = await applyBackfill(plan);
      onApply(out.patchedRequests);
      const pending = pendingCount();
      setResult(
        pending > 0
          ? `${out.installmentsCreated} parcela(s) criadas em ${out.patchedRequests.length} pedido(s). `
            + `Atenção: ${pending} ficaram pendentes de reenvio (sem conexão com o servidor) — serão reenviadas automaticamente.`
          : `${out.installmentsCreated} parcela(s) criadas em ${out.patchedRequests.length} pedido(s). `
            + 'A projeção já reflete o resultado.'
      );
      setPlan(null);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <History size={15} className="text-slate-500" />
        <h3 className="font-semibold text-slate-700 text-sm">Backfill dos pedidos em aberto</h3>
      </div>
      <p className="text-[11px] text-slate-500 mb-3">
        Gera as parcelas dos pedidos que já estavam em andamento antes deste módulo existir.
        Sem isso o painel fica vazio, porque nenhum deles tem aprovação de valor registrada.
        A operação é idempotente: pedido que já tem parcela é ignorado.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-600 mb-1">
            Condição a assumir quando o pedido não tem nenhuma
          </label>
          <select
            value={termsId}
            onChange={(e) => { setTermsId(e.target.value); setPlan(null); }}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            {PAYMENT_TERMS_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <button
          onClick={preview}
          disabled={simulating}
          className="flex items-center gap-1.5 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 disabled:opacity-60 rounded-lg px-3 py-1.5 transition-colors"
        >
          <Search size={12} /> {simulating ? 'Simulando...' : 'Simular (dry-run)'}
        </button>
        {plan && plan.candidates.length > 0 && (
          <button
            onClick={run}
            disabled={running}
            className="flex items-center gap-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Play size={12} /> {running ? 'Executando…' : `Gerar ${plan.totalInstallments} parcela(s)`}
          </button>
        )}
      </div>

      {result && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <CheckCircle2 size={12} /> {result}
        </p>
      )}

      {plan && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ['Pedidos elegíveis', String(plan.candidates.length)],
              ['Parcelas a criar', String(plan.totalInstallments)],
              ['Valor total', fmtBRL(plan.totalAmount)],
              ['Ignorados', String(plan.skipped.length)],
            ].map(([label, value]) => (
              <div key={label} className="border border-slate-100 rounded-xl p-2.5">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {plan.candidates.length === 0 ? (
            <p className="text-xs text-slate-500">
              Nenhum pedido elegível. Ou todos já têm parcelas, ou nenhum tem valor cotado.
            </p>
          ) : (
            <>
              <p className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                <span>
                  {plan.candidates.filter((c) => c.synthesizedTerms).length} pedido(s) não têm condição de
                  pagamento e assumirão <strong>{plan.fallbackTermsLabel}</strong>.{' '}
                  {plan.candidates.filter((c) => c.synthesizedApproval).length} receberão aprovação de valor
                  registrada retroativamente, com a melhor data disponível no histórico. As parcelas ficam
                  marcadas como originadas de backfill para auditoria.
                </span>
              </p>

              <div className="max-h-72 overflow-auto border border-slate-100 rounded-xl">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr className="text-slate-500">
                      <th className="text-left font-medium px-3 py-2">Pedido</th>
                      <th className="text-left font-medium px-3 py-2">Status</th>
                      <th className="text-left font-medium px-3 py-2">Condição</th>
                      <th className="text-left font-medium px-3 py-2">1º vencimento</th>
                      <th className="text-right font-medium px-3 py-2">Parcelas</th>
                      <th className="text-right font-medium px-3 py-2">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.candidates.map((c) => (
                      <tr key={c.request.id} className="border-t border-slate-50">
                        <td className="px-3 py-1.5 font-medium text-slate-700">{c.request.number}</td>
                        <td className="px-3 py-1.5 text-slate-500">{c.request.status}</td>
                        <td className="px-3 py-1.5 text-slate-500">
                          {c.termsLabel}
                          {c.synthesizedTerms && <span className="text-amber-600"> (assumida)</span>}
                        </td>
                        <td className="px-3 py-1.5 text-slate-500">
                          {new Date(c.installments[0].dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-3 py-1.5 text-right text-slate-600">{c.installments.length}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-slate-700">{fmtBRL(c.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {plan.skipped.length > 0 && (
            <div>
              <button onClick={() => setShowSkipped((v) => !v)} className="text-[11px] text-slate-500 hover:text-slate-700">
                {showSkipped ? 'Ocultar' : 'Ver'} os {plan.skipped.length} ignorados
              </button>
              {showSkipped && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {skipReasons.map(([reason, count]) => (
                    <span key={reason} className="text-[10px] bg-slate-50 border border-slate-200 rounded px-2 py-0.5 text-slate-600">
                      {reason}: {count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
