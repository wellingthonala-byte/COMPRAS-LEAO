import { HistoryEntry, PurchaseRequest, Status } from '../types';
import { insertStatusHistory, upsertRequests } from './backend';

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

/** Snapshot atual da fila — usado para mesclar pendências com o remoto ao logar. */
export function getQueuedRequests(): PurchaseRequest[] {
  return readQueue();
}

/** Remove da fila os ids informados: uma versão mais nova acabou de ser confirmada no servidor. */
function removeFromQueue(ids: Set<string>): void {
  const queue = readQueue();
  const rest = queue.filter((r) => !ids.has(r.id));
  if (rest.length !== queue.length) writeQueue(rest);
}

/* --------------------------------------------------------------------
   Fila paralela para entradas de status_history que não puderam ser
   gravadas junto com a solicitação (upsert falhou). insertStatusHistory
   é best-effort e só é chamado depois de um upsertRequests bem-sucedido —
   sem esta fila, entradas de histórico de um ciclo que caiu na fila de
   solicitações nunca eram reenviadas quando o item era finalmente
   sincronizado só pelo flush periódico (que não conhece o histórico).
   -------------------------------------------------------------------- */

const HISTORY_QUEUE_KEY = 'compras-leao-requests-history-queue';

interface QueuedHistory {
  requestId: string;
  entries: HistoryEntry[];
  fallbackStatus: Status;
}

function readHistoryQueue(): QueuedHistory[] {
  try {
    const raw = localStorage.getItem(HISTORY_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as QueuedHistory[]) : [];
  } catch {
    return [];
  }
}

function writeHistoryQueue(items: QueuedHistory[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(HISTORY_QUEUE_KEY);
    else localStorage.setItem(HISTORY_QUEUE_KEY, JSON.stringify(items));
  } catch { /* ignora */ }
}

function enqueueHistory(requestId: string, entries: HistoryEntry[], fallbackStatus: Status): void {
  if (entries.length === 0) return;
  const queue = readHistoryQueue();
  const existing = queue.find((q) => q.requestId === requestId);
  if (existing) {
    const seen = new Set(existing.entries.map((e) => e.id));
    existing.entries.push(...entries.filter((e) => !seen.has(e.id)));
    existing.fallbackStatus = fallbackStatus;
  } else {
    queue.push({ requestId, entries: [...entries], fallbackStatus });
  }
  writeHistoryQueue(queue);
}

/** Descarta entradas pendentes sem enviar — usado quando o chamador já vai reenviar o histórico completo por conta própria. */
function discardHistoryQueue(ids: Set<string>): void {
  const queue = readHistoryQueue();
  const rest = queue.filter((q) => !ids.has(q.requestId));
  if (rest.length !== queue.length) writeHistoryQueue(rest);
}

/** Envia e remove as entradas pendentes dos ids informados. Best-effort, como o resto do módulo. */
function flushHistoryFor(ids: Set<string>, requesterId: string): void {
  const queue = readHistoryQueue();
  const toFlush = queue.filter((q) => ids.has(q.requestId));
  if (toFlush.length === 0) return;
  writeHistoryQueue(queue.filter((q) => !ids.has(q.requestId)));
  for (const q of toFlush) {
    void insertStatusHistory(q.requestId, requesterId, q.entries, q.fallbackStatus);
  }
}

/**
 * Tenta gravar as solicitações informadas; o que falhar entra/permanece na
 * fila. Nunca lança — quem chama segue adiante independentemente do
 * resultado. `historyByRequest`, quando informado, guarda as entradas de
 * histórico do ciclo atual para reenvio posterior caso o upsert falhe.
 */
export async function syncRequests(
  items: PurchaseRequest[],
  requesterId?: string,
  historyByRequest?: Map<string, { entries: HistoryEntry[]; fallbackStatus: Status }>,
): Promise<boolean> {
  if (items.length === 0) return true;
  const ids = new Set(items.map((r) => r.id));
  try {
    await upsertRequests(items, requesterId);
    removeFromQueue(ids);
    // O chamador (App.tsx) já reenvia o histórico completo acumulado deste
    // ciclo — descarta qualquer pendência antiga da fila de histórico para
    // não duplicar o envio.
    discardHistoryQueue(ids);
    return true;
  } catch (e) {
    enqueueRequests(items);
    if (historyByRequest) {
      for (const r of items) {
        const h = historyByRequest.get(r.id);
        if (h) enqueueHistory(r.id, h.entries, h.fallbackStatus);
      }
    }
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
    if (requesterId) flushHistoryFor(new Set(queued.map((r) => r.id)), requesterId);
    return queued.length;
  } catch (e) {
    console.warn(`[requestSyncQueue] reprocessamento falhou (${queued.length} pendente(s)):`, e);
    return 0;
  }
}
