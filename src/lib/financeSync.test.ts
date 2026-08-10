import { describe, it, expect } from 'vitest';
import { PurchaseRequest, Status } from '../types';
import { Installment, PaymentTerms } from '../types/finance';
import { buildHolidaySet, computeInstallments } from './finance';
import {
  canProjectInstallments, deriveInstallments, diffInstallments, isPurchasedOrLater, purchasedAtOf,
} from './financeSync';

const HOLIDAYS = buildHolidaySet(2026, 2028);
const NOW = '2026-08-20T12:00:00.000Z';
const REQ = '11111111-1111-4111-8111-111111111111';
const APPROVED_AT = '2026-08-10T09:00:00.000Z';

const D306090: PaymentTerms = { kind: 'dias', days: [30, 60, 90] };

function makeRequest(over: Partial<PurchaseRequest> = {}): PurchaseRequest {
  return {
    id: REQ,
    number: '#317/07/26',
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
    items: [],
    history: [],
    ...over,
  };
}

const approved = (over: Partial<PurchaseRequest> = {}) => makeRequest({
  valueApproval: {
    approvedBy: 'Well',
    approvalId: 'u1',
    approvedAt: APPROVED_AT,
    approvedValue: 9000,
    paymentTermsLabel: '30/60/90',
  },
  ...over,
});

/** Parcelas como ficariam logo após a aprovação de valor. */
const afterApproval = (req: PurchaseRequest) =>
  deriveInstallments(req, [], NOW, HOLIDAYS) as Installment[];

describe('fase do pedido', () => {
  it('reconhece as colunas a partir de Comprado', () => {
    expect(isPurchasedOrLater('Nova Solicitação')).toBe(false);
    expect(isPurchasedOrLater('Em Aprovação')).toBe(false);
    expect(isPurchasedOrLater('Em Cotação')).toBe(false);
    expect(isPurchasedOrLater('Comprado')).toBe(true);
    expect(isPurchasedOrLater('Em Rota')).toBe(true);
    expect(isPurchasedOrLater('Finalizado')).toBe(true);
    // Cancelada não faz parte da ordem do board
    expect(isPurchasedOrLater('Cancelada')).toBe(false);
  });

  it('acha no histórico quando o card entrou em Comprado', () => {
    const req = makeRequest({
      history: [
        { id: 'h1', date: '2026-08-01T10:00:00Z', user: 'Charles', action: 'Status alterado', to: 'Em Cotação' },
        { id: 'h2', date: '2026-08-18T15:30:00Z', user: 'Charles', action: 'Status alterado', to: 'Comprado' },
        { id: 'h3', date: '2026-08-19T09:00:00Z', user: 'Charles', action: 'Status alterado', to: 'Em Rota' },
      ],
    });
    expect(purchasedAtOf(req)).toBe('2026-08-18T15:30:00Z');
    expect(purchasedAtOf(makeRequest())).toBeUndefined();
  });

  it('só projeta com valor e condição', () => {
    expect(canProjectInstallments(makeRequest())).toBe(true);
    expect(canProjectInstallments(makeRequest({ value: undefined }))).toBe(false);
    expect(canProjectInstallments(makeRequest({ value: 0 }))).toBe(false);
    expect(canProjectInstallments(makeRequest({ paymentTerms: undefined }))).toBe(false);
    expect(canProjectInstallments(makeRequest({ paymentTerms: { kind: 'dias', days: [] } }))).toBe(false);
  });
});

describe('o compromisso nasce na aprovação de valor', () => {
  it('não cria parcela nenhuma antes da aprovação de valor', () => {
    expect(deriveInstallments(makeRequest(), [], NOW, HOLIDAYS)).toBeNull();
    // nem mesmo quando o card já está em Comprado sem aprovação de valor
    expect(deriveInstallments(makeRequest({ status: 'Comprado' }), [], NOW, HOLIDAYS)).toBeNull();
  });

  it('não cria parcela sem valor ou sem condição, mesmo aprovado', () => {
    expect(deriveInstallments(approved({ value: undefined }), [], NOW, HOLIDAYS)).toBeNull();
    expect(deriveInstallments(approved({ paymentTerms: undefined }), [], NOW, HOLIDAYS)).toBeNull();
  });

  it('gera parcelas Previsto contando da data da aprovação, ainda em Em Cotação', () => {
    const out = afterApproval(approved());
    expect(out).toHaveLength(3);
    expect(out.every((i) => i.status === 'Previsto')).toBe(true);
    expect(out.every((i) => i.baseDate === '2026-08-10')).toBe(true);
    expect(out.every((i) => i.baseDateSource === 'aprovacao_valor')).toBe(true);
    expect(out.map((i) => i.amount)).toEqual([3000, 3000, 3000]);
    expect(out.map((i) => i.dueDate)).toEqual(['2026-09-09', '2026-10-09', '2026-11-06']);
  });
});

describe('entrada em Comprado', () => {
  const purchasedHistory = [
    { id: 'h2', date: '2026-08-18T15:30:00Z', user: 'Charles', action: 'Status alterado', to: 'Comprado' as Status },
  ];

  it('recalcula pela data da NF e vira Confirmado', () => {
    const before = afterApproval(approved());
    const req = approved({ status: 'Comprado', fiscalNoteDate: '2026-09-01', history: purchasedHistory });
    const out = deriveInstallments(req, before, NOW, HOLIDAYS) as Installment[];

    expect(out.every((i) => i.status === 'Confirmado')).toBe(true);
    expect(out.every((i) => i.baseDate === '2026-09-01')).toBe(true);
    expect(out.every((i) => i.baseDateSource === 'nota_fiscal')).toBe(true);
    expect(out.map((i) => i.dueDate)).toEqual(['2026-10-01', '2026-10-30', '2026-11-30']);
    // a projeção original que o gestor viu permanece registrada
    expect(out.map((i) => i.origin.dueDate)).toEqual(['2026-09-09', '2026-10-09', '2026-11-06']);
  });

  it('sem data de NF usa a entrada em Comprado como base provisória', () => {
    const before = afterApproval(approved());
    const req = approved({ status: 'Comprado', history: purchasedHistory });
    const out = deriveInstallments(req, before, NOW, HOLIDAYS) as Installment[];

    expect(out.every((i) => i.baseDate === '2026-08-18')).toBe(true);
    expect(out.every((i) => i.baseDateSource === 'comprado_provisorio')).toBe(true);
    expect(out.every((i) => i.status === 'Confirmado')).toBe(true);
  });

  it('a NF informada depois substitui a base provisória', () => {
    const req = approved({ status: 'Comprado', history: purchasedHistory });
    const provisional = deriveInstallments(req, afterApproval(approved()), NOW, HOLIDAYS) as Installment[];
    expect(provisional[0].baseDateSource).toBe('comprado_provisorio');

    const withNF = deriveInstallments(
      { ...req, fiscalNoteDate: '2026-09-01' }, provisional, NOW, HOLIDAYS,
    ) as Installment[];
    expect(withNF.every((i) => i.baseDateSource === 'nota_fiscal')).toBe(true);
    expect(withNF[0].dueDate).toBe('2026-10-01');
    // ids preservados: é a mesma parcela, recalculada
    expect(withNF.map((i) => i.id)).toEqual(provisional.map((i) => i.id));
    // e a origem continua sendo a projeção da aprovação
    expect(withNF.every((i) => i.origin.baseDateSource === 'aprovacao_valor')).toBe(true);
  });

  it('sem histórico de Comprado cai para a data da aprovação', () => {
    const before = afterApproval(approved());
    const req = approved({ status: 'Comprado' });
    const out = deriveInstallments(req, before, NOW, HOLIDAYS) as Installment[];
    expect(out.every((i) => i.baseDate === '2026-08-10')).toBe(true);
  });

  it('sinaliza divergência entre valor aprovado e comprado', () => {
    const before = afterApproval(approved());
    const req = approved({
      status: 'Comprado', value: 9600, fiscalNoteDate: '2026-09-01', history: purchasedHistory,
    });
    const out = deriveInstallments(req, before, NOW, HOLIDAYS) as Installment[];

    expect(out.map((i) => i.amount)).toEqual([3200, 3200, 3200]);
    expect(out[0].divergenceNote).toContain('acima');
    expect(out[0].divergenceNote).toContain('6,67%');
    // o valor originalmente projetado segue disponível para auditoria
    expect(out.map((i) => i.origin.amount)).toEqual([3000, 3000, 3000]);
  });

  it('não marca divergência antes da compra', () => {
    const req = approved({ value: 9600 });
    const out = afterApproval(req);
    expect(out.every((i) => i.divergenceNote === undefined)).toBe(true);
  });
});

describe('cancelamento', () => {
  it('cancela as parcelas em aberto e registra o motivo', () => {
    const before = afterApproval(approved());
    const req = approved({ status: 'Cancelada', cancelReason: 'fornecedor sem estoque' });
    const out = deriveInstallments(req, before, NOW, HOLIDAYS) as Installment[];

    expect(out.every((i) => i.status === 'Cancelado')).toBe(true);
    expect(out[0].divergenceNote).toContain('fornecedor sem estoque');
    expect(out[0].cancelledAt).toBe(NOW);
  });

  it('cancelamento sem parcelas não faz nada', () => {
    expect(deriveInstallments(makeRequest({ status: 'Cancelada' }), [], NOW, HOLIDAYS)).toBeNull();
  });
});

describe('diffInstallments', () => {
  const base = () => computeInstallments({
    requestId: REQ, total: 9000, terms: D306090, baseDate: '2026-08-10',
    baseDateSource: 'aprovacao_valor', holidays: HOLIDAYS, now: NOW,
    idFactory: (() => { let n = 0; return () => `id-${++n}`; })(),
  });

  it('não acusa mudança quando nada relevante mudou', () => {
    const existing = base();
    expect(diffInstallments(existing, existing)).toEqual([]);
  });

  it('ignora updatedAt — senão a reconciliação reescreveria tudo a cada abertura', () => {
    const existing = base();
    const touched = existing.map((i) => ({ ...i, updatedAt: '2027-01-01T00:00:00.000Z' }));
    expect(diffInstallments(existing, touched)).toEqual([]);
  });

  it('acusa mudança de valor, vencimento e status', () => {
    const existing = base();
    expect(diffInstallments(existing, existing.map((i, n) => (n === 0 ? { ...i, amount: 1 } : i)))).toHaveLength(1);
    expect(diffInstallments(existing, existing.map((i, n) => (n === 1 ? { ...i, dueDate: '2026-12-01' } : i)))).toHaveLength(1);
    expect(diffInstallments(existing, existing.map((i) => ({ ...i, status: 'Confirmado' as const })))).toHaveLength(3);
  });

  it('trata parcela nova como mudança', () => {
    const existing = base();
    const extra = { ...existing[0], id: 'id-novo', number: 4 };
    expect(diffInstallments(existing, [...existing, extra])).toEqual([extra]);
  });
});
