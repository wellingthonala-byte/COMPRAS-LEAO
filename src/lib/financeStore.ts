import { useSyncExternalStore } from 'react';
import { Installment } from '../types/finance';
import { fetchInstallments, upsertInstallments } from './backend';

/* ====================================================================
   Estado das parcelas + fila de reprocessamento.

   Não existe backend neste projeto: quem grava as parcelas é o navegador
   de quem executou a ação (o gestor ao aprovar o valor, o comprador ao
   mover o card para "Comprado"). Duas consequências tratadas aqui:

   1. A gravação NUNCA pode derrubar a ação do usuário. Se o Supabase
      falhar, a parcela fica no cache local e entra numa fila em
      localStorage, que é drenada na próxima oportunidade.
   2. Se ainda assim a gravação nunca acontecer, a varredura de
      reconciliação (financeSync.reconcile) compara o estado de cada card
      com o das suas parcelas e corrige a diferença ao abrir o Financeiro.

   Segue o padrão de types/serviceOrders.ts + DashboardPage: o módulo
   carrega os próprios dados, em vez de descer por props do App.
   ==================================================================== */

const CACHE_KEY = 'compras-leao-installments';
const QUEUE_KEY = 'compras-leao-finance-queue';
const LOG_KEY = 'compras-leao-finance-log';
const MAX_LOG = 50;

type Listener = () => void;

function readCache(): Installment[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as Installment[]) : [];
  } catch {
    return [];
  }
}

let state: Installment[] = readCache();
const listeners = new Set<Listener>();

function commit(next: Installment[]) {
  state = next;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* cota cheia: segue com memória */ }
  listeners.forEach((l) => l());
}

export function getInstallments(): Installment[] {
  return state;
}

function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** Assina o estado das parcelas. */
export function useInstallments(): Installment[] {
  return useSyncExternalStore(subscribe, getInstallments, getInstallments);
}

export function installmentsOf(requestId: string): Installment[] {
  return state.filter((i) => i.requestId === requestId).sort((a, b) => a.number - b.number);
}

/* ------------------------------------------------------------------ */
/* Log de erros (visível na tela do Financeiro)                        */
/* ------------------------------------------------------------------ */

export interface FinanceLogEntry {
  at: string;
  requestNumber: string;
  message: string;
}

export function readFinanceLog(): FinanceLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as FinanceLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function logFinanceError(requestNumber: string, message: string): void {
  try {
    const entry: FinanceLogEntry = { at: new Date().toISOString(), requestNumber, message };
    const next = [entry, ...readFinanceLog()].slice(0, MAX_LOG);
    localStorage.setItem(LOG_KEY, JSON.stringify(next));
  } catch { /* log é best-effort */ }
  console.warn(`[financeiro] ${requestNumber}: ${message}`);
}

export function clearFinanceLog(): void {
  try { localStorage.removeItem(LOG_KEY); } catch { /* ignora */ }
}

/* ------------------------------------------------------------------ */
/* Fila de reprocessamento                                             */
/* ------------------------------------------------------------------ */

function readQueue(): Installment[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as Installment[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: Installment[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(QUEUE_KEY);
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch { /* ignora */ }
}

export function pendingCount(): number {
  return readQueue().length;
}

/** Enfileira mantendo apenas a versão mais recente de cada parcela. */
function enqueue(items: Installment[]): void {
  const byId = new Map(readQueue().map((i) => [i.id, i]));
  for (const i of items) byId.set(i.id, i);
  writeQueue([...byId.values()]);
}

/** Tenta gravar o que está pendente. Devolve quantas parcelas saíram da fila. */
export async function flushQueue(): Promise<number> {
  const queued = readQueue();
  if (queued.length === 0) return 0;
  try {
    await upsertInstallments(queued);
    writeQueue([]);
    return queued.length;
  } catch (e) {
    logFinanceError('—', `Reprocessamento da fila falhou (${queued.length} parcela(s) pendente(s)): ${String(e)}`);
    return 0;
  }
}

/* ------------------------------------------------------------------ */
/* Persistência                                                        */
/* ------------------------------------------------------------------ */

/**
 * Aplica parcelas ao estado e tenta gravar no Supabase.
 *
 * Nunca lança: o cache local é atualizado primeiro, e a falha de rede vai
 * para a fila. Quem chama (aprovação, movimentação de card) segue adiante
 * independentemente do resultado.
 */
export async function saveInstallments(changed: Installment[], requestNumber = '—'): Promise<void> {
  if (changed.length === 0) return;

  const byId = new Map(state.map((i) => [i.id, i]));
  for (const i of changed) byId.set(i.id, i);
  commit([...byId.values()]);

  try {
    await upsertInstallments(changed);
    await flushQueue();
  } catch (e) {
    enqueue(changed);
    logFinanceError(requestNumber, `Parcelas gravadas apenas no navegador; na fila para reenvio. Erro: ${String(e)}`);
  }
}

let initPromise: Promise<'online' | 'offline'> | null = null;

/**
 * Carrega as parcelas do servidor. Em caso de falha mantém o cache local.
 * Drena a fila antes de ler, para não sobrescrever pendências com dados velhos.
 *
 * Idempotente: chamadas repetidas (ex.: efeitos de React remontando) devolvem
 * a mesma promise em vez de disparar outra carga.
 */
export function initInstallments(): Promise<'online' | 'offline'> {
  if (!initPromise) {
    initPromise = (async () => {
      await flushQueue();
      const remote = await fetchInstallments();
      if (remote === null) return 'offline' as const;
      commit(remote);
      return 'online' as const;
    })();
  }
  return initPromise;
}

/**
 * Resolve quando a carga inicial do cache (ou a tentativa dela) terminou —
 * `installmentsOf`/`getInstallments` só refletem o servidor depois disso.
 *
 * Nunca lança: se `initInstallments` ainda nem foi chamada (App.tsx dispara
 * ela sem await), não há o que esperar e resolve na hora — mesma janela de
 * corrida que já existia, não é este ponto que a introduz. Quem precisa da
 * garantia forte é código que roda depois que a app já montou, como a
 * reconciliação do Financeiro.
 */
export function installmentsReady(): Promise<void> {
  if (!initPromise) return Promise.resolve();
  return initPromise.then(() => undefined, () => undefined);
}
