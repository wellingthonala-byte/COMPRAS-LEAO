import { getSupabase } from './supabase';
import { PurchaseRequest, Status, Priority, Sector, Item, HistoryEntry } from '../types';
import { ServiceOrder, OSStatus, formatOSNumber } from '../types/serviceOrders';
import { BaseDateSource, Installment, InstallmentStatus } from '../types/finance';
import { AppUser, Role } from '../data/users';

/* ================================================================== */
/* Mapeamentos enum (banco) ⇄ rótulos (front)                          */
/* ================================================================== */
const STATUS_DB_TO_UI: Record<string, Status> = {
  nova_solicitacao: 'Nova Solicitação',
  em_aprovacao: 'Em Aprovação',
  em_cotacao: 'Em Cotação',
  comprado: 'Comprado',
  em_rota: 'Em Rota',
  em_servico: 'Em Serviço',
  disponivel: 'Disponível para Retirada',
  finalizado: 'Finalizado',
  cancelada: 'Cancelada',
};
const STATUS_UI_TO_DB = Object.fromEntries(Object.entries(STATUS_DB_TO_UI).map(([k, v]) => [v, k]));

const PRIORITY_DB_TO_UI: Record<string, Priority> = {
  maquina_parada: 'Máquina Parada',
  emergencia: 'Urgente',
  nao_urgente: 'Não Urgente',
};
const PRIORITY_UI_TO_DB = Object.fromEntries(Object.entries(PRIORITY_DB_TO_UI).map(([k, v]) => [v, k]));

const OS_STATUS_DB_TO_UI: Record<string, OSStatus> = {
  aberta: 'Aberta',
  aguardando_aprovacao: 'Aguardando Aprovação',
  programada: 'Programada',
  em_execucao: 'Em Execução',
  pausada: 'Pausada',
  concluida: 'Finalizada',
  faturada: 'Faturada',
  cancelada: 'Cancelada',
};
const OS_STATUS_UI_TO_DB = Object.fromEntries(Object.entries(OS_STATUS_DB_TO_UI).map(([k, v]) => [v, k]));

function displayNumber(requestNumber: number, createdAt: string): string {
  const d = new Date(createdAt);
  return `#${String(requestNumber).padStart(3, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
}

/* ================================================================== */
/* Solicitações: linhas do banco → PurchaseRequest                      */
/* ================================================================== */
interface DBRequestRow {
  id: string; request_number: number; requester_id: string; sector: string;
  priority: string; status: string; observations: string | null;
  expected_delivery_date: string | null; actual_delivery_date: string | null;
  created_at: string; extra: Record<string, unknown> | null;
  request_items: DBItemRow[];
  suppliers: DBSupplierRow[] | DBSupplierRow | null;
  status_history: DBHistoryRow[];
}
interface DBItemRow {
  id: string; item_number: number; description: string; quantity: number;
  application: string | null; observations: string | null; technical_spec: string | null;
  priority: string | null; expected_delivery_date: string | null;
  has_objection: boolean | null; objection_notes: string | null;
}
interface DBSupplierRow { name: string; value: number | null; order_number: string | null; invoice_number: string | null }
interface DBHistoryRow { id: string; status: string; user_name: string; notes: string | null; created_at: string }

function rowToRequest(row: DBRequestRow, profileNames: Map<string, string>): PurchaseRequest {
  // Registros criados pelo Compras Leão carregam o documento completo em `extra`
  if (row.extra && (row.extra as { doc?: PurchaseRequest }).doc) {
    const doc = (row.extra as { doc: PurchaseRequest }).doc;
    // O número exibido vem sempre de request_number (sequência atômica do
    // banco), nunca do palpite calculado no navegador de quem criou — dois
    // usuários criando ao mesmo tempo podem ter adivinhado o mesmo número
    // localmente, mas o request_number gravado é sempre único.
    return { ...doc, id: row.id, number: displayNumber(row.request_number, row.created_at) };
  }
  // Registros importados do sistema antigo: compõe a partir das tabelas normalizadas
  const requester = profileNames.get(row.requester_id) ?? 'Usuário';
  const supplier = Array.isArray(row.suppliers) ? row.suppliers[0] : row.suppliers;
  const items: Item[] = [...(row.request_items ?? [])]
    .sort((a, b) => a.item_number - b.item_number)
    .map((it) => ({
      id: it.id,
      description: it.description,
      quantity: it.quantity,
      application: it.application ?? '',
      priority: PRIORITY_DB_TO_UI[it.priority ?? 'nao_urgente'] ?? 'Não Urgente',
      // Sem previsão de entrega no sistema antigo → fica vazio (mostra "—"),
      // nunca a data de criação. Copiar createdAt daria uma previsão falsa.
      deliveryForecast: it.expected_delivery_date ?? row.expected_delivery_date ?? '',
      technicalSpec: it.technical_spec ?? undefined,
      observations: it.observations ?? undefined,
      objections: it.has_objection && it.objection_notes
        ? [{ id: `obj-${it.id}`, date: row.created_at, user: requester, text: it.objection_notes, resolved: false }]
        : undefined,
    }));
  const history: HistoryEntry[] = [...(row.status_history ?? [])]
    .sort((a, b) => (a.created_at > b.created_at ? 1 : -1))
    .map((h) => ({
      id: h.id,
      date: h.created_at,
      user: h.user_name,
      action: h.notes || 'Status alterado',
      to: STATUS_DB_TO_UI[h.status],
    }));
  return {
    id: row.id,
    number: displayNumber(row.request_number, row.created_at),
    requester,
    requesterInitials: requester.trim().slice(0, 2).toUpperCase(),
    sector: (row.sector as Sector) || 'Produção',
    priority: PRIORITY_DB_TO_UI[row.priority] ?? 'Não Urgente',
    status: STATUS_DB_TO_UI[row.status] ?? 'Em Cotação',
    createdAt: row.created_at,
    deliveryForecast: row.expected_delivery_date ?? '',
    realDeliveryDate: row.actual_delivery_date ?? undefined,
    supplier: supplier?.name,
    value: supplier?.value ?? undefined,
    orderNumber: supplier?.order_number ?? undefined,
    fiscalNote: supplier?.invoice_number ?? undefined,
    items: items.length ? items : [{ id: `i-${row.id}`, description: '(sem itens)', quantity: 1, application: '', priority: 'Não Urgente', deliveryForecast: row.expected_delivery_date ?? '' }],
    observations: row.observations ?? undefined,
    history: history.length ? history : [{ id: `h-${row.id}`, date: row.created_at, user: requester, action: 'Solicitação criada', to: STATUS_DB_TO_UI[row.status] }],
  };
}

const PAGE_SIZE = 1000;

/** Corta consultas penduradas: se o servidor não responder em 15s, cai no modo offline */
function withTimeout<T>(p: Promise<T>, ms = 15000): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/** Busca todas as páginas de uma consulta (o Supabase limita a 1000 por vez) */
async function fetchAllPages<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return all;
}

export async function fetchRequests(): Promise<PurchaseRequest[] | null> {
  try {
    const sb = getSupabase();
    const [rows, profiles] = await withTimeout(Promise.all([
      fetchAllPages<DBRequestRow>((from, to) =>
        sb.from('purchase_requests')
          .select('*, request_items(*), suppliers(*), status_history(*)')
          .order('created_at', { ascending: false })
          .range(from, to)),
      fetchAllPages<{ id: string; full_name: string }>((from, to) =>
        sb.from('profiles').select('id, full_name').range(from, to)),
    ]));
    const names = new Map<string, string>(profiles.map((p) => [p.id, p.full_name]));
    return rows.map((r) => rowToRequest(r, names));
  } catch (e) {
    console.warn('[backend] fetchRequests falhou — usando dados locais:', e);
    return null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Grava/atualiza uma solicitação: colunas principais + documento completo em extra.doc.
 *
 * request_number nunca é calculado aqui: para registros novos o banco atribui
 * o valor sozinho (coluna com default nextval de uma sequência), o que evita
 * a colisão de dois navegadores calculando "max+1" ao mesmo tempo. Para
 * registros existentes, omitir a coluna simplesmente preserva o valor atual.
 *
 * Lança em caso de falha — ao contrário da versão antiga, que só logava e
 * deixava o chamador acreditar que os dados chegaram ao servidor. Quem chama
 * precisa saber do erro para enfileirar o reprocessamento.
 */
export async function upsertRequests(reqs: PurchaseRequest[], requesterId?: string): Promise<void> {
  // Dados de teste locais (ids não-UUID) não sincronizam — ficam só no navegador
  const requests = reqs.filter((r) => UUID_RE.test(r.id));
  if (requests.length === 0) return;
  const sb = getSupabase();
  const uid = requesterId ?? (await sb.auth.getUser()).data.user?.id;
  if (!uid) throw new Error('Usuário não autenticado');
  const payload = requests.map((r) => ({
    id: r.id,
    requester_id: uid,
    sector: r.sector,
    priority: PRIORITY_UI_TO_DB[r.priority] ?? 'nao_urgente',
    status: STATUS_UI_TO_DB[r.status] ?? 'em_cotacao',
    observations: r.observations ?? null,
    expected_delivery_date: r.deliveryForecast || null,
    actual_delivery_date: r.realDeliveryDate ?? null,
    created_at: r.createdAt,
    updated_at: new Date().toISOString(),
    extra: { doc: r },
  }));
  const { error } = await sb.from('purchase_requests').upsert(payload);
  if (error) throw error;
}

/**
 * Grava entradas do histórico na tabela relacional status_history.
 *
 * O histórico completo já vive em extra.doc.history (é o que o app lê), mas
 * a tabela normalizada existe no schema justamente para relatórios/consultas
 * feitos direto no banco — sem esta chamada ela ficava sempre vazia. Requer
 * que a solicitação já exista em purchase_requests (chamar depois do
 * upsertRequests correspondente). Best-effort: nunca lança, uma falha aqui
 * não pode acompanhar o histórico já gravado como "não aconteceu".
 */
export async function insertStatusHistory(
  requestId: string,
  userId: string,
  entries: HistoryEntry[],
  fallbackStatus: Status,
): Promise<void> {
  if (!UUID_RE.test(requestId) || entries.length === 0) return;
  try {
    const sb = getSupabase();
    const rows = entries.map((e) => ({
      request_id: requestId,
      status: STATUS_UI_TO_DB[e.to ?? fallbackStatus] ?? 'em_cotacao',
      user_id: userId,
      user_name: e.user,
      notes: e.action,
      created_at: e.date,
    }));
    const { error } = await sb.from('status_history').insert(rows);
    if (error) throw error;
  } catch (e) {
    console.warn('[backend] insertStatusHistory falhou (histórico segue disponível em extra.doc):', e);
  }
}

/* ================================================================== */
/* Ordens de Serviço                                                    */
/* ================================================================== */
interface DBOsRow {
  id: string; order_number: number; requester_id: string; service_type: string;
  service_type_other: string | null; description: string; provider_name: string;
  sector: string; priority: string; agreed_value: number | null; paid_value: number | null;
  payment_status: string; service_date: string | null; execution_deadline: string | null;
  status: string; observations: string | null; created_at: string;
  closing_date: string | null; extra: Record<string, unknown> | null;
}

const SERVICE_TYPE_LABEL: Record<string, string> = {
  motoboy: 'Motoboy', frete: 'Frete', manutencao: 'Manutenção', servico_interno: 'Serviço Interno', outro: 'Outro',
};

function rowToOrder(row: DBOsRow, profileNames: Map<string, string>): ServiceOrder {
  if (row.extra && (row.extra as { doc?: ServiceOrder }).doc) {
    const doc = (row.extra as { doc: ServiceOrder }).doc;
    return {
      ...doc,
      id: row.id,
      number: formatOSNumber(row.order_number, row.created_at),
    };
  }
  const requester = profileNames.get(row.requester_id) ?? 'Usuário';
  return {
    id: row.id,
    number: formatOSNumber(row.order_number, row.created_at),
    title: row.description?.split('\n')[0]?.slice(0, 80) || `${SERVICE_TYPE_LABEL[row.service_type] ?? 'Serviço'} — ${row.provider_name || 'sem prestador'}`,
    description: row.description ?? '',
    type: row.service_type === 'manutencao' ? 'Corretiva' : 'Melhoria',
    category: SERVICE_TYPE_LABEL[row.service_type] === 'Outro' && row.service_type_other ? row.service_type_other : SERVICE_TYPE_LABEL[row.service_type] ?? 'Outros',
    customer: undefined,
    equipment: { code: '', name: row.provider_name || '—', location: row.sector },
    costCenter: row.sector || 'Manutenção',
    requester,
    technician: row.provider_name ?? '',
    priority: row.priority === 'maquina_parada' ? 'Crítica' : row.priority === 'emergencia' ? 'Alta' : 'Média',
    slaHours: 48,
    estimatedValue: row.agreed_value ?? undefined,
    openedAt: row.created_at,
    dueDate: row.execution_deadline ?? row.service_date ?? row.created_at.slice(0, 10),
    completedAt: row.closing_date ?? undefined,
    status: OS_STATUS_DB_TO_UI[row.status] ?? 'Aberta',
    observations: [row.observations, row.paid_value ? `Valor pago: R$ ${row.paid_value} (${row.payment_status})` : null].filter(Boolean).join(' · ') || undefined,
    materials: [], labor: [], comments: [], checklist: [],
    history: [{ id: `h-${row.id}`, date: row.created_at, user: requester, action: 'O.S. criada (importada do sistema anterior)', to: OS_STATUS_DB_TO_UI[row.status] }],
    // Preserva os valores originais das colunas normalizadas que o front não
    // edita — ver FINDING 23. upsertServiceOrders reenvia estes valores em
    // vez de service_type fixo / payment_status derivado do status da O.S.
    importedMeta: {
      serviceType: row.service_type,
      paymentStatus: row.payment_status,
      paidValue: row.paid_value,
      executionDeadline: row.execution_deadline,
    },
  };
}

export async function fetchServiceOrders(): Promise<ServiceOrder[] | null> {
  try {
    const sb = getSupabase();
    const [rows, profiles] = await withTimeout(Promise.all([
      fetchAllPages<DBOsRow>((from, to) =>
        sb.from('service_orders').select('*').order('created_at', { ascending: false }).range(from, to)),
      fetchAllPages<{ id: string; full_name: string }>((from, to) =>
        sb.from('profiles').select('id, full_name').range(from, to)),
    ]));
    const names = new Map<string, string>(profiles.map((p) => [p.id, p.full_name]));
    return rows.map((r) => rowToOrder(r, names));
  } catch (e) {
    console.warn('[backend] fetchServiceOrders falhou — usando dados locais:', e);
    return null;
  }
}

/**
 * Grava/atualiza ordens de serviço: colunas principais + documento completo
 * em extra.doc. Mesmo padrão de upsertRequests (ver comentário lá): lança em
 * caso de falha — quem chama (serviceOrderSyncQueue) precisa saber do erro
 * para enfileirar o reprocessamento, em vez de engolir em console.warn e
 * deixar o módulo parar de salvar em silêncio (FINDING 19).
 *
 * Devolve o número definitivo (order_number, atribuído pela sequência do
 * banco) de cada O.S. sincronizada, para resolver o rótulo provisório
 * exibido enquanto o insert não tinha retornado (FINDING 20).
 */
export async function upsertServiceOrders(
  allOrders: ServiceOrder[],
  requesterId?: string,
): Promise<{ id: string; number: string }[]> {
  const orders = allOrders.filter((o) => UUID_RE.test(o.id));
  if (orders.length === 0) return [];
  const sb = getSupabase();
  const uid = requesterId ?? (await sb.auth.getUser()).data.user?.id;
  if (!uid) throw new Error('Usuário não autenticado');
  const payload = orders.map((o) => {
    // Ordens importadas do sistema antigo trazem os valores originais das
    // colunas que o front não modela em importedMeta — reenvia-los em vez de
    // sobrescrever com o fixo/derivado do app (FINDING 23).
    const meta = o.importedMeta;
    return {
      id: o.id,
      requester_id: uid,
      service_type: meta?.serviceType ?? 'manutencao',
      description: o.description || o.title,
      provider_name: o.technician || '',
      sector: o.costCenter,
      priority: o.priority === 'Crítica' ? 'maquina_parada' : o.priority === 'Alta' ? 'emergencia' : 'nao_urgente',
      agreed_value: o.estimatedValue ?? null,
      payment_status: meta?.paymentStatus ?? (o.status === 'Faturada' ? 'pago' : 'pendente'),
      paid_value: meta?.paidValue ?? null,
      execution_deadline: meta ? (meta.executionDeadline ?? null) : (o.dueDate || null),
      status: OS_STATUS_UI_TO_DB[o.status] ?? 'aberta',
      observations: o.observations ?? null,
      created_at: o.openedAt,
      closing_date: o.completedAt ?? null,
      updated_at: new Date().toISOString(),
      extra: { doc: o },
    };
  });
  const { data, error } = await sb.from('service_orders').upsert(payload).select('id, order_number, created_at');
  if (error) throw error;
  return (data ?? []).map((r: { id: string; order_number: number; created_at: string }) => ({
    id: r.id,
    number: formatOSNumber(r.order_number, r.created_at),
  }));
}

/* ================================================================== */
/* Parcelas previstas (módulo de Controle Financeiro Futuro)            */
/* ================================================================== */
const INSTALLMENT_STATUS_DB_TO_UI: Record<string, InstallmentStatus> = {
  previsto: 'Previsto', confirmado: 'Confirmado', pago: 'Pago', cancelado: 'Cancelado',
};
const INSTALLMENT_STATUS_UI_TO_DB = Object.fromEntries(
  Object.entries(INSTALLMENT_STATUS_DB_TO_UI).map(([k, v]) => [v, k])
);

interface DBInstallmentRow {
  id: string; request_id: string; installment_number: number; installment_count: number;
  amount: number | string; due_date: string; offset_days: number;
  base_date: string; base_date_source: string; status: string; payment_terms_label: string | null;
  origin_amount: number | string; origin_due_date: string; origin_base_date: string;
  origin_base_date_source: string; origin_created_at: string;
  paid_at: string | null; paid_amount: number | string | null; cancelled_at: string | null;
  divergence_note: string | null; created_at: string; updated_at: string;
}

/** numeric do Postgres chega como string no supabase-js */
const num = (v: number | string | null | undefined): number => (v === null || v === undefined ? 0 : Number(v));

function rowToInstallment(row: DBInstallmentRow): Installment {
  return {
    id: row.id,
    requestId: row.request_id,
    number: row.installment_number,
    count: row.installment_count,
    amount: num(row.amount),
    dueDate: row.due_date,
    offsetDays: row.offset_days,
    baseDate: row.base_date,
    baseDateSource: row.base_date_source as BaseDateSource,
    status: INSTALLMENT_STATUS_DB_TO_UI[row.status] ?? 'Previsto',
    paymentTermsLabel: row.payment_terms_label ?? '',
    origin: {
      amount: num(row.origin_amount),
      dueDate: row.origin_due_date,
      baseDate: row.origin_base_date,
      baseDateSource: row.origin_base_date_source as BaseDateSource,
      createdAt: row.origin_created_at,
    },
    paidAt: row.paid_at ?? undefined,
    paidAmount: row.paid_amount === null ? undefined : num(row.paid_amount),
    cancelledAt: row.cancelled_at ?? undefined,
    divergenceNote: row.divergence_note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function installmentToRow(i: Installment): Record<string, unknown> {
  return {
    id: i.id,
    request_id: i.requestId,
    installment_number: i.number,
    installment_count: i.count,
    amount: i.amount,
    due_date: i.dueDate,
    offset_days: i.offsetDays,
    base_date: i.baseDate,
    base_date_source: i.baseDateSource,
    status: INSTALLMENT_STATUS_UI_TO_DB[i.status] ?? 'previsto',
    payment_terms_label: i.paymentTermsLabel,
    origin_amount: i.origin.amount,
    origin_due_date: i.origin.dueDate,
    origin_base_date: i.origin.baseDate,
    origin_base_date_source: i.origin.baseDateSource,
    origin_created_at: i.origin.createdAt,
    paid_at: i.paidAt ?? null,
    paid_amount: i.paidAmount ?? null,
    cancelled_at: i.cancelledAt ?? null,
    divergence_note: i.divergenceNote ?? null,
    created_at: i.createdAt,
    updated_at: new Date().toISOString(),
  };
}

/** Retorna null quando o servidor não responde — mesma convenção de fetchRequests. */
export async function fetchInstallments(): Promise<Installment[] | null> {
  try {
    const sb = getSupabase();
    const rows = await withTimeout(fetchAllPages<DBInstallmentRow>((from, to) =>
      sb.from('purchase_installments').select('*').order('due_date', { ascending: true }).range(from, to)));
    return rows.map(rowToInstallment);
  } catch (e) {
    console.warn('[backend] fetchInstallments falhou — usando dados locais:', e);
    return null;
  }
}

/**
 * Grava parcelas. Lança em caso de falha — quem chama precisa saber do erro
 * para enfileirar o reprocessamento (mesmo padrão de upsertRequests).
 */
export async function upsertInstallments(items: Installment[]): Promise<void> {
  // Solicitações de teste locais (id não-UUID) não têm linha no banco
  const valid = items.filter((i) => UUID_RE.test(i.requestId) && UUID_RE.test(i.id));
  if (valid.length === 0) return;
  const sb = getSupabase();
  for (let i = 0; i < valid.length; i += 200) {
    const { error } = await sb
      .from('purchase_installments')
      .upsert(valid.slice(i, i + 200).map(installmentToRow), { onConflict: 'id' });
    if (error) throw error;
  }
}

/* ================================================================== */
/* Autenticação (Supabase Auth + papéis de user_roles)                  */
/* ================================================================== */
export async function loginWithSupabase(email: string, password: string): Promise<AppUser | null> {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;
  const uid = data.user.id;
  const [{ data: profile }, { data: roles }] = await Promise.all([
    sb.from('profiles').select('full_name, sector').eq('id', uid).maybeSingle(),
    sb.from('user_roles').select('role').eq('user_id', uid),
  ]);
  const name = profile?.full_name ?? data.user.email ?? 'Usuário';
  const dbRoles: string[] = (roles ?? []).map((r: { role: string }) => r.role);
  // admin herda a visão do gestor (inclusive a projeção financeira consolidada).
  // 'compras' vem antes de 'financeiro' na precedência: o papel operacional é
  // mais restritivo em capacidades (avançar pedido, cancelar, editar cotação,
  // pular etapa) e não pode ficar sem elas quando alguém acumula os dois
  // papéis — 'financeiro' é só consultivo (FINDING 27). Mitigação pontual:
  // a correção completa exigiria guardar dbRoles: string[] e derivar
  // capacidades da união dos papéis, o que toca comparações `role === 'x'`
  // pelo projeto inteiro — fora do escopo desta correção.
  const role: Role = dbRoles.includes('admin') || dbRoles.includes('gestor') ? 'gestor'
    : dbRoles.includes('compras') ? 'comprador'
    : dbRoles.includes('financeiro') ? 'financeiro' : 'solicitante';
  return {
    id: uid,
    name,
    email: data.user.email ?? undefined,
    password: '',
    role,
    initials: name.trim().slice(0, 2).toUpperCase(),
    active: true,
    lastLogin: new Date().toISOString(),
    authSource: 'supabase',
  };
}

export async function logoutSupabase(): Promise<void> {
  try { await getSupabase().auth.signOut(); } catch { /* ignora */ }
}

/* ================================================================== */
/* Migração (roda no NAVEGADOR): projeto antigo → projeto novo          */
/* ================================================================== */
type LogFn = (msg: string) => void;

async function rest(base: string, key: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init?.method === 'POST' ? { Prefer: 'return=minimal, resolution=merge-duplicates' } : {}),
      ...init?.headers,
    },
  });
}

async function readAll(base: string, key: string, table: string, log: LogFn): Promise<Record<string, unknown>[]> {
  // O Supabase limita cada consulta a 1000 linhas — pagina até o fim
  const PAGE = 1000;
  const all: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await rest(base, key, `/rest/v1/${table}?select=*&order=created_at.asc&limit=${PAGE}&offset=${offset}`);
    if (!res.ok) throw new Error(`Falha ao ler ${table}: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
    const rows: Record<string, unknown>[] = await res.json();
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  log(`Lidos ${all.length} registro(s) de ${table}`);
  return all;
}

async function insertAll(base: string, key: string, table: string, rows: Record<string, unknown>[], log: LogFn): Promise<void> {
  if (rows.length === 0) { log(`${table}: nada a inserir`); return; }
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const res = await rest(base, key, `/rest/v1/${table}?on_conflict=id`, { method: 'POST', body: JSON.stringify(chunk) });
    if (!res.ok) throw new Error(`Falha ao inserir em ${table}: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
  }
  log(`Inseridos ${rows.length} registro(s) em ${table}`);
}

export const MIGRATION_DEFAULT_PASSWORD = 'Leao@2026';

export async function runMigration(oldUrl: string, oldSecret: string, newUrl: string, newSecret: string, log: LogFn): Promise<void> {
  const clean = (u: string) => u.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  const OLD = clean(oldUrl), NEW = clean(newUrl);

  log('— Etapa 1/4: lendo dados do projeto antigo (somente leitura) —');
  const [profiles, userRoles, requests, items, history, suppliers, orders, osHistory] = await Promise.all([
    readAll(OLD, oldSecret, 'profiles', log),
    readAll(OLD, oldSecret, 'user_roles', log),
    readAll(OLD, oldSecret, 'purchase_requests', log),
    readAll(OLD, oldSecret, 'request_items', log),
    readAll(OLD, oldSecret, 'status_history', log),
    readAll(OLD, oldSecret, 'suppliers', log),
    readAll(OLD, oldSecret, 'service_orders', log),
    readAll(OLD, oldSecret, 'service_order_history', log),
  ]);

  log('— Etapa 2/4: recriando usuários no projeto novo —');
  const oldUsersRes = await rest(OLD, oldSecret, '/auth/v1/admin/users?per_page=1000');
  if (!oldUsersRes.ok) throw new Error(`Falha ao listar usuários do projeto antigo: HTTP ${oldUsersRes.status}`);
  const oldUsers: { id: string; email: string }[] = (await oldUsersRes.json()).users ?? [];
  log(`${oldUsers.length} usuário(s) encontrados no projeto antigo`);

  const idMap = new Map<string, string>();
  for (const u of oldUsers) {
    if (!u.email) continue;
    const createRes = await rest(NEW, newSecret, '/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email: u.email, password: MIGRATION_DEFAULT_PASSWORD, email_confirm: true }),
    });
    if (createRes.ok) {
      const created = await createRes.json();
      idMap.set(u.id, created.id);
      log(`Usuário criado: ${u.email}`);
    } else {
      // provavelmente já existe (migração re-executada): busca o id pelo e-mail
      const listRes = await rest(NEW, newSecret, `/auth/v1/admin/users?per_page=1000`);
      const list: { id: string; email: string }[] = (await listRes.json()).users ?? [];
      const found = list.find((x) => x.email === u.email);
      if (found) { idMap.set(u.id, found.id); log(`Usuário já existia: ${u.email}`); }
      else log(`⚠ Não foi possível criar ${u.email}: ${(await createRes.text()).slice(0, 150)}`);
    }
  }
  const remap = (id: unknown): string | null => (id ? idMap.get(String(id)) ?? null : null);
  const fallbackUid = idMap.values().next().value as string | undefined;

  log('— Etapa 3/4: copiando perfis e papéis —');
  await insertAll(NEW, newSecret, 'profiles', profiles
    .filter((p) => remap(p.id))
    .map((p) => ({ ...p, id: remap(p.id) })), log);
  await insertAll(NEW, newSecret, 'user_roles', userRoles
    .filter((r) => remap(r.user_id))
    .map((r) => ({ ...r, user_id: remap(r.user_id) })), log);

  log('— Etapa 4/4: copiando solicitações, itens, fornecedores, históricos e O.S. —');
  await insertAll(NEW, newSecret, 'purchase_requests', requests.map((r) => ({
    ...r,
    requester_id: remap(r.requester_id) ?? fallbackUid,
    closing_user_id: remap(r.closing_user_id),
  })), log);
  await insertAll(NEW, newSecret, 'request_items', items, log);
  await insertAll(NEW, newSecret, 'status_history', history.map((h) => ({
    ...h,
    user_id: remap(h.user_id) ?? fallbackUid,
  })), log);
  await insertAll(NEW, newSecret, 'suppliers', suppliers, log);
  await insertAll(NEW, newSecret, 'service_orders', orders.map((o) => ({
    ...o,
    requester_id: remap(o.requester_id) ?? fallbackUid,
    closing_user_id: remap(o.closing_user_id),
  })), log);
  await insertAll(NEW, newSecret, 'service_order_history', osHistory.map((h) => ({
    ...h,
    user_id: remap(h.user_id) ?? fallbackUid,
  })), log);

  // ⚠️ FINDING 16: as linhas acima preservam request_number/order_number
  // originais (1..N) via spread, mas em nenhum momento avançamos as
  // sequências que geram esses números para registros NOVOS
  // (public.purchase_requests_request_number_seq /
  // public.service_orders_order_number_seq — default nextval, coluna
  // unique). Sem avançar, as sequências continuam em 1 e a primeira
  // solicitação/O.S. criada depois da migração colide em unique constraint.
  // Este script fala com o banco só via REST/PostgREST (função `rest()`
  // acima) — não há aqui nenhum mecanismo para rodar `select setval(...)`
  // (não existe RPC arbitrária exposta no schema; ver supabase/README.md).
  // Por isso NÃO dá para automatizar esse passo aqui: rode manualmente no
  // SQL Editor do projeto novo, logo após esta migração terminar:
  //   select setval('public.purchase_requests_request_number_seq',
  //     coalesce((select max(request_number) from public.purchase_requests), 0) + 1, false);
  //   select setval('public.service_orders_order_number_seq',
  //     coalesce((select max(order_number) from public.service_orders), 0) + 1, false);
  log('⚠️ IMPORTANTE — passo manual pendente: rode no SQL Editor do projeto novo o setval das sequências de numeração (request_number e order_number) — veja o comentário acima desta linha em src/lib/backend.ts ou a seção "Pós-migração obrigatório" em supabase/README.md. Sem isso, a primeira solicitação/O.S. nova após a migração falha por colisão de unique constraint.');
  log('✅ Migração concluída! Todos os usuários foram criados com a senha temporária: ' + MIGRATION_DEFAULT_PASSWORD);
  log('O banco antigo NÃO foi modificado. Recomendado: resetar a service key do projeto antigo no painel.');
}
