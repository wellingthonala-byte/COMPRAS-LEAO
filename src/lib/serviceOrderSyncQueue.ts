import { ServiceOrder } from '../types/serviceOrders';
import { upsertServiceOrders } from './backend';

/* ====================================================================
   Fila de reprocessamento para O.S. que falharam ao sincronizar.

   Mesmo padrão de lib/requestSyncQueue: a gravação nunca pode travar o
   usuário, então uma falha de rede/servidor deixa a O.S. só no cache local
   (compras-leao-service-orders) e entra nesta fila, drenada periodicamente
   e a cada abertura da página. Sem isso, o erro ficava só num console.warn e
   o usuário nunca sabia que uma O.S. não chegou ao servidor (FINDING 19).
   ==================================================================== */

const QUEUE_KEY = 'compras-leao-service-orders-queue';

function readQueue(): ServiceOrder[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as ServiceOrder[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: ServiceOrder[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(QUEUE_KEY);
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch { /* ignora */ }
}

export function pendingServiceOrderSyncCount(): number {
  return readQueue().length;
}

/** Enfileira mantendo apenas a versão mais recente de cada O.S. */
export function enqueueServiceOrders(items: ServiceOrder[]): void {
  const byId = new Map(readQueue().map((o) => [o.id, o]));
  for (const o of items) byId.set(o.id, o);
  writeQueue([...byId.values()]);
}

function removeFromQueue(ids: Set<string>): void {
  const queue = readQueue();
  const rest = queue.filter((o) => !ids.has(o.id));
  if (rest.length !== queue.length) writeQueue(rest);
}

/**
 * Tenta gravar as O.S. informadas; o que falhar entra/permanece na fila.
 * Nunca lança — quem chama segue adiante independentemente do resultado.
 * Devolve os números definitivos (order_number do banco) das O.S.
 * sincronizadas com sucesso — usado para resolver o rótulo provisório
 * "Nº pendente..." exibido enquanto o insert não tinha voltado (FINDING 20)
 * — ou `null` quando a sincronização falhou.
 */
export async function syncServiceOrders(
  items: ServiceOrder[],
  requesterId?: string,
): Promise<{ id: string; number: string }[] | null> {
  if (items.length === 0) return [];
  const ids = new Set(items.map((o) => o.id));
  try {
    const resolved = await upsertServiceOrders(items, requesterId);
    removeFromQueue(ids);
    return resolved;
  } catch (e) {
    enqueueServiceOrders(items);
    console.warn('[serviceOrderSyncQueue] falha ao sincronizar — na fila para reenvio:', e);
    return null;
  }
}

/** Tenta gravar o que está pendente. Devolve os números resolvidos das O.S. que saíram da fila. */
export async function flushServiceOrderQueue(requesterId?: string): Promise<{ id: string; number: string }[]> {
  const queued = readQueue();
  if (queued.length === 0) return [];
  try {
    const resolved = await upsertServiceOrders(queued, requesterId);
    writeQueue([]);
    return resolved;
  } catch (e) {
    console.warn(`[serviceOrderSyncQueue] reprocessamento falhou (${queued.length} pendente(s)):`, e);
    return [];
  }
}
