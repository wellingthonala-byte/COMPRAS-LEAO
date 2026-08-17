import { PurchaseRequest } from '../types';
import { upsertRequests } from './backend';

/* ====================================================================
   Fila de reprocessamento para solicitações que falharam ao sincronizar.

   Mesmo padrão do módulo financeStore: a gravação nunca pode travar o
   usuário, então uma falha de rede/servidor deixa a solicitação só no
   cache local e entra nesta fila, drenada periodicamente e a cada novo
   login. Sem isso, o erro ficava só no console e o usuário via "salvo"
   mesmo quando o registro nunca chegou ao servidor.
   ==================================================================== */

const QUEUE_KEY = 'compras-leao-requests-queue';

function readQueue(): PurchaseRequest[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as PurchaseRequest[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: PurchaseRequest[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(QUEUE_KEY);
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch { /* ignora */ }
}

export function pendingRequestSyncCount(): number {
  return readQueue().length;
}

/** Enfileira mantendo apenas a versão mais recente de cada solicitação. */
export function enqueueRequests(items: PurchaseRequest[]): void {
  const byId = new Map(readQueue().map((r) => [r.id, r]));
  for (const r of items) byId.set(r.id, r);
  writeQueue([...byId.values()]);
}

/**
 * Tenta gravar as solicitações informadas; o que falhar entra/permanece na
 * fila. Nunca lança — quem chama segue adiante independentemente do
 * resultado.
 */
export async function syncRequests(items: PurchaseRequest[], requesterId?: string): Promise<boolean> {
  if (items.length === 0) return true;
  try {
    await upsertRequests(items, requesterId);
    return true;
  } catch (e) {
    enqueueRequests(items);
    console.warn('[requestSyncQueue] falha ao sincronizar — na fila para reenvio:', e);
    return false;
  }
}

/** Tenta gravar o que está pendente. Devolve quantas solicitações saíram da fila. */
export async function flushRequestQueue(requesterId?: string): Promise<number> {
  const queued = readQueue();
  if (queued.length === 0) return 0;
  try {
    await upsertRequests(queued, requesterId);
    writeQueue([]);
    return queued.length;
  } catch (e) {
    console.warn(`[requestSyncQueue] reprocessamento falhou (${queued.length} pendente(s)):`, e);
    return 0;
  }
}
