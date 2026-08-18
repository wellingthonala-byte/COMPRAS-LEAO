import { describe, it, expect } from 'vitest';
import { PurchaseRequest, Status } from '../types';
import { Installment, PaymentTerms } from '../types/finance';
import { buildHolidaySet } from './finance';
import { planBackfill } from './financeBackfill';

const HOLIDAYS = buildHolidaySet(2026, 2028);
const NOW = '2026-08-20T12:00:00.000Z';
const OPTS = { now: NOW, holidays: HOLIDAYS, fallbackTermsId: '30' };

function makeRequest(id: string, over: Partial<PurchaseRequest> = {}): PurchaseRequest {
  return {
    id,
    number: `#${id}/07/26`,
    requester: 'Alef',
    requesterInitials: 'AL',
    sector: 'Produção',
    priority: 'Não Urgente',
    status: 'Comprado' as Status,
    createdAt: '2026-07-01T10:00:00.000Z',
    deliveryForecast: '2026-09-01',
    supplier: 'Fornecedor X',
    value: 3000,
    items: [],
    history: [],
    ...over,
  };
}

describe('elegibilidade', () => {
  it('pega pedidos já comprados (ou além) com valor cotado', () => {
    const plan = planBackfill([
      makeRequest('1'),
      makeRequest('2', { status: 'Em Rota' }),
      makeRequest('3', { status: 'Em Serviço' }),
      makeRequest('4', { status: 'Disponível para Retirada' }),
    ], [], OPTS);
    expect(plan.candidates.map((c) => c.request.id)).toEqual(['1', '2', '3', '4']);
    expect(plan.skipped).toEqual([]);
  });

  it('nunca fabrica aprovação de valor para pedido ainda vivo antes de Comprado', () => {
    const plan = planBackfill([
      makeRequest('1', { status: 'Nova Solicitação' }),
      makeRequest('2', { status: 'Em Aprovação' }),
      makeRequest('3', { status: 'Em Cotação' }),
    ], [], OPTS);
    expect(plan.candidates).toEqual([]);
    expect(plan.skipped.map((s) => s.reason)).toEqual([
      'Aguardando aprovação de valor do gestor',
      'Aguardando aprovação de valor do gestor',
      'Aguardando aprovação de valor do gestor',
    ]);
  });

  it('respeita pedido em Em Cotação que já tem aprovação de valor real', () => {
    const plan = planBackfill([
      makeRequest('1', {
        status: 'Em Cotação',
        valueApproval: {
          approvedBy: 'Well', approvalId: 'u1', approvedAt: '2026-08-01T09:00:00.000Z',
          approvedValue: 3000, paymentTermsLabel: '30 dias',
        },
      }),
    ], [], OPTS);
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0].synthesizedApproval).toBe(false);
  });

  it('ignora cancelada, finalizada e sem valor', () => {
    const plan = planBackfill([
      makeRequest('1', { status: 'Cancelada' }),
      makeRequest('2', { status: 'Finalizado' }),
      makeRequest('3', { value: undefined }),
      makeRequest('4', { value: 0 }),
    ], [], OPTS);
    expect(plan.candidates).toEqual([]);
    expect(plan.skipped.map((s) => s.reason)).toEqual([
      'Status "Cancelada"', 'Status "Finalizado"', 'Sem valor cotado', 'Sem valor cotado',
    ]);
  });

  it('é idempotente: ignora pedido que já tem parcela', () => {
    const first = planBackfill([makeRequest('1')], [], OPTS);
    expect(first.candidates).toHaveLength(1);

    const created = first.candidates[0].installments;
    const second = planBackfill([makeRequest('1')], created as Installment[], OPTS);
    expect(second.candidates).toEqual([]);
    expect(second.skipped[0].reason).toBe('Já possui parcelas');
  });
});

describe('síntese da aprovação de valor', () => {
  it('registra aprovação retroativa e marca como sintetizada', () => {
    const plan = planBackfill([makeRequest('1', { approvedBy: 'Well', approvedAt: '2026-08-05T09:00:00.000Z' })], [], OPTS);
    const c = plan.candidates[0];

    expect(c.synthesizedApproval).toBe(true);
    expect(c.patchedRequest.valueApproval).toMatchObject({
      approvedBy: 'Backfill (retroativo)',
      approvalId: 'backfill',
      approvedAt: '2026-08-05T09:00:00.000Z',
      approvedValue: 3000,
    });
  });

  it('nunca atribui a aprovação de valor sintetizada ao gestor que só aprovou o mérito', () => {
    // approvedBy aqui é a aprovação de MÉRITO (campo separado de valueApproval) — o
    // backfill não pode usar esse nome como autor de uma aprovação de VALOR que a
    // pessoa nunca deu (era exatamente o bug do finding 24).
    const plan = planBackfill([makeRequest('1', { approvedBy: 'Well', approvedAt: '2026-08-05T09:00:00.000Z' })], [], OPTS);
    expect(plan.candidates[0].patchedRequest.valueApproval?.approvedBy).toBe('Backfill (retroativo)');
  });

  it('sem aprovação de mérito usa a entrada em Em Cotação', () => {
    const plan = planBackfill([makeRequest('1', {
      history: [{ id: 'h1', date: '2026-07-15T10:00:00.000Z', user: 'Charles', action: 'Status alterado', to: 'Em Cotação' }],
    })], [], OPTS);
    expect(plan.candidates[0].patchedRequest.valueApproval?.approvedAt).toBe('2026-07-15T10:00:00.000Z');
    expect(plan.candidates[0].patchedRequest.valueApproval?.approvedBy).toBe('Backfill (retroativo)');
  });

  it('sem histórico nenhum cai para a data de criação', () => {
    const plan = planBackfill([makeRequest('1')], [], OPTS);
    expect(plan.candidates[0].patchedRequest.valueApproval?.approvedAt).toBe('2026-07-01T10:00:00.000Z');
  });

  it('preserva aprovação de valor já existente', () => {
    const existing = {
      approvedBy: 'Well', approvalId: 'u1', approvedAt: '2026-08-01T09:00:00.000Z',
      approvedValue: 3000, paymentTermsLabel: '30 dias',
    };
    const plan = planBackfill([makeRequest('1', { valueApproval: existing })], [], OPTS);
    expect(plan.candidates[0].synthesizedApproval).toBe(false);
    expect(plan.candidates[0].patchedRequest.valueApproval).toEqual(existing);
  });
});

describe('condição de pagamento', () => {
  it('assume a condição escolhida quando o pedido não tem', () => {
    const plan = planBackfill([makeRequest('1')], [], OPTS);
    expect(plan.candidates[0].synthesizedTerms).toBe(true);
    expect(plan.candidates[0].termsLabel).toBe('30 dias');
    expect(plan.candidates[0].installments).toHaveLength(1);
    expect(plan.fallbackTermsLabel).toBe('30 dias');
  });

  it('respeita a condição já registrada', () => {
    const terms: PaymentTerms = { kind: 'dias', days: [30, 60, 90] };
    const plan = planBackfill([makeRequest('1', { value: 9000, paymentTerms: terms })], [], OPTS);
    expect(plan.candidates[0].synthesizedTerms).toBe(false);
    expect(plan.candidates[0].installments).toHaveLength(3);
    expect(plan.candidates[0].installments.map((i) => i.amount)).toEqual([3000, 3000, 3000]);
  });

  it('aceita outro preset como padrão', () => {
    const plan = planBackfill([makeRequest('1', { value: 900 })], [], { ...OPTS, fallbackTermsId: '3x' });
    expect(plan.candidates[0].installments).toHaveLength(3);
    expect(plan.candidates[0].installments.map((i) => i.amount)).toEqual([300, 300, 300]);
  });
});

describe('parcelas geradas', () => {
  it('marca a procedência em origin sem falsear a data-base corrente', () => {
    const plan = planBackfill([makeRequest('1', {
      status: 'Comprado', fiscalNoteDate: '2026-08-03',
      history: [{ id: 'h1', date: '2026-08-02T10:00:00Z', user: 'Charles', action: 'Status alterado', to: 'Comprado' }],
    })], [], OPTS);
    const i = plan.candidates[0].installments[0];

    expect(i.origin.baseDateSource).toBe('backfill');
    // a data que realmente guiou o cálculo continua registrada com honestidade
    expect(i.baseDateSource).toBe('nota_fiscal');
    expect(i.baseDate).toBe('2026-08-03');
    expect(i.status).toBe('Confirmado');
  });

  it('pedido em cotação com aprovação de valor real nasce Previsto', () => {
    const plan = planBackfill([makeRequest('1', {
      status: 'Em Cotação',
      valueApproval: {
        approvedBy: 'Well', approvalId: 'u1', approvedAt: '2026-08-01T09:00:00.000Z',
        approvedValue: 3000, paymentTermsLabel: '30 dias',
      },
    })], [], OPTS);
    expect(plan.candidates[0].installments[0].status).toBe('Previsto');
  });

  it('soma os totais do plano', () => {
    const plan = planBackfill([
      makeRequest('1', { value: 3000 }),
      makeRequest('2', { value: 9000, paymentTerms: { kind: 'dias', days: [30, 60, 90] } }),
    ], [], OPTS);
    expect(plan.totalInstallments).toBe(4);
    expect(plan.totalAmount).toBe(12000);
  });
});
