import { describe, it, expect } from 'vitest';
import {
  addDays, adjustDueDate, buildHolidaySet, cancelInstallments, chooseConfirmedBaseDate,
  computeInstallments, easterSunday, isBusinessDay, nationalHolidays, previousBusinessDay,
  recalcInstallments, splitAmount, sumAmounts, valueDivergence, weekdayOf,
} from './finance';
import { buildInstallmentTerms, parseCustomDays } from './paymentTerms';
import { Installment, PaymentTerms } from '../types/finance';

const NOW = '2026-08-10T12:00:00.000Z';
const REQ = '11111111-1111-4111-8111-111111111111';

/** ids determinísticos, para os testes poderem comparar objetos inteiros */
function seqIds() {
  let n = 0;
  return () => `id-${++n}`;
}

const AVISTA: PaymentTerms = { kind: 'avista', days: [0] };
const D306090: PaymentTerms = { kind: 'dias', days: [30, 60, 90] };

describe('aritmética de datas', () => {
  it('soma dias sem deslocar por fuso', () => {
    expect(addDays('2026-08-10', 30)).toBe('2026-09-09');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    // ano bissexto
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('identifica o dia da semana', () => {
    expect(weekdayOf('2026-08-10')).toBe(1); // segunda
    expect(weekdayOf('2026-08-15')).toBe(6); // sábado
    expect(weekdayOf('2026-08-16')).toBe(0); // domingo
  });
});

describe('feriados', () => {
  it('calcula a Páscoa corretamente', () => {
    expect(easterSunday(2024)).toBe('2024-03-31');
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    expect(easterSunday(2030)).toBe('2030-04-21');
  });

  it('deriva os feriados móveis da Páscoa', () => {
    const byName = new Map(nationalHolidays(2026).map((h) => [h.name, h.date]));
    expect(byName.get('Sexta-feira Santa')).toBe('2026-04-03');
    expect(byName.get('Carnaval (terça)')).toBe('2026-02-17');
    expect(byName.get('Carnaval (segunda)')).toBe('2026-02-16');
    expect(byName.get('Corpus Christi')).toBe('2026-06-04');
  });

  it('inclui os feriados fixos e os municipais informados', () => {
    const set = buildHolidaySet(2026, 2026, ['2026-08-24']);
    expect(set.has('2026-12-25')).toBe(true);
    expect(set.has('2026-11-20')).toBe(true); // Consciência Negra
    expect(set.has('2026-08-24')).toBe(true); // municipal
    expect(set.has('2026-08-25')).toBe(false);
  });

  it('ignora data municipal inválida sem quebrar', () => {
    const set = buildHolidaySet(2026, 2026, ['', 'xx', '2026-02-30']);
    expect(set.has('2026-02-30')).toBe(false);
    expect(set.has('2026-01-01')).toBe(true);
  });
});

describe('regra de vencimento: antecipa para o dia útil anterior', () => {
  const holidays = buildHolidaySet(2026, 2027);

  it('antecipa sábado para sexta', () => {
    expect(weekdayOf('2026-08-15')).toBe(6);
    expect(adjustDueDate('2026-08-15', '2026-07-01', holidays)).toBe('2026-08-14');
  });

  it('antecipa domingo para sexta', () => {
    expect(adjustDueDate('2026-08-16', '2026-07-01', holidays)).toBe('2026-08-14');
  });

  it('antecipa feriado para o dia útil anterior', () => {
    // 25/12/2026 é sexta-feira
    expect(adjustDueDate('2026-12-25', '2026-10-01', holidays)).toBe('2026-12-24');
  });

  it('pula a corrente feriado + fim de semana', () => {
    // 01/01/2027 é sexta: antecipar cai em 31/12/2026 (quinta), dia útil
    expect(adjustDueDate('2027-01-01', '2026-11-01', holidays)).toBe('2026-12-31');
    // Natal 2027 é sábado: antecipa para sexta 24/12, que não é feriado nacional
    expect(adjustDueDate('2027-12-25', '2027-10-01', holidays)).toBe('2027-12-24');
  });

  it('não antecipa dia útil', () => {
    expect(adjustDueDate('2026-08-13', '2026-07-01', holidays)).toBe('2026-08-13');
  });

  it('empurra para frente quando antecipar cairia antes da data-base', () => {
    // à vista com NF emitida num sábado: não pode vencer na sexta anterior à nota
    const base = '2026-08-15'; // sábado
    expect(adjustDueDate(base, base, holidays)).toBe('2026-08-17'); // segunda
  });

  it('previousBusinessDay atravessa emendas longas', () => {
    // 20/11/2026 (Consciência Negra) é sexta → anterior útil é quinta 19
    expect(previousBusinessDay('2026-11-21', holidays)).toBe('2026-11-19');
    expect(isBusinessDay('2026-11-20', holidays)).toBe(false);
  });
});

describe('rateio de valor', () => {
  it('divide valor exato', () => {
    expect(splitAmount(9000, 3)).toEqual([3000, 3000, 3000]);
  });

  it('joga a dízima nas últimas parcelas sem perder centavo', () => {
    const parts = splitAmount(100, 3);
    expect(parts).toEqual([33.33, 33.33, 33.34]);
    expect(sumAmounts(parts)).toBe(100);
  });

  it('mantém a soma exata em dízimas difíceis', () => {
    for (const [total, n] of [[10, 3], [0.05, 3], [1234.57, 7], [999.99, 6], [0.01, 2]] as const) {
      const parts = splitAmount(total, n);
      expect(parts).toHaveLength(n);
      expect(sumAmounts(parts)).toBeCloseTo(total, 2);
    }
  });

  it('trata parcela única e entradas degeneradas', () => {
    expect(splitAmount(110, 1)).toEqual([110]);
    expect(splitAmount(100, 0)).toEqual([]);
    expect(splitAmount(-50, 2)).toEqual([0, 0]);
  });
});

describe('computeInstallments', () => {
  const holidays = buildHolidaySet(2026, 2028);

  it('à vista gera uma parcela no próprio dia', () => {
    const out = computeInstallments({
      requestId: REQ, total: 110, terms: AVISTA, baseDate: '2026-08-10',
      baseDateSource: 'aprovacao_valor', holidays, now: NOW, idFactory: seqIds(),
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      number: 1, count: 1, amount: 110, dueDate: '2026-08-10',
      offsetDays: 0, status: 'Previsto', paymentTermsLabel: 'À vista',
    });
  });

  it('30/60/90 de R$ 9.000 gera 3 parcelas de R$ 3.000', () => {
    const out = computeInstallments({
      requestId: REQ, total: 9000, terms: D306090, baseDate: '2026-08-10',
      baseDateSource: 'aprovacao_valor', holidays, now: NOW, idFactory: seqIds(),
    });
    expect(out.map((i) => i.amount)).toEqual([3000, 3000, 3000]);
    // D+90 cai em 08/11/2026, um domingo, e antecipa para sexta 06/11
    expect(out.map((i) => i.dueDate)).toEqual(['2026-09-09', '2026-10-09', '2026-11-06']);
    expect(addDays('2026-08-10', 90)).toBe('2026-11-08');
    expect(weekdayOf('2026-11-08')).toBe(0);
    expect(out.map((i) => i.offsetDays)).toEqual([30, 60, 90]);
    expect(out.every((i) => i.count === 3)).toBe(true);
    expect(sumAmounts(out.map((i) => i.amount))).toBe(9000);
  });

  it('aplica a antecipação de fim de semana nos vencimentos gerados', () => {
    // base 2026-07-16 → D+30 = 2026-08-15, um sábado
    const out = computeInstallments({
      requestId: REQ, total: 300, terms: { kind: 'dias', days: [30] },
      baseDate: '2026-07-16', baseDateSource: 'aprovacao_valor',
      holidays, now: NOW, idFactory: seqIds(),
    });
    expect(out[0].dueDate).toBe('2026-08-14');
  });

  it('congela a projeção original em origin', () => {
    const out = computeInstallments({
      requestId: REQ, total: 9000, terms: D306090, baseDate: '2026-08-10',
      baseDateSource: 'aprovacao_valor', holidays, now: NOW, idFactory: seqIds(),
    });
    expect(out[0].origin).toEqual({
      amount: 3000, dueDate: '2026-09-09', baseDate: '2026-08-10',
      baseDateSource: 'aprovacao_valor', createdAt: NOW,
    });
  });

  it('parcelamento com dízima soma o total', () => {
    const out = computeInstallments({
      requestId: REQ, total: 1000, terms: buildInstallmentTerms(3, 30, false),
      baseDate: '2026-08-10', baseDateSource: 'aprovacao_valor',
      holidays, now: NOW, idFactory: seqIds(),
    });
    expect(out.map((i) => i.amount)).toEqual([333.33, 333.33, 333.34]);
    expect(sumAmounts(out.map((i) => i.amount))).toBe(1000);
  });

  it('parcelamento com entrada vence a primeira em D+0', () => {
    const out = computeInstallments({
      requestId: REQ, total: 900, terms: buildInstallmentTerms(3, 30, true),
      baseDate: '2026-08-10', baseDateSource: 'aprovacao_valor',
      holidays, now: NOW, idFactory: seqIds(),
    });
    expect(out.map((i) => i.offsetDays)).toEqual([0, 30, 60]);
    expect(out[0].dueDate).toBe('2026-08-10');
  });

  it('condição personalizada respeita os dias digitados', () => {
    const terms = parseCustomDays('30/45/75')!;
    const out = computeInstallments({
      requestId: REQ, total: 300, terms, baseDate: '2026-08-10',
      baseDateSource: 'aprovacao_valor', holidays, now: NOW, idFactory: seqIds(),
    });
    expect(out.map((i) => i.offsetDays)).toEqual([30, 45, 75]);
  });

  it('devolve vazio para condição vazia ou data-base inválida', () => {
    const base = {
      requestId: REQ, total: 100, baseDateSource: 'aprovacao_valor' as const,
      holidays, now: NOW, idFactory: seqIds(),
    };
    expect(computeInstallments({ ...base, terms: { kind: 'dias', days: [] }, baseDate: '2026-08-10' })).toEqual([]);
    expect(computeInstallments({ ...base, terms: D306090, baseDate: 'não é data' })).toEqual([]);
  });
});

describe('recalcInstallments — data-base pela nota fiscal', () => {
  const holidays = buildHolidaySet(2026, 2028);

  const original = () => computeInstallments({
    requestId: REQ, total: 9000, terms: D306090, baseDate: '2026-08-10',
    baseDateSource: 'aprovacao_valor', holidays, now: NOW, idFactory: seqIds(),
  });

  it('recalcula os vencimentos pela NF e vira Confirmado, preservando origin', () => {
    const before = original();
    const after = recalcInstallments({
      existing: before, requestId: REQ, total: 9000, terms: D306090,
      baseDate: '2026-09-01', baseDateSource: 'nota_fiscal', status: 'Confirmado',
      holidays, now: '2026-09-01T10:00:00.000Z',
    });

    expect(after.map((i) => i.dueDate)).toEqual(['2026-10-01', '2026-10-30', '2026-11-30']);
    expect(after.every((i) => i.status === 'Confirmado')).toBe(true);
    expect(after.every((i) => i.baseDateSource === 'nota_fiscal')).toBe(true);
    // auditoria: a projeção original continua intacta
    expect(after.map((i) => i.origin.dueDate)).toEqual(['2026-09-09', '2026-10-09', '2026-11-06']);
    expect(after.every((i) => i.origin.baseDateSource === 'aprovacao_valor')).toBe(true);
    // e os ids não mudaram
    expect(after.map((i) => i.id)).toEqual(before.map((i) => i.id));
  });

  it('divergência de valor redistribui as parcelas e registra a nota', () => {
    const before = original();
    const d = valueDivergence(9000, 9600);
    expect(d.hasDivergence).toBe(true);
    expect(d.amount).toBe(600);

    const after = recalcInstallments({
      existing: before, requestId: REQ, total: 9600, terms: D306090,
      baseDate: '2026-08-10', baseDateSource: 'nota_fiscal', status: 'Confirmado',
      holidays, now: NOW, divergenceNote: 'divergiu',
    });
    expect(after.map((i) => i.amount)).toEqual([3200, 3200, 3200]);
    expect(after.every((i) => i.divergenceNote === 'divergiu')).toBe(true);
    // o valor original de cada parcela segue registrado
    expect(after.map((i) => i.origin.amount)).toEqual([3000, 3000, 3000]);
  });

  it('congela parcela paga e redistribui o restante', () => {
    const before = original();
    const paid: Installment[] = [
      { ...before[0], status: 'Pago', paidAt: NOW, paidAmount: 3000 },
      before[1], before[2],
    ];
    const after = recalcInstallments({
      existing: paid, requestId: REQ, total: 9600, terms: D306090,
      baseDate: '2026-08-10', baseDateSource: 'nota_fiscal', status: 'Confirmado',
      holidays, now: NOW,
    });
    expect(after[0].status).toBe('Pago');
    expect(after[0].amount).toBe(3000);
    // 9600 - 3000 = 6600 divididos em duas
    expect(after.slice(1).map((i) => i.amount)).toEqual([3300, 3300]);
    expect(sumAmounts(after.map((i) => i.amount))).toBe(9600);
  });

  it('cancela as excedentes quando a condição encurta, sem apagar', () => {
    const before = original();
    const after = recalcInstallments({
      existing: before, requestId: REQ, total: 9000, terms: { kind: 'dias', days: [30] },
      baseDate: '2026-08-10', baseDateSource: 'nota_fiscal', status: 'Confirmado',
      holidays, now: NOW,
    });
    expect(after).toHaveLength(3);
    expect(after[0]).toMatchObject({ number: 1, amount: 9000, status: 'Confirmado', count: 1 });
    expect(after.slice(1).every((i) => i.status === 'Cancelado')).toBe(true);
    expect(after[1].cancelledAt).toBe(NOW);
    expect(after[1].divergenceNote).toContain('3x para 1x');
  });

  it('cria as novas quando a condição alonga', () => {
    const before = original();
    const after = recalcInstallments({
      existing: before, requestId: REQ, total: 12000, terms: { kind: 'dias', days: [30, 60, 90, 120] },
      baseDate: '2026-08-10', baseDateSource: 'nota_fiscal', status: 'Confirmado',
      holidays, now: NOW, idFactory: () => 'novo-id',
    });
    expect(after).toHaveLength(4);
    expect(after.map((i) => i.amount)).toEqual([3000, 3000, 3000, 3000]);
    expect(after[3].id).toBe('novo-id');
    // a 4ª nasceu agora, então a origem dela é a data da NF
    expect(after[3].origin.baseDateSource).toBe('nota_fiscal');
    expect(after.every((i) => i.count === 4)).toBe(true);
  });

  it('não altera nada com condição vazia', () => {
    const before = original();
    const after = recalcInstallments({
      existing: before, requestId: REQ, total: 9000, terms: { kind: 'dias', days: [] },
      baseDate: '2026-09-01', baseDateSource: 'nota_fiscal', status: 'Confirmado',
      holidays, now: NOW,
    });
    expect(after).toEqual(before);
  });
});

describe('cancelamento', () => {
  const holidays = buildHolidaySet(2026, 2028);

  it('cancela as em aberto e mantém as pagas', () => {
    const base = computeInstallments({
      requestId: REQ, total: 9000, terms: D306090, baseDate: '2026-08-10',
      baseDateSource: 'aprovacao_valor', holidays, now: NOW, idFactory: seqIds(),
    });
    const withPaid: Installment[] = [{ ...base[0], status: 'Pago' }, base[1], base[2]];
    const out = cancelInstallments(withPaid, NOW, 'pedido cancelado');

    expect(out[0].status).toBe('Pago');
    expect(out.slice(1).every((i) => i.status === 'Cancelado')).toBe(true);
    expect(out[1].divergenceNote).toBe('pedido cancelado');
    expect(out[1].cancelledAt).toBe(NOW);
  });
});

describe('escolha da data-base ao confirmar', () => {
  it('usa a data da nota fiscal quando existe', () => {
    expect(chooseConfirmedBaseDate('2026-09-01', '2026-08-20T10:00:00Z')).toEqual({
      baseDate: '2026-09-01', source: 'nota_fiscal', provisional: false,
    });
  });

  it('cai para a data de entrada em Comprado como provisória', () => {
    expect(chooseConfirmedBaseDate(undefined, '2026-08-20T10:00:00Z')).toEqual({
      baseDate: '2026-08-20', source: 'comprado_provisorio', provisional: true,
    });
    expect(chooseConfirmedBaseDate('', '2026-08-20T10:00:00Z').provisional).toBe(true);
  });
});

describe('divergência de valor', () => {
  it('ignora diferença de arredondamento', () => {
    expect(valueDivergence(100, 100.01).hasDivergence).toBe(false);
    expect(valueDivergence(100, 100.02).hasDivergence).toBe(true);
  });

  it('calcula sinal e percentual', () => {
    const menor = valueDivergence(1000, 900);
    expect(menor.amount).toBe(-100);
    expect(menor.percent).toBe(-10);

    const maior = valueDivergence(1000, 1250);
    expect(maior.amount).toBe(250);
    expect(maior.percent).toBe(25);
  });

  it('não divide por zero quando não há valor aprovado', () => {
    const d = valueDivergence(undefined, 500);
    expect(d.percent).toBe(0);
    expect(d.hasDivergence).toBe(true);
  });
});
