import { PurchaseRequest, Priority, Sector } from '../types';
import { Installment, InstallmentStatus } from '../types/finance';
import { diffDays, localDayOf, monthKeyOf, sumAmounts } from './finance';
import { isPurchasedOrLater } from './financeSync';

/* ====================================================================
   Consultas da projeção financeira.

   Funções puras sobre as parcelas já carregadas em memória. Como todas as
   solicitações já vêm para o navegador (o Dashboard e os Relatórios também
   agregam assim), não há ganho em empurrar isso para SQL — e não existe
   backend onde colocar a consulta.
   ==================================================================== */

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** 'ago/26' a partir de '2026-08'. */
export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTHS_PT[m - 1]}/${String(y).slice(-2)}`;
}

/** 'agosto de 2026' a partir de '2026-08'. */
export function monthLabelLong(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const full = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return `${full[m - 1]} de ${y}`;
}

/** Avança N meses num monthKey, sem depender de Date local. */
export function addMonths(monthKey: string, months: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/**
 * Comprador responsável pelo pedido.
 *
 * Não existe campo de comprador no modelo — quem cota e quem movimenta o
 * card são registrados apenas no histórico. Esta é a melhor inferência
 * possível: quem editou a cotação por último, ou quem moveu o card.
 */
export function buyerOf(request: PurchaseRequest): string | undefined {
  const h = [...request.history].reverse();
  return h.find((e) => e.action.startsWith('Cotação atualizada'))?.user
    ?? h.find((e) => e.to === 'Comprado')?.user
    ?? h.find((e) => e.to === 'Em Cotação')?.user;
}

/* ------------------------------------------------------------------ */
/* Junção parcela + pedido                                             */
/* ------------------------------------------------------------------ */

export interface InstallmentRow {
  installment: Installment;
  request: PurchaseRequest;
  buyer?: string;
}

/**
 * Liga cada parcela ao seu pedido. Parcelas cujo pedido não está carregado
 * são descartadas — sem o pedido não há como filtrar nem exibir a origem.
 */
export function joinInstallments(installments: Installment[], requests: PurchaseRequest[]): InstallmentRow[] {
  const byId = new Map(requests.map((r) => [r.id, r]));
  const rows: InstallmentRow[] = [];
  for (const installment of installments) {
    const request = byId.get(installment.requestId);
    if (!request) continue;
    rows.push({ installment, request, buyer: buyerOf(request) });
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Filtros                                                             */
/* ------------------------------------------------------------------ */

export interface FinanceFilters {
  /** Vencimento a partir de (YYYY-MM-DD). */
  from?: string;
  /** Vencimento até (YYYY-MM-DD). */
  to?: string;
  priority?: Priority | '';
  sector?: Sector | '';
  supplier?: string;
  requester?: string;
  buyer?: string;
  status?: InstallmentStatus | '';
  /** Busca livre em número do pedido, fornecedor, solicitante e itens. */
  search?: string;
}

export const EMPTY_FILTERS: FinanceFilters = {
  from: '', to: '', priority: '', sector: '', supplier: '', requester: '', buyer: '', status: '', search: '',
};

export function hasActiveFilters(f: FinanceFilters): boolean {
  return Object.values(f).some((v) => v !== '' && v !== undefined);
}

export function applyFilters(rows: InstallmentRow[], f: FinanceFilters): InstallmentRow[] {
  const term = (f.search ?? '').trim().toLowerCase();
  return rows.filter(({ installment: i, request: r, buyer }) => {
    if (f.from && i.dueDate < f.from) return false;
    if (f.to && i.dueDate > f.to) return false;
    if (f.status && i.status !== f.status) return false;
    if (f.priority && r.priority !== f.priority) return false;
    if (f.sector && r.sector !== f.sector) return false;
    if (f.supplier && (r.supplier ?? '') !== f.supplier) return false;
    if (f.requester && r.requester !== f.requester) return false;
    if (f.buyer && (buyer ?? '') !== f.buyer) return false;
    if (term) {
      const haystack = [
        r.number, r.supplier ?? '', r.requester, r.sector, i.paymentTermsLabel,
        ...r.items.map((it) => it.description),
      ].join(' ').toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

/** Valores distintos para alimentar os selects de filtro. */
export function filterOptions(rows: InstallmentRow[]) {
  const uniq = (vals: (string | undefined)[]) =>
    [...new Set(vals.filter((v): v is string => !!v && v.trim() !== ''))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return {
    suppliers: uniq(rows.map((r) => r.request.supplier)),
    requesters: uniq(rows.map((r) => r.request.requester)),
    buyers: uniq(rows.map((r) => r.buyer)),
  };
}

/* ------------------------------------------------------------------ */
/* Projeção mensal                                                     */
/* ------------------------------------------------------------------ */

export interface MonthProjection {
  monthKey: string;
  label: string;
  previsto: number;
  confirmado: number;
  pago: number;
  /** Compromisso do mês: previsto + confirmado + pago. Cancelado fica fora. */
  total: number;
  count: number;
}

/**
 * Total comprometido por mês, separando PREVISTO de CONFIRMADO.
 *
 * Parcelas canceladas nunca entram no total — continuam no banco só para
 * auditoria. Meses sem parcela aparecem com zero, para o gráfico não
 * "pular" períodos.
 *
 * Quando `todayISO` é informado, o bucket do MÊS CORRENTE exclui parcelas já
 * vencidas (dueDate < hoje) em Previsto/Confirmado — essas são contabilizadas
 * só em `overdueInstallments`, nunca aqui, para não duplicar o valor entre as
 * duas caixas de KPI. Meses futuros continuam somando normalmente, pois não
 * faz sentido falar em "vencida" para uma data que ainda não chegou.
 */
export function monthlyProjection(
  rows: InstallmentRow[],
  fromMonthKey: string,
  months: number,
  todayISO?: string
): MonthProjection[] {
  const buckets = new Map<string, InstallmentRow[]>();
  for (let n = 0; n < months; n++) buckets.set(addMonths(fromMonthKey, n), []);

  const currentMonthKey = todayISO ? monthKeyOf(localDayOf(todayISO)) : undefined;
  const today = todayISO ? localDayOf(todayISO) : undefined;

  for (const row of rows) {
    if (row.installment.status === 'Cancelado') continue;
    const key = monthKeyOf(row.installment.dueDate);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (key === currentMonthKey && today && row.installment.dueDate < today) continue;
    bucket.push(row);
  }

  return [...buckets.entries()].map(([monthKey, items]) => {
    const by = (status: InstallmentStatus) =>
      sumAmounts(items.filter((i) => i.installment.status === status).map((i) => i.installment.amount));
    const previsto = by('Previsto');
    const confirmado = by('Confirmado');
    const pago = by('Pago');
    return {
      monthKey,
      label: monthLabel(monthKey),
      previsto,
      confirmado,
      pago,
      total: sumAmounts([previsto, confirmado, pago]),
      count: items.length,
    };
  });
}

/** Parcelas de um mês específico, para o drill-down. */
export function rowsOfMonth(rows: InstallmentRow[], monthKey: string): InstallmentRow[] {
  return rows
    .filter((r) => r.installment.status !== 'Cancelado' && monthKeyOf(r.installment.dueDate) === monthKey)
    .sort((a, b) => (a.installment.dueDate < b.installment.dueDate ? -1 : 1));
}

/** Agrupa por pedido, para o mês mostrar "quais pedidos compõem o valor". */
export interface RequestMonthTotal {
  request: PurchaseRequest;
  buyer?: string;
  amount: number;
  installments: Installment[];
}

export function groupByRequest(rows: InstallmentRow[]): RequestMonthTotal[] {
  const map = new Map<string, RequestMonthTotal>();
  for (const { installment, request, buyer } of rows) {
    const hit = map.get(request.id);
    if (hit) {
      hit.amount = sumAmounts([hit.amount, installment.amount]);
      hit.installments.push(installment);
    } else {
      map.set(request.id, { request, buyer, amount: installment.amount, installments: [installment] });
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

/* ------------------------------------------------------------------ */
/* Totais resumidos (card do Dashboard)                                */
/* ------------------------------------------------------------------ */

export interface CommitmentSummary {
  months: MonthProjection[];
  total: number;
  previsto: number;
  confirmado: number;
}

/** Comprometido do mês corrente e dos N meses seguintes. */
export function commitmentSummary(rows: InstallmentRow[], todayISO: string, months: number): CommitmentSummary {
  const projection = monthlyProjection(rows, monthKeyOf(todayISO), months, todayISO);
  return {
    months: projection,
    total: sumAmounts(projection.map((m) => m.total)),
    previsto: sumAmounts(projection.map((m) => m.previsto)),
    confirmado: sumAmounts(projection.map((m) => m.confirmado)),
  };
}

/* ------------------------------------------------------------------ */
/* Parcelas vencidas                                                   */
/* ------------------------------------------------------------------ */

/**
 * Parcelas com vencimento no passado que ainda não foram baixadas.
 *
 * Quando o vencimento cai num mês ANTERIOR ao corrente, `monthlyProjection`
 * nem cria bucket pra trás — a parcela simplesmente some de todos os totais
 * ("Comprometido", "Previsto", "Confirmado", o gráfico de N meses). Quando o
 * vencimento cai DENTRO do mês corrente, `monthlyProjection` (chamada com
 * `todayISO`) exclui a parcela do bucket do mês corrente propositalmente,
 * para que ela apareça só aqui — nunca nas duas caixas ao mesmo tempo. Como
 * não existe UI para dar baixa em 'Pago', esta função é a única forma de o
 * gestor enxergar o dinheiro comprometido que já venceu e continua em
 * aberto.
 */
export function overdueInstallments(rows: InstallmentRow[], todayISO: string): InstallmentRow[] {
  const today = localDayOf(todayISO);
  return rows.filter(
    (r) => r.installment.dueDate < today && r.installment.status !== 'Pago' && r.installment.status !== 'Cancelado'
  );
}

/* ------------------------------------------------------------------ */
/* Limbo: aprovado e não comprado                                      */
/* ------------------------------------------------------------------ */

export interface LimboRequest {
  request: PurchaseRequest;
  buyer?: string;
  approvedAt: string;
  daysWaiting: number;
  committedValue: number;
}

/**
 * Pedidos com valor aprovado que ainda não entraram em "Comprado" há mais
 * de `days` dias. É exatamente o intervalo que motivou o módulo: o gestor
 * já comprometeu o caixa, mas a compra não aconteceu.
 */
export function limboRequests(requests: PurchaseRequest[], days: number, todayISO: string): LimboRequest[] {
  const today = localDayOf(todayISO);
  return requests
    .filter((r) => r.valueApproval && r.status !== 'Cancelada' && !isPurchasedOrLater(r.status))
    .map((r) => ({
      request: r,
      buyer: buyerOf(r),
      approvedAt: r.valueApproval!.approvedAt,
      daysWaiting: diffDays(localDayOf(r.valueApproval!.approvedAt), today),
      committedValue: r.valueApproval!.approvedValue,
    }))
    .filter((l) => l.daysWaiting >= days)
    .sort((a, b) => b.daysWaiting - a.daysWaiting);
}

/* ------------------------------------------------------------------ */
/* Exportação                                                          */
/* ------------------------------------------------------------------ */

export const EXPORT_HEADERS = [
  'Pedido', 'Parcela', 'Vencimento', 'Valor (R$)', 'Status', 'Condição', 'Dias (D+)',
  'Data-base', 'Origem da data-base', 'Vencimento projetado originalmente', 'Valor projetado originalmente',
  'Fornecedor', 'Setor', 'Prioridade', 'Solicitante', 'Comprador', 'Status do pedido',
  'Valor aprovado', 'Aprovado por', 'Aprovado em', 'Divergência',
];

const BASE_SOURCE_LABEL: Record<string, string> = {
  aprovacao_valor: 'Aprovação de valor',
  nota_fiscal: 'Nota fiscal',
  comprado_provisorio: 'Entrada em Comprado (provisória)',
  backfill: 'Backfill',
};

const dateBR = (iso: string) => (iso ? new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '');

export function exportRows(rows: InstallmentRow[]): (string | number)[][] {
  return rows.map(({ installment: i, request: r, buyer }) => [
    r.number,
    `${i.number}/${i.count}`,
    dateBR(i.dueDate),
    i.amount.toFixed(2).replace('.', ','),
    i.status,
    i.paymentTermsLabel,
    i.offsetDays,
    dateBR(i.baseDate),
    BASE_SOURCE_LABEL[i.baseDateSource] ?? i.baseDateSource,
    dateBR(i.origin.dueDate),
    i.origin.amount.toFixed(2).replace('.', ','),
    r.supplier ?? '',
    r.sector,
    r.priority,
    r.requester,
    buyer ?? '',
    r.status,
    r.valueApproval ? r.valueApproval.approvedValue.toFixed(2).replace('.', ',') : '',
    r.valueApproval?.approvedBy ?? '',
    r.valueApproval ? dateBR(localDayOf(r.valueApproval.approvedAt)) : '',
    i.divergenceNote ?? '',
  ]);
}
