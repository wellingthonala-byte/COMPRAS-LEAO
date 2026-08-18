/* ====================================================================
   Controle Financeiro Futuro — tipos

   O compromisso financeiro nasce na APROVAÇÃO DE VALOR do gestor, não
   quando a compra acontece. As parcelas são criadas nesse momento com
   status "Previsto" e só viram "Confirmado" quando o card entra em
   "Comprado", momento em que a data-base é recalculada pela nota fiscal.
   ==================================================================== */

/** Preset de condição de pagamento escolhido pelo comprador na cotação. */
export type PaymentTermsKind = 'avista' | 'dias' | 'parcelas';

/**
 * Condição de pagamento. Modelada como preset + lista normalizada de dias
 * para que o cálculo nunca dependa de interpretar texto livre.
 *
 * Exemplos:
 *   à vista            → { kind: 'avista',   days: [0] }
 *   30/60/90           → { kind: 'dias',     days: [30, 60, 90] }
 *   3x sem entrada     → { kind: 'parcelas', days: [30, 60, 90], count: 3, intervalDays: 30 }
 *   3x com entrada     → { kind: 'parcelas', days: [0, 30, 60],  count: 3, intervalDays: 30, hasEntry: true }
 */
export interface PaymentTerms {
  kind: PaymentTermsKind;
  /** Dias corridos após a data-base, um por parcela. Ordenado e sem repetição. */
  days: number[];
  /** Guardados apenas para reabrir o preset na tela de edição. */
  count?: number;
  intervalDays?: number;
  hasEntry?: boolean;
}

/** De onde veio a data que originou o parcelamento — essencial para auditoria. */
export type BaseDateSource =
  | 'aprovacao_valor'      // projeção inicial: data em que o gestor aprovou o valor
  | 'nota_fiscal'          // definitiva: data da NF informada pelo comprador
  | 'comprado_provisorio'  // entrou em "Comprado" sem data de NF ainda
  | 'backfill';            // gerada retroativamente pelo script de backfill

export type InstallmentStatus = 'Previsto' | 'Confirmado' | 'Pago' | 'Cancelado';

/** Fotografia da projeção original. Nunca é sobrescrita depois de criada. */
export interface InstallmentOrigin {
  amount: number;
  dueDate: string;
  baseDate: string;
  baseDateSource: BaseDateSource;
  createdAt: string;
}

export interface Installment {
  id: string;
  requestId: string;
  /** 1..count */
  number: number;
  count: number;
  amount: number;
  /** YYYY-MM-DD, já ajustada para dia útil conforme a regra do financeiro. */
  dueDate: string;
  /** Dias corridos após a data-base que geraram esta parcela. */
  offsetDays: number;
  baseDate: string;
  baseDateSource: BaseDateSource;
  status: InstallmentStatus;
  /** Rótulo legível da condição, ex.: "30/60/90". */
  paymentTermsLabel: string;
  origin: InstallmentOrigin;
  paidAt?: string;
  paidAmount?: number;
  cancelledAt?: string;
  /** Preenchido quando o valor comprado divergiu do valor aprovado. */
  divergenceNote?: string;
  /** Motivo do cancelamento (pedido cancelado ou excedente de recálculo). Campo separado de divergenceNote para não apagar a auditoria de valor. */
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
}

/** Registro da segunda aprovação — a que conhece valor e condição. */
export interface ValueApproval {
  approvedBy: string;
  approvalId: string;
  approvedAt: string;
  /** Valor no instante da aprovação. É a referência para detectar divergência. */
  approvedValue: number;
  paymentTermsLabel: string;
}
