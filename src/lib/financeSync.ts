import { PurchaseRequest, Status } from '../types';
import { Installment, InstallmentStatus, PaymentTerms } from '../types/finance';
import { STATUS_ORDER } from '../data/mockData';
import { isPaymentTermsValid } from './paymentTerms';
import {
  cancelInstallments, chooseConfirmedBaseDate, computeInstallments, formatDivergenceNote,
  localDayOf, recalcInstallments, valueDivergence,
} from './finance';
import { getHolidaySet } from './financeSettings';
import { installmentsOf, installmentsReady, logFinanceError, saveInstallments } from './financeStore';

/* ====================================================================
   Ligação entre o fluxo do Kanban e as parcelas.

   Tudo passa por deriveInstallments: dado um pedido e as parcelas que ele
   já tem, qual deveria ser o estado correto? Os ganchos (aprovação de
   valor, entrada em "Comprado", cancelamento, edição da cotação) e a
   varredura de reconciliação usam exatamente essa função, então não há
   dois caminhos podendo divergir.

   Nenhuma função exportada aqui lança: uma falha na projeção financeira
   jamais pode travar a aprovação ou a movimentação do card.
   ==================================================================== */

const PURCHASED_IDX = STATUS_ORDER.indexOf('Comprado');

/** O card já passou por "Comprado"? Então as parcelas são definitivas. */
export function isPurchasedOrLater(status: Status): boolean {
  const i = STATUS_ORDER.indexOf(status);
  return i >= 0 && i >= PURCHASED_IDX;
}

/**
 * O pedido conta como compra efetivamente registrada?
 *
 * Usado pelo Dashboard e pelos Relatórios para agregar dinheiro (Valor
 * Total, ranking de fornecedores, gastos por mês/setor): um pedido
 * cancelado nunca é compra, e um valor só é "negociado" de fato quando o
 * pedido passou por "Comprado" — antes disso é cotação, que pode mudar ou
 * nem virar compra. Mesmo critério que o motor financeiro usa para gerar
 * parcela 'Confirmado' em vez de 'Previsto' (ver `isPurchasedOrLater`).
 */
export function countsAsPurchase(request: PurchaseRequest): boolean {
  return request.status !== 'Cancelada' && isPurchasedOrLater(request.status);
}

/** Quando o card entrou em "Comprado", segundo o histórico. */
export function purchasedAtOf(request: PurchaseRequest): string | undefined {
  return [...request.history].reverse().find((h) => h.to === 'Comprado')?.date;
}

/** O pedido tem tudo que o cálculo precisa? */
export function canProjectInstallments(request: PurchaseRequest): boolean {
  return request.value !== undefined && request.value > 0 && isPaymentTermsValid(request.paymentTerms);
}

/**
 * Trava financeira central: o pedido pode avançar (ou pular) de status?
 *
 * Um pedido em "Em Cotação" não pode sair de lá sem valor e condição de
 * pagamento preenchidos — senão o card avança sem nunca ter passado pela
 * janela de aprovação de valor. E qualquer pedido "Comprado" em diante que
 * já tenha valor+condição válidos (pedido legado ou editado fora do fluxo)
 * não pode seguir adiante sem a aprovação de valor do gestor, mesmo que já
 * tenha deixado "Em Cotação" há tempos. Compartilhada entre a UI (que
 * também mostra a mensagem) e os handlers do Kanban (defesa em profundidade
 * — a UI sozinha não é suficiente).
 */
export function blocksAdvanceForValueApproval(request: PurchaseRequest): boolean {
  if (request.status === 'Cancelada' || request.valueApproval) return false;
  return request.status === 'Em Cotação' || canProjectInstallments(request);
}

/**
 * Estado que as parcelas do pedido deveriam ter.
 *
 * Devolve `null` para "não há nada a fazer" — pedido sem aprovação de
 * valor, sem valor ou sem condição de pagamento. Nesse caso as parcelas
 * existentes são deixadas como estão, nunca apagadas.
 */
export function deriveInstallments(
  request: PurchaseRequest,
  existing: Installment[],
  now: string,
  holidays: Set<string>,
): Installment[] | null {
  // Pedido cancelado: encerra o que estiver em aberto, preserva o que foi pago
  if (request.status === 'Cancelada') {
    if (existing.length === 0) return null;
    const reason = request.cancelReason ? ` Motivo: ${request.cancelReason}` : '';
    return cancelInstallments(existing, now, `Pedido cancelado após a aprovação.${reason}`);
  }

  // O compromisso financeiro nasce na aprovação de valor do gestor
  if (!request.valueApproval) return null;
  if (!canProjectInstallments(request)) return null;

  const terms = request.paymentTerms as PaymentTerms;
  const total = request.value as number;
  const confirmed = isPurchasedOrLater(request.status);
  const status: InstallmentStatus = confirmed ? 'Confirmado' : 'Previsto';

  // Antes de "Comprado" a base é a aprovação; depois, a nota fiscal
  const base = confirmed
    ? chooseConfirmedBaseDate(
        request.fiscalNoteDate,
        purchasedAtOf(request) ?? request.valueApproval.approvedAt,
      )
    : { baseDate: localDayOf(request.valueApproval.approvedAt), source: 'aprovacao_valor' as const };

  // Divergência é avaliada sempre que há aprovação de valor, não só depois
  // da compra: o comprador pode editar valor/condição a qualquer momento
  // após a aprovação, e a nota precisa aparecer assim que o valor projetado
  // deixar de bater com o aprovado — mesmo com o pedido ainda em cotação.
  const divergence = valueDivergence(request.valueApproval.approvedValue, total);
  const divergenceNote = divergence.hasDivergence ? formatDivergenceNote(divergence) : undefined;

  if (existing.length === 0) {
    return computeInstallments({
      requestId: request.id,
      total,
      terms,
      baseDate: base.baseDate,
      baseDateSource: base.source,
      holidays,
      now,
      status,
    }).map((i) => (divergenceNote ? { ...i, divergenceNote } : i));
  }

  return recalcInstallments({
    existing,
    requestId: request.id,
    total,
    terms,
    baseDate: base.baseDate,
    baseDateSource: base.source,
    status,
    holidays,
    now,
    divergenceNote,
    // A divergência acima acabou de ser reavaliada com o valor aprovado —
    // grava sempre, inclusive undefined, para limpar uma nota antiga que
    // não vale mais (ex.: valor comprado corrigido de volta ao aprovado).
    divergenceKnown: true,
  });
}

/**
 * Campos que decidem se a parcela precisa ser regravada.
 *
 * `updatedAt` fica de fora de propósito: o recálculo o atualiza sempre, e
 * incluí-lo faria a varredura de reconciliação reescrever tudo a cada
 * abertura da tela.
 */
function fingerprint(i: Installment): string {
  return JSON.stringify([
    i.number, i.count, i.amount, i.dueDate, i.offsetDays, i.baseDate, i.baseDateSource,
    i.status, i.paymentTermsLabel, i.paidAt ?? null, i.paidAmount ?? null,
    i.cancelledAt ?? null, i.divergenceNote ?? null, i.cancelReason ?? null,
  ]);
}

export function diffInstallments(existing: Installment[], desired: Installment[]): Installment[] {
  const byId = new Map(existing.map((i) => [i.id, i]));
  return desired.filter((d) => {
    const prev = byId.get(d.id);
    return !prev || fingerprint(prev) !== fingerprint(d);
  });
}

export interface SyncOptions {
  now?: string;
  holidays?: Set<string>;
}

/**
 * Sincroniza as parcelas de um pedido. Chamada nos ganchos do Kanban.
 *
 * Nunca lança e nunca é aguardada pelo fluxo do usuário: se der erro, o
 * erro vai para o log e as parcelas para a fila de reprocessamento, e a
 * aprovação (ou a movimentação do card) conclui normalmente.
 */
export async function syncRequestFinance(request: PurchaseRequest, opts: SyncOptions = {}): Promise<void> {
  try {
    const now = opts.now ?? new Date().toISOString();
    const holidays = opts.holidays ?? getHolidaySet();
    const existing = installmentsOf(request.id);
    const desired = deriveInstallments(request, existing, now, holidays);
    if (!desired) return;
    const changed = diffInstallments(existing, desired);
    if (changed.length === 0) return;
    await saveInstallments(changed, request.number);
  } catch (e) {
    logFinanceError(request.number, `Falha ao projetar parcelas: ${String(e)}`);
  }
}

export interface ReconcileReport {
  /** Pedidos avaliados. */
  checked: number;
  /** Pedidos cujas parcelas estavam divergentes. */
  requestsFixed: number;
  /** Parcelas regravadas. */
  installmentsFixed: number;
}

/**
 * Varredura de reconciliação.
 *
 * Rede de segurança para a ausência de backend: se o navegador de quem
 * moveu o card morreu antes de gravar, ou se o pedido foi editado em outra
 * aba, esta passada compara cada pedido com as suas parcelas e corrige a
 * diferença. Roda ao abrir a tela do Financeiro.
 */
export async function reconcile(requests: PurchaseRequest[], opts: SyncOptions = {}): Promise<ReconcileReport> {
  // O cache de parcelas (financeStore) só está confiável depois que a carga
  // inicial do servidor resolve — initInstallments() é disparada sem await
  // em App.tsx. Rodar a reconciliação antes disso vê `existing` vazio para
  // pedidos que já têm parcelas no servidor e recria tudo com ids novos.
  await installmentsReady();

  const now = opts.now ?? new Date().toISOString();
  const holidays = opts.holidays ?? getHolidaySet();
  const pending: Installment[] = [];
  let requestsFixed = 0;

  for (const request of requests) {
    try {
      const existing = installmentsOf(request.id);
      const desired = deriveInstallments(request, existing, now, holidays);
      if (!desired) continue;
      const changed = diffInstallments(existing, desired);
      if (changed.length > 0) {
        pending.push(...changed);
        requestsFixed += 1;
      }
    } catch (e) {
      logFinanceError(request.number, `Reconciliação falhou: ${String(e)}`);
    }
  }

  if (pending.length > 0) {
    await saveInstallments(pending, `reconciliação de ${requestsFixed} pedido(s)`);
  }
  return { checked: requests.length, requestsFixed, installmentsFixed: pending.length };
}

/**
 * Prévia das parcelas para o gestor conferir ANTES de aprovar o valor.
 * Não grava nada.
 */
export function previewInstallments(request: PurchaseRequest, opts: SyncOptions = {}): Installment[] {
  if (!canProjectInstallments(request)) return [];
  const now = opts.now ?? new Date().toISOString();
  return computeInstallments({
    requestId: request.id,
    total: request.value as number,
    terms: request.paymentTerms as PaymentTerms,
    baseDate: localDayOf(now),
    baseDateSource: 'aprovacao_valor',
    holidays: opts.holidays ?? getHolidaySet(),
    now,
    status: 'Previsto',
  });
}
