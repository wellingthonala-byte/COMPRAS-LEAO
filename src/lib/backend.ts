import { getSupabase } from './supabase';
import { PurchaseRequest, Status, Priority, Sector, Item, HistoryEntry } from '../types';
import { ServiceOrder, OSStatus } from '../types/serviceOrders';
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
    return { ...doc, id: row.id };
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
      deliveryForecast: it.expected_delivery_date ?? row.expected_delivery_date ?? row.created_at.slice(0, 10),
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
    deliveryForecast: row.expected_delivery_date ?? row.created_at.slice(0, 10),
    realDeliveryDate: row.actual_delivery_date ?? undefined,
    supplier: supplier?.name,
    value: supplier?.value ?? undefined,
    orderNumber: supplier?.order_number ?? undefined,
    fiscalNote: supplier?.invoice_number ?? undefined,
    items: items.length ? items : [{ id: `i-${row.id}`, description: '(sem itens)', quantity: 1, application: '', priority: 'Não Urgente', deliveryForecast: row.created_at.slice(0, 10) }],
    observations: row.observations ?? undefined,
    history: history.length ? history : [{ id: `h-${row.id}`, date: row.created_at, user: requester, action: 'Solicitação criada', to: STATUS_DB_TO_UI[row.status] }],
  };
}

const PAGE_SIZE = 1000;

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
    const [rows, profiles] = await Promise.all([
      fetchAllPages<DBRequestRow>((from, to) =>
        sb.from('purchase_requests')
          .select('*, request_items(*), suppliers(*), status_history(*)')
          .order('created_at', { ascending: false })
          .range(from, to)),
      fetchAllPages<{ id: string; full_name: string }>((from, to) =>
        sb.from('profiles').select('id, full_name').range(from, to)),
    ]);
    const names = new Map<string, string>(profiles.map((p) => [p.id, p.full_name]));
    return rows.map((r) => rowToRequest(r, names));
  } catch (e) {
    console.warn('[backend] fetchRequests falhou — usando dados locais:', e);
    return null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Grava/atualiza uma solicitação: colunas principais + documento completo em extra.doc */
export async function upsertRequests(reqs: PurchaseRequest[], requesterId?: string): Promise<void> {
  // Dados de teste locais (ids não-UUID) não sincronizam — ficam só no navegador
  const requests = reqs.filter((r) => UUID_RE.test(r.id));
  if (requests.length === 0) return;
  try {
    const sb = getSupabase();
    const uid = requesterId ?? (await sb.auth.getUser()).data.user?.id;
    if (!uid) return;
    // request_number: preserva o dos registros existentes; novos recebem max+1
    const existing = await fetchAllPages<{ id: string; request_number: number }>((from, to) =>
      sb.from('purchase_requests').select('id, request_number').range(from, to));
    const byId = new Map(existing.map((r) => [r.id, r.request_number]));
    let maxNum = Math.max(0, ...existing.map((r) => r.request_number));
    const payload = requests.map((r) => {
      let num = byId.get(r.id);
      if (num === undefined) { maxNum += 1; num = maxNum; }
      return {
        id: r.id,
        request_number: num,
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
      };
    });
    const { error } = await sb.from('purchase_requests').upsert(payload);
    if (error) throw error;
  } catch (e) {
    console.warn('[backend] upsertRequests falhou (dados seguem no cache local):', e);
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
    return { ...doc, id: row.id };
  }
  const requester = profileNames.get(row.requester_id) ?? 'Usuário';
  const d = new Date(row.created_at);
  return {
    id: row.id,
    number: `OS-${String(row.order_number).padStart(3, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`,
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
  };
}

export async function fetchServiceOrders(): Promise<ServiceOrder[] | null> {
  try {
    const sb = getSupabase();
    const [rows, profiles] = await Promise.all([
      fetchAllPages<DBOsRow>((from, to) =>
        sb.from('service_orders').select('*').order('created_at', { ascending: false }).range(from, to)),
      fetchAllPages<{ id: string; full_name: string }>((from, to) =>
        sb.from('profiles').select('id, full_name').range(from, to)),
    ]);
    const names = new Map<string, string>(profiles.map((p) => [p.id, p.full_name]));
    return rows.map((r) => rowToOrder(r, names));
  } catch (e) {
    console.warn('[backend] fetchServiceOrders falhou — usando dados locais:', e);
    return null;
  }
}

export async function upsertServiceOrders(allOrders: ServiceOrder[]): Promise<void> {
  const orders = allOrders.filter((o) => UUID_RE.test(o.id));
  if (orders.length === 0) return;
  try {
    const sb = getSupabase();
    const uid = (await sb.auth.getUser()).data.user?.id;
    if (!uid) return;
    const existing = await fetchAllPages<{ id: string; order_number: number }>((from, to) =>
      sb.from('service_orders').select('id, order_number').range(from, to));
    const byId = new Map(existing.map((r) => [r.id, r.order_number]));
    let maxNum = Math.max(0, ...existing.map((r) => r.order_number));
    const payload = orders.map((o) => {
      let num = byId.get(o.id);
      if (num === undefined) { maxNum += 1; num = maxNum; }
      return {
        id: o.id,
        order_number: num,
        requester_id: uid,
        service_type: 'manutencao',
        description: o.description || o.title,
        provider_name: o.technician || '',
        sector: o.costCenter,
        priority: o.priority === 'Crítica' ? 'maquina_parada' : o.priority === 'Alta' ? 'emergencia' : 'nao_urgente',
        agreed_value: o.estimatedValue ?? null,
        payment_status: o.status === 'Faturada' ? 'pago' : 'pendente',
        execution_deadline: o.dueDate || null,
        status: OS_STATUS_UI_TO_DB[o.status] ?? 'aberta',
        observations: o.observations ?? null,
        created_at: o.openedAt,
        closing_date: o.completedAt ?? null,
        updated_at: new Date().toISOString(),
        extra: { doc: o },
      };
    });
    const { error } = await sb.from('service_orders').upsert(payload);
    if (error) throw error;
  } catch (e) {
    console.warn('[backend] upsertServiceOrders falhou (dados seguem no cache local):', e);
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
  const role: Role = dbRoles.includes('admin') || dbRoles.includes('gestor') ? 'gestor'
    : dbRoles.includes('compras') ? 'comprador' : 'solicitante';
  return {
    id: uid,
    name,
    email: data.user.email ?? undefined,
    password: '',
    role,
    initials: name.trim().slice(0, 2).toUpperCase(),
    active: true,
    lastLogin: new Date().toISOString(),
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

  log('✅ Migração concluída! Todos os usuários foram criados com a senha temporária: ' + MIGRATION_DEFAULT_PASSWORD);
  log('O banco antigo NÃO foi modificado. Recomendado: resetar a service key do projeto antigo no painel.');
}
