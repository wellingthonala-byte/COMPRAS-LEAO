import { describe, it, expect } from 'vitest';
import { PurchaseRequest, Status } from '../types';
import { Installment, PaymentTerms } from '../types/finance';
import { buildHolidaySet, computeInstallments } from './finance';
import {
  addMonths, applyFilters, buyerOf, commitmentSummary, EMPTY_FILTERS, exportRows, filterOptions,
  groupByRequest, hasActiveFilters, InstallmentRow, joinInstallments, limboRequests, monthLabel,
  monthlyProjection, overdueInstallments, rowsOfMonth,
} from './financeQueries';

const HOLIDAYS = buildHolidaySet(2026, 2028);
const NOW = '2026-08-20T12:00:00.000Z';
const D306090: PaymentTerms = { kind: 'dias', days: [30, 60, 90] };

function makeRequest(id: string, over: Partial<PurchaseRequest> = {}): PurchaseRequest {
  return {
    id,
    number: `#${id}/07/26`,
    requester: 'Alef',
    requesterInitials: 'AL',
    sector: 'Produção',
    priority: 'Não Urgente',
    status: 'Em Cotação' as Status,
    createdAt: '2026-07-01T10:00:00.000Z',
    deliveryForecast: '2026-09-01',
    supplier: 'Fornecedor X',
    value: 9000,
    paymentTerms: D306090,
    items: [{ id: 'i1', description: 'Rolamento SKF', quantity: 2, application: 'Prensa', priority: 'Não Urgente', deliveryForecast: '2026-09-01' }],
    history: [],
    valueApproval: {
      approvedBy: 'Well', approvalId: 'u1', approvedAt: '2026-08-10T09:00:00.000Z',
      approvedValue: 9000, paymentTermsLabel: '30/60/90',
    },
    ...over,
  };
}

function makeInstallments(request: PurchaseRequest, over: Partial<Installment> = {}): Installment[] {
  let n = 0;
  return computeInstallments({
    requestId: request.id,
    total: request.value as number,
    terms: request.paymentTerms as PaymentTerms,
    baseDate: '2026-08-10',
    baseDateSource: 'aprovacao_valor',
    holidays: HOLIDAYS,
    now: NOW,
    idFactory: () => `${request.id}-${++n}`,
  }).map((i) => ({ ...i, ...over }));
}

describe('rótulos e aritmética de mês', () => {
  it('formata o mês', () => {
    expect(monthLabel('2026-08')).toBe('ago/26');
    expect(monthLabel('2027-01')).toBe('jan/27');
  });

  it('avança meses atravessando o ano', () => {
    expect(addMonths('2026-08', 1)).toBe('2026-09');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', 12)).toBe('2027-01');
    expect(addMonths('2026-03', -3)).toBe('2025-12');
  });
});

describe('comprador inferido do histórico', () => {
  it('prefere quem editou a cotação por último', () => {
    const r = makeRequest('1', {
      history: [
        { id: 'h1', date: '2026-08-01T10:00:00Z', user: 'Charles', action: 'Cotação atualizada — valor: R$ 0,00 → R$ 9.000,00' },
        { id: 'h2', date: '2026-08-05T10:00:00Z', user: 'Marina', action: 'Cotação atualizada — condição de pagamento: — → 30/60/90' },
      ],
    });
    expect(buyerOf(r)).toBe('Marina');
  });

  it('cai para quem moveu o card', () => {
    const r = makeRequest('1', {
      history: [{ id: 'h1', date: '2026-08-05T10:00:00Z', user: 'Charles', action: 'Status alterado', to: 'Comprado' }],
    });
    expect(buyerOf(r)).toBe('Charles');
  });

  it('devolve undefined sem histórico útil', () => {
    expect(buyerOf(makeRequest('1'))).toBeUndefined();
  });
});

describe('junção parcela + pedido', () => {
  it('descarta parcela cujo pedido não está carregado', () => {
    const req = makeRequest('1');
    const orphan = makeInstallments(makeRequest('2'));
    const rows = joinInstallments([...makeInstallments(req), ...orphan], [req]);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.request.id === '1')).toBe(true);
  });
});

describe('projeção mensal', () => {
  const req = makeRequest('1');
  // vencimentos: 2026-09-09, 2026-10-09, 2026-11-06
  const rows = joinInstallments(makeInstallments(req), [req]);

  it('distribui as parcelas nos meses certos', () => {
    const months = monthlyProjection(rows, '2026-08', 4);
    expect(months.map((m) => m.monthKey)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11']);
    expect(months.map((m) => m.total)).toEqual([0, 3000, 3000, 3000]);
    expect(months.map((m) => m.count)).toEqual([0, 1, 1, 1]);
  });

  it('separa Previsto de Confirmado', () => {
    const mixed = joinInstallments(
      makeInstallments(req).map((i, n) => (n === 0 ? { ...i, status: 'Confirmado' as const } : i)),
      [req]
    );
    const months = monthlyProjection(mixed, '2026-09', 3);
    expect(months[0]).toMatchObject({ previsto: 0, confirmado: 3000, total: 3000 });
    expect(months[1]).toMatchObject({ previsto: 3000, confirmado: 0, total: 3000 });
  });

  it('nunca soma parcela cancelada', () => {
    const cancelled = joinInstallments(
      makeInstallments(req).map((i) => ({ ...i, status: 'Cancelado' as const })),
      [req]
    );
    const months = monthlyProjection(cancelled, '2026-08', 6);
    expect(months.every((m) => m.total === 0 && m.count === 0)).toBe(true);
  });

  it('inclui Pago no compromisso do mês, contabilizado à parte', () => {
    const paid = joinInstallments(
      makeInstallments(req).map((i, n) => (n === 0 ? { ...i, status: 'Pago' as const } : i)),
      [req]
    );
    const set = monthlyProjection(paid, '2026-09', 1)[0];
    expect(set).toMatchObject({ pago: 3000, previsto: 0, total: 3000 });
  });

  it('devolve meses vazios em vez de pular períodos', () => {
    const months = monthlyProjection([], '2026-08', 12);
    expect(months).toHaveLength(12);
    expect(months[months.length - 1].monthKey).toBe('2027-07');
  });

  it('ignora parcela fora da janela pedida', () => {
    const months = monthlyProjection(rows, '2026-08', 2);
    expect(months.map((m) => m.total)).toEqual([0, 3000]);
  });

  function makeOverdueRow(): InstallmentRow {
    const overdueReq = makeRequest('9');
    const [base] = makeInstallments(overdueReq);
    const installment: Installment = { ...base, dueDate: '2026-08-05', amount: 9000, status: 'Previsto' };
    return { installment, request: overdueReq, buyer: undefined };
  }

  it('com todayISO, exclui do bucket do mês corrente a parcela já vencida (evita dupla contagem com overdueInstallments)', () => {
    // hoje = 2026-08-19; parcela vence 2026-08-05, dentro do mês corrente mas
    // já vencida — antes da correção ela era somada aqui E em
    // overdueInstallments ao mesmo tempo.
    const overdueRows = [makeOverdueRow()];
    const today = '2026-08-19T12:00:00.000Z';

    const months = monthlyProjection(overdueRows, '2026-08', 1, today);
    expect(months[0]).toMatchObject({ previsto: 0, total: 0, count: 0 });

    const overdue = overdueInstallments(overdueRows, today);
    expect(overdue).toHaveLength(1);
    expect(overdue[0].installment.amount).toBe(9000);
  });

  it('sem todayISO, mantém o comportamento anterior (compat) — não exclui vencidas do bucket', () => {
    const overdueRows = [makeOverdueRow()];
    const months = monthlyProjection(overdueRows, '2026-08', 1);
    expect(months[0]).toMatchObject({ previsto: 9000, total: 9000, count: 1 });
  });

  it('mês futuro continua somando normalmente mesmo com todayISO informado', () => {
    const months = monthlyProjection(rows, '2026-08', 4, '2026-08-19T12:00:00.000Z');
    expect(months.map((m) => m.total)).toEqual([0, 3000, 3000, 3000]);
  });
});

describe('drill-down do mês', () => {
  const a = makeRequest('1');
  const b = makeRequest('2', { supplier: 'Fornecedor Y', value: 600, paymentTerms: { kind: 'dias', days: [30] } });
  const rows = joinInstallments([...makeInstallments(a), ...makeInstallments(b)], [a, b]);

  it('lista as parcelas do mês ordenadas por vencimento', () => {
    const set = rowsOfMonth(rows, '2026-09');
    expect(set).toHaveLength(2);
    expect(set.map((r) => r.installment.dueDate)).toEqual(['2026-09-09', '2026-09-09']);
  });

  it('agrupa por pedido, do maior valor para o menor', () => {
    const grouped = groupByRequest(rowsOfMonth(rows, '2026-09'));
    expect(grouped.map((g) => g.request.id)).toEqual(['1', '2']);
    expect(grouped.map((g) => g.amount)).toEqual([3000, 600]);
  });
});

describe('filtros', () => {
  const a = makeRequest('1');
  const b = makeRequest('2', {
    supplier: 'Fornecedor Y', sector: 'Manutenção', priority: 'Máquina Parada', requester: 'Bruna',
    history: [{ id: 'h1', date: '2026-08-05T10:00:00Z', user: 'Charles', action: 'Cotação atualizada — valor' }],
  });
  const rows = joinInstallments([...makeInstallments(a), ...makeInstallments(b)], [a, b]);

  it('sem filtro devolve tudo', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(applyFilters(rows, EMPTY_FILTERS)).toHaveLength(6);
  });

  it('filtra por período de vencimento', () => {
    const out = applyFilters(rows, { ...EMPTY_FILTERS, from: '2026-10-01', to: '2026-10-31' });
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.installment.dueDate.startsWith('2026-10'))).toBe(true);
  });

  it('filtra por setor, prioridade, fornecedor, solicitante e comprador', () => {
    expect(applyFilters(rows, { ...EMPTY_FILTERS, sector: 'Manutenção' })).toHaveLength(3);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, priority: 'Máquina Parada' })).toHaveLength(3);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, supplier: 'Fornecedor X' })).toHaveLength(3);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, requester: 'Bruna' })).toHaveLength(3);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, buyer: 'Charles' })).toHaveLength(3);
  });

  it('filtra por status da parcela', () => {
    const mixed = joinInstallments(
      makeInstallments(a).map((i, n) => (n === 0 ? { ...i, status: 'Confirmado' as const } : i)), [a]
    );
    expect(applyFilters(mixed, { ...EMPTY_FILTERS, status: 'Confirmado' })).toHaveLength(1);
    expect(applyFilters(mixed, { ...EMPTY_FILTERS, status: 'Previsto' })).toHaveLength(2);
  });

  it('busca livre acha por número, fornecedor e descrição do item', () => {
    expect(applyFilters(rows, { ...EMPTY_FILTERS, search: '#2/07/26' })).toHaveLength(3);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, search: 'fornecedor y' })).toHaveLength(3);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, search: 'rolamento' })).toHaveLength(6);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, search: 'inexistente' })).toHaveLength(0);
  });

  it('combina filtros', () => {
    const out = applyFilters(rows, { ...EMPTY_FILTERS, sector: 'Manutenção', from: '2026-11-01' });
    expect(out).toHaveLength(1);
  });

  it('lista as opções distintas ordenadas', () => {
    const opts = filterOptions(rows);
    expect(opts.suppliers).toEqual(['Fornecedor X', 'Fornecedor Y']);
    expect(opts.requesters).toEqual(['Alef', 'Bruna']);
    expect(opts.buyers).toEqual(['Charles']);
  });
});

describe('resumo para o Dashboard', () => {
  it('soma o mês corrente e os dois seguintes', () => {
    const req = makeRequest('1');
    const rows = joinInstallments(makeInstallments(req), [req]);
    // hoje 2026-08: ago (0) + set (3000) + out (3000)
    const summary = commitmentSummary(rows, NOW, 3);
    expect(summary.months).toHaveLength(3);
    expect(summary.total).toBe(6000);
    expect(summary.previsto).toBe(6000);
    expect(summary.confirmado).toBe(0);
  });

  it('não duplica com overdueInstallments uma parcela vencida dentro do mês corrente', () => {
    // Regressão do bug: parcela de R$1000, Previsto, vencida em 2026-08-05
    // (hoje é 2026-08-19) — não pode contar em "Previsto" do mês corrente E
    // em "Vencido e em aberto" ao mesmo tempo.
    const req = makeRequest('9');
    const [base] = makeInstallments(req);
    const installment: Installment = { ...base, dueDate: '2026-08-05', amount: 1000, status: 'Previsto' };
    const rows = [{ installment, request: req, buyer: undefined }];

    const summary = commitmentSummary(rows, NOW, 3);
    const overdue = overdueInstallments(rows, NOW);

    expect(summary.previsto).toBe(0);
    expect(overdue).toHaveLength(1);
    expect(overdue[0].installment.amount).toBe(1000);
  });
});

describe('limbo: aprovado e não comprado', () => {
  it('pega os aprovados há mais de X dias que não entraram em Comprado', () => {
    const parado = makeRequest('1'); // aprovado em 2026-08-10, 10 dias antes de NOW
    const comprado = makeRequest('2', { status: 'Comprado' });
    const recente = makeRequest('3', {
      valueApproval: { ...makeRequest('3').valueApproval!, approvedAt: '2026-08-19T09:00:00.000Z' },
    });
    const semAprovacao = makeRequest('4', { valueApproval: undefined });
    const cancelado = makeRequest('5', { status: 'Cancelada' });

    const out = limboRequests([parado, comprado, recente, semAprovacao, cancelado], 7, NOW);
    expect(out.map((l) => l.request.id)).toEqual(['1']);
    expect(out[0].daysWaiting).toBe(10);
    expect(out[0].committedValue).toBe(9000);
  });

  it('ordena do mais parado para o menos', () => {
    const antigo = makeRequest('1', {
      valueApproval: { ...makeRequest('1').valueApproval!, approvedAt: '2026-07-01T09:00:00.000Z' },
    });
    const novo = makeRequest('2');
    const out = limboRequests([novo, antigo], 7, NOW);
    expect(out.map((l) => l.request.id)).toEqual(['1', '2']);
  });

  it('não considera Em Rota nem Finalizado como limbo', () => {
    expect(limboRequests([makeRequest('1', { status: 'Em Rota' })], 1, NOW)).toEqual([]);
    expect(limboRequests([makeRequest('1', { status: 'Finalizado' })], 1, NOW)).toEqual([]);
  });
});

describe('exportação', () => {
  it('gera uma linha por parcela com número decimal em pt-BR', () => {
    const req = makeRequest('1', { value: 1000, paymentTerms: { kind: 'dias', days: [30, 60, 90] } });
    const rows = joinInstallments(makeInstallments(req), [req]);
    const out = exportRows(rows);

    expect(out).toHaveLength(3);
    expect(out[0][0]).toBe('#1/07/26');
    expect(out[0][1]).toBe('1/3');
    expect(out[0][2]).toBe('09/09/2026');
    expect(out[0][3]).toBe('333,33');
    expect(out[2][3]).toBe('333,34');
    expect(out[0][8]).toBe('Aprovação de valor');
  });
});
