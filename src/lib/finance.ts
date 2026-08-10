import { PaymentTerms, Installment, InstallmentStatus, BaseDateSource } from '../types/finance';
import { formatPaymentTerms, normalizeDays } from './paymentTerms';

/* ====================================================================
   Serviço de cálculo das parcelas previstas.

   Módulo puro de propósito: nada de localStorage, nada de Date.now()
   implícito, nada de acesso a rede. Tudo que varia entra por parâmetro
   (`now`, `holidays`, `idFactory`) para que o comportamento seja
   verificável em teste. Os efeitos colaterais ficam em financeSync.ts.

   Datas são strings YYYY-MM-DD e toda a aritmética roda em UTC — usar
   Date local aqui produziria deslocamento de um dia em America/Sao_Paulo.
   ==================================================================== */

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

function ymd(iso: string): [number, number, number] {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return [y, m, d];
}

/** Timestamp UTC do dia. */
function utcOf(iso: string): number {
  const [y, m, d] = ymd(iso);
  return Date.UTC(y, m - 1, d);
}

export function isValidISODate(iso: string | undefined | null): boolean {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return false;
  const [y, m, d] = ymd(iso);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function addDays(iso: string, days: number): string {
  return new Date(utcOf(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado */
export function weekdayOf(iso: string): number {
  return new Date(utcOf(iso)).getUTCDay();
}

export function isWeekend(iso: string): boolean {
  const w = weekdayOf(iso);
  return w === 0 || w === 6;
}

/** Primeiro dia do mês de uma data, no formato YYYY-MM. */
export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

export function diffDays(fromISO: string, toISO: string): number {
  return Math.round((utcOf(toISO) - utcOf(fromISO)) / DAY_MS);
}

/* ------------------------------------------------------------------ */
/* Feriados                                                            */
/* ------------------------------------------------------------------ */

/**
 * Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário
 * gregoriano). Base para Carnaval, Sexta-feira Santa e Corpus Christi.
 */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

export interface Holiday {
  date: string;
  name: string;
}

/**
 * Feriados nacionais de um ano.
 *
 * Inclui segunda e terça de Carnaval: não são feriados nacionais por lei,
 * mas são feriado bancário, e o que interessa aqui é quando o dinheiro
 * efetivamente sai do caixa.
 */
export function nationalHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  return [
    { date: `${year}-01-01`, name: 'Confraternização Universal' },
    { date: addDays(easter, -48), name: 'Carnaval (segunda)' },
    { date: addDays(easter, -47), name: 'Carnaval (terça)' },
    { date: addDays(easter, -2), name: 'Sexta-feira Santa' },
    { date: `${year}-04-21`, name: 'Tiradentes' },
    { date: `${year}-05-01`, name: 'Dia do Trabalho' },
    { date: addDays(easter, 60), name: 'Corpus Christi' },
    { date: `${year}-09-07`, name: 'Independência do Brasil' },
    { date: `${year}-10-12`, name: 'Nossa Senhora Aparecida' },
    { date: `${year}-11-02`, name: 'Finados' },
    { date: `${year}-11-15`, name: 'Proclamação da República' },
    { date: `${year}-11-20`, name: 'Consciência Negra' },
    { date: `${year}-12-25`, name: 'Natal' },
  ].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Conjunto de feriados para uma faixa de anos, mais os municipais
 * informados em Configurações.
 */
export function buildHolidaySet(fromYear: number, toYear: number, extra: string[] = []): Set<string> {
  const set = new Set<string>();
  for (let y = fromYear; y <= toYear; y++) {
    for (const h of nationalHolidays(y)) set.add(h.date);
  }
  for (const d of extra) if (isValidISODate(d)) set.add(d.slice(0, 10));
  return set;
}

export function isBusinessDay(iso: string, holidays: Set<string>): boolean {
  return !isWeekend(iso) && !holidays.has(iso);
}

/** Anda para trás até achar dia útil. */
export function previousBusinessDay(iso: string, holidays: Set<string>): string {
  let cur = iso;
  for (let i = 0; i < 30 && !isBusinessDay(cur, holidays); i++) cur = addDays(cur, -1);
  return cur;
}

/** Anda para frente até achar dia útil. */
export function nextBusinessDay(iso: string, holidays: Set<string>): string {
  let cur = iso;
  for (let i = 0; i < 30 && !isBusinessDay(cur, holidays); i++) cur = addDays(cur, 1);
  return cur;
}

/**
 * Regra do financeiro da Leão: vencimento em fim de semana ou feriado
 * ANTECIPA para o dia útil anterior, para o caixa nunca estourar o mês.
 *
 * Exceção: a antecipação não pode cair antes da data-base — uma compra à
 * vista faturada num sábado não vence na sexta anterior à própria nota.
 * Nesse caso o vencimento é empurrado para o próximo dia útil.
 */
export function adjustDueDate(dueISO: string, baseISO: string, holidays: Set<string>): string {
  if (isBusinessDay(dueISO, holidays)) return dueISO;
  const earlier = previousBusinessDay(dueISO, holidays);
  return earlier < baseISO ? nextBusinessDay(dueISO, holidays) : earlier;
}

/* ------------------------------------------------------------------ */
/* Rateio de valor                                                     */
/* ------------------------------------------------------------------ */

/**
 * Divide um total em N parcelas em centavos inteiros, sem perder nem
 * inventar centavo: a soma do resultado é sempre igual ao total.
 *
 * A sobra da dízima vai para as ÚLTIMAS parcelas (um centavo cada), que é
 * como o financeiro emite carnê — R$ 100 em 3x dá 33,33 / 33,33 / 33,34.
 */
export function splitAmount(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const cents = Math.round(Math.max(0, total) * 100);
  const base = Math.floor(cents / parts);
  const rest = cents - base * parts;
  return Array.from({ length: parts }, (_, i) => (base + (i >= parts - rest ? 1 : 0)) / 100);
}

/** Soma valores em centavos para não acumular erro de ponto flutuante. */
export function sumAmounts(values: number[]): number {
  return values.reduce((acc, v) => acc + Math.round(v * 100), 0) / 100;
}

/* ------------------------------------------------------------------ */
/* Geração das parcelas                                                */
/* ------------------------------------------------------------------ */

export interface ComputeInstallmentsInput {
  requestId: string;
  total: number;
  terms: PaymentTerms;
  /** Data que origina a contagem dos dias (YYYY-MM-DD). */
  baseDate: string;
  baseDateSource: BaseDateSource;
  holidays: Set<string>;
  /** Timestamp ISO usado em createdAt/updatedAt. Injetável para teste. */
  now: string;
  status?: InstallmentStatus;
  idFactory?: () => string;
}

let idCounter = 0;
/** Gera um UUID v4. Usa crypto quando disponível; o fallback cobre o Node do teste. */
export function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  idCounter += 1;
  const rnd = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return `${rnd()}${rnd()}-${rnd()}-4${rnd().slice(1)}-8${rnd().slice(1)}-${rnd()}${rnd()}${pad(idCounter % 100)}00`;
}

/** Projeta as parcelas de uma condição de pagamento. */
export function computeInstallments(input: ComputeInstallmentsInput): Installment[] {
  const {
    requestId, total, terms, baseDate, baseDateSource, holidays, now,
    status = 'Previsto', idFactory = newId,
  } = input;

  const days = normalizeDays(terms.days);
  if (days.length === 0 || !isValidISODate(baseDate)) return [];

  const label = formatPaymentTerms(terms);
  const amounts = splitAmount(total, days.length);

  return days.map((offset, idx) => {
    const rawDue = addDays(baseDate, offset);
    const dueDate = adjustDueDate(rawDue, baseDate, holidays);
    const amount = amounts[idx];
    return {
      id: idFactory(),
      requestId,
      number: idx + 1,
      count: days.length,
      amount,
      dueDate,
      offsetDays: offset,
      baseDate,
      baseDateSource,
      status,
      paymentTermsLabel: label,
      origin: { amount, dueDate, baseDate, baseDateSource, createdAt: now },
      createdAt: now,
      updatedAt: now,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Recálculo                                                           */
/* ------------------------------------------------------------------ */

export interface RecalcInstallmentsInput {
  existing: Installment[];
  requestId: string;
  total: number;
  terms: PaymentTerms;
  baseDate: string;
  baseDateSource: BaseDateSource;
  /** Status alvo das parcelas ativas — 'Confirmado' na entrada em Comprado. */
  status: InstallmentStatus;
  holidays: Set<string>;
  now: string;
  /** Registrada na parcela quando o valor comprado divergiu do aprovado. */
  divergenceNote?: string;
  idFactory?: () => string;
}

/**
 * Recalcula o parcelamento preservando a auditoria.
 *
 * - `origin` das parcelas que já existiam nunca é reescrito: é a projeção
 *   original que o gestor viu ao aprovar.
 * - Parcelas já pagas são congeladas (valor e vencimento), e o restante do
 *   total é redistribuído entre as demais.
 * - Se a nova condição tem menos parcelas que a anterior, as excedentes
 *   viram Cancelado com nota. Nunca são apagadas.
 */
export function recalcInstallments(input: RecalcInstallmentsInput): Installment[] {
  const {
    existing, requestId, total, terms, baseDate, baseDateSource, status,
    holidays, now, divergenceNote, idFactory = newId,
  } = input;

  const days = normalizeDays(terms.days);
  if (days.length === 0 || !isValidISODate(baseDate)) return existing;

  const label = formatPaymentTerms(terms);
  const byNumber = new Map(existing.map((i) => [i.number, i]));

  const paidNumbers = new Set(
    existing.filter((i) => i.status === 'Pago' && i.number <= days.length).map((i) => i.number)
  );
  const paidSum = sumAmounts(
    existing.filter((i) => paidNumbers.has(i.number)).map((i) => i.amount)
  );

  const activePositions = days.map((_, idx) => idx + 1).filter((n) => !paidNumbers.has(n));
  const activeAmounts = splitAmount(Math.max(0, total - paidSum), activePositions.length);
  const amountByNumber = new Map(activePositions.map((n, i) => [n, activeAmounts[i]]));

  const updated: Installment[] = days.map((offset, idx) => {
    const number = idx + 1;
    const prev = byNumber.get(number);

    // parcela paga é intocável
    if (prev && paidNumbers.has(number)) return prev;

    const rawDue = addDays(baseDate, offset);
    const dueDate = adjustDueDate(rawDue, baseDate, holidays);
    const amount = amountByNumber.get(number) ?? 0;

    if (prev) {
      return {
        ...prev,
        count: days.length,
        amount,
        dueDate,
        offsetDays: offset,
        baseDate,
        baseDateSource,
        status: prev.status === 'Cancelado' ? 'Cancelado' : status,
        paymentTermsLabel: label,
        divergenceNote: divergenceNote ?? prev.divergenceNote,
        updatedAt: now,
        // origin preservado de propósito
      };
    }

    // parcela que não existia na projeção original
    return {
      id: idFactory(),
      requestId,
      number,
      count: days.length,
      amount,
      dueDate,
      offsetDays: offset,
      baseDate,
      baseDateSource,
      status,
      paymentTermsLabel: label,
      origin: { amount, dueDate, baseDate, baseDateSource, createdAt: now },
      divergenceNote,
      createdAt: now,
      updatedAt: now,
    };
  });

  // excedentes da condição anterior: cancela em vez de apagar
  const surplus = existing
    .filter((i) => i.number > days.length)
    .map<Installment>((i) => (i.status === 'Pago' ? i : {
      ...i,
      status: 'Cancelado',
      cancelledAt: i.cancelledAt ?? now,
      divergenceNote: i.divergenceNote
        ?? `Cancelada no recálculo: a condição passou de ${i.count}x para ${days.length}x.`,
      updatedAt: now,
    }));

  return [...updated, ...surplus];
}

/** Cancela as parcelas em aberto de um pedido cancelado. Pagas permanecem. */
export function cancelInstallments(existing: Installment[], now: string, note: string): Installment[] {
  return existing.map((i) => (i.status === 'Pago' || i.status === 'Cancelado' ? i : {
    ...i,
    status: 'Cancelado' as InstallmentStatus,
    cancelledAt: now,
    divergenceNote: note,
    updatedAt: now,
  }));
}

/* ------------------------------------------------------------------ */
/* Divergência de valor                                                */
/* ------------------------------------------------------------------ */

export interface ValueDivergence {
  approved: number;
  purchased: number;
  /** Positivo = comprou mais caro que o aprovado. */
  amount: number;
  percent: number;
  hasDivergence: boolean;
}

/** Tolerância de 1 centavo: arredondamento não é divergência. */
export function valueDivergence(approved: number | undefined, purchased: number | undefined): ValueDivergence {
  const a = approved ?? 0;
  const p = purchased ?? 0;
  const amount = Math.round((p - a) * 100) / 100;
  return {
    approved: a,
    purchased: p,
    amount,
    percent: a === 0 ? 0 : Math.round((amount / a) * 10000) / 100,
    hasDivergence: Math.abs(amount) > 0.01,
  };
}

export function formatDivergenceNote(d: ValueDivergence): string {
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dir = d.amount > 0 ? 'acima' : 'abaixo';
  return `Valor comprado ${fmt(d.purchased)} ficou ${fmt(Math.abs(d.amount))} (${Math.abs(d.percent).toFixed(2)}%) ${dir} do valor aprovado ${fmt(d.approved)}.`;
}

/* ------------------------------------------------------------------ */
/* Data-base                                                           */
/* ------------------------------------------------------------------ */

export interface BaseDateChoice {
  baseDate: string;
  source: BaseDateSource;
  /** true quando a data da NF ainda não existe e a base é provisória. */
  provisional: boolean;
}

/**
 * Data-base ao confirmar a compra: a nota fiscal é a referência
 * (o 30/60/90 conta da NF, não da aprovação). Sem data de NF, usa a data
 * de entrada em "Comprado" como provisória e sinaliza para recalcular
 * quando a NF chegar.
 */
export function chooseConfirmedBaseDate(fiscalNoteDate: string | undefined, purchasedAtISO: string): BaseDateChoice {
  if (isValidISODate(fiscalNoteDate)) {
    return { baseDate: fiscalNoteDate!.slice(0, 10), source: 'nota_fiscal', provisional: false };
  }
  return { baseDate: purchasedAtISO.slice(0, 10), source: 'comprado_provisorio', provisional: true };
}
