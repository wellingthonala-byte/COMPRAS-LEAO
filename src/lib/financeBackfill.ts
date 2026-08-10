import { PurchaseRequest } from '../types';
import { Installment, PaymentTerms, ValueApproval } from '../types/finance';
import { formatPaymentTerms, isPaymentTermsValid, PAYMENT_TERMS_PRESETS } from './paymentTerms';
import { sumAmounts } from './finance';
import { deriveInstallments } from './financeSync';
import { getFinanceSettings, getHolidaySet } from './financeSettings';
import { saveInstallments } from './financeStore';

/* ====================================================================
   Backfill dos pedidos já aprovados e em aberto.

   Sem isto o painel nasce vazio no dia do deploy: existem centenas de
   solicitações em andamento, nenhuma com aprovação de valor nem condição
   de pagamento, porque esses conceitos não existiam.

   Duas coisas precisam ser sintetizadas para o pedido antigo entrar na
   projeção — e para os ganchos continuarem funcionando nele depois:

   1. a aprovação de valor (o compromisso, que passa a existir
      retroativamente com a melhor data disponível no histórico);
   2. a condição de pagamento, quando o pedido não tem nenhuma.

   As parcelas geradas ficam com origin.baseDateSource = 'backfill', então
   é sempre possível distinguir no banco o que foi projetado de verdade do
   que foi reconstruído. O campo baseDateSource corrente continua dizendo
   a verdade sobre qual data guiou o cálculo.

   Sobre as duas origens do valor: no banco, o valor de um pedido está em
   `extra.doc` (registros criados no Compras Leão) ou na tabela `suppliers`
   (registros importados do sistema antigo). Este backfill roda sobre os
   objetos já carregados, e `rowToRequest` em lib/backend.ts normaliza os
   dois casos em `request.value` — então ler `request.value` cobre as duas
   origens. Um script SQL direto precisaria tratar as duas colunas.
   ==================================================================== */

/** Pedidos nesses status não entram: já se resolveram. */
const EXCLUDED_STATUS = new Set(['Cancelada', 'Finalizado']);

export interface BackfillOptions {
  /** Preset assumido quando o pedido não tem condição. Padrão: Configurações. */
  fallbackTermsId?: string;
  now?: string;
  holidays?: Set<string>;
}

export interface BackfillCandidate {
  request: PurchaseRequest;
  /** O pedido com aprovação de valor e condição sintetizadas. */
  patchedRequest: PurchaseRequest;
  installments: Installment[];
  amount: number;
  synthesizedApproval: boolean;
  synthesizedTerms: boolean;
  termsLabel: string;
}

export interface BackfillSkip {
  request: PurchaseRequest;
  reason: string;
}

export interface BackfillPlan {
  candidates: BackfillCandidate[];
  skipped: BackfillSkip[];
  totalInstallments: number;
  totalAmount: number;
  fallbackTermsLabel: string;
}

/**
 * Melhor data disponível para a aprovação retroativa.
 * Preferência: aprovação de mérito > entrada em Em Cotação > criação.
 */
function inferApprovalDate(request: PurchaseRequest): string {
  if (request.approvedAt) return request.approvedAt;
  const quoted = [...request.history].reverse().find((h) => h.to === 'Em Cotação');
  return quoted?.date ?? request.createdAt;
}

function resolveFallbackTerms(id: string): PaymentTerms {
  const preset = PAYMENT_TERMS_PRESETS.find((p) => p.id === id)
    ?? PAYMENT_TERMS_PRESETS.find((p) => p.id === '30')!;
  return { ...preset.terms, days: [...preset.terms.days] };
}

/**
 * Monta o plano sem gravar nada. É o que alimenta o dry-run.
 *
 * Idempotente por construção: pedido que já tem parcela é ignorado, então
 * rodar de novo não duplica.
 */
export function planBackfill(
  requests: PurchaseRequest[],
  existing: Installment[],
  opts: BackfillOptions = {},
): BackfillPlan {
  const settings = getFinanceSettings();
  const now = opts.now ?? new Date().toISOString();
  const holidays = opts.holidays ?? getHolidaySet();
  const fallbackTerms = resolveFallbackTerms(opts.fallbackTermsId ?? settings.backfillTermsId);

  const withInstallments = new Set(existing.map((i) => i.requestId));
  const candidates: BackfillCandidate[] = [];
  const skipped: BackfillSkip[] = [];

  for (const request of requests) {
    if (withInstallments.has(request.id)) {
      skipped.push({ request, reason: 'Já possui parcelas' });
      continue;
    }
    if (EXCLUDED_STATUS.has(request.status)) {
      skipped.push({ request, reason: `Status "${request.status}"` });
      continue;
    }
    if (request.value === undefined || request.value <= 0) {
      skipped.push({ request, reason: 'Sem valor cotado' });
      continue;
    }

    const synthesizedTerms = !isPaymentTermsValid(request.paymentTerms);
    const terms = synthesizedTerms ? fallbackTerms : (request.paymentTerms as PaymentTerms);
    const synthesizedApproval = !request.valueApproval;

    const valueApproval: ValueApproval = request.valueApproval ?? {
      approvedBy: request.approvedBy ?? 'Backfill',
      approvalId: 'backfill',
      approvedAt: inferApprovalDate(request),
      approvedValue: request.value,
      paymentTermsLabel: formatPaymentTerms(terms),
    };

    const patchedRequest: PurchaseRequest = { ...request, paymentTerms: terms, valueApproval };
    const derived = deriveInstallments(patchedRequest, [], now, holidays);
    if (!derived || derived.length === 0) {
      skipped.push({ request, reason: 'Não foi possível projetar (data-base inválida)' });
      continue;
    }

    // Marca a procedência sem mentir sobre qual data guiou o cálculo
    const installments = derived.map((i) => ({
      ...i,
      origin: { ...i.origin, baseDateSource: 'backfill' as const },
    }));

    candidates.push({
      request,
      patchedRequest,
      installments,
      amount: sumAmounts(installments.map((i) => i.amount)),
      synthesizedApproval,
      synthesizedTerms,
      termsLabel: formatPaymentTerms(terms),
    });
  }

  return {
    candidates,
    skipped,
    totalInstallments: candidates.reduce((s, c) => s + c.installments.length, 0),
    totalAmount: sumAmounts(candidates.map((c) => c.amount)),
    fallbackTermsLabel: formatPaymentTerms(fallbackTerms),
  };
}

export interface BackfillResult {
  /** Pedidos com aprovação de valor e condição para o chamador mesclar no estado. */
  patchedRequests: PurchaseRequest[];
  installmentsCreated: number;
}

/**
 * Executa o plano.
 *
 * Grava as parcelas e devolve os pedidos alterados para o chamador aplicar
 * no estado — a sincronização das solicitações continua sendo a do App, que
 * já faz o upsert com debounce.
 */
export async function applyBackfill(plan: BackfillPlan, now = new Date().toISOString()): Promise<BackfillResult> {
  if (plan.candidates.length === 0) return { patchedRequests: [], installmentsCreated: 0 };

  await saveInstallments(
    plan.candidates.flatMap((c) => c.installments),
    `backfill de ${plan.candidates.length} pedido(s)`,
  );

  const patchedRequests = plan.candidates.map((c) => ({
    ...c.patchedRequest,
    history: [
      ...c.patchedRequest.history,
      {
        id: `h-backfill-${c.request.id}`,
        date: now,
        user: 'Sistema',
        action: `Backfill financeiro: ${c.installments.length} parcela(s) projetadas em ${c.termsLabel}`
          + `${c.synthesizedTerms ? ' (condição assumida)' : ''}`
          + `${c.synthesizedApproval ? ', aprovação de valor registrada retroativamente' : ''}.`,
      },
    ],
  }));

  return { patchedRequests, installmentsCreated: plan.totalInstallments };
}
