import { useEffect } from 'react';
import { PurchaseRequest } from '../types';
import { AppUser, canViewFinance } from '../data/users';
import { sendNotification } from '../utils/notify';
import { getFinanceSettings } from './financeSettings';
import { limboRequests } from './financeQueries';

/* ====================================================================
   Alerta do limbo financeiro por ntfy.

   O intervalo entre a aprovação do valor e a entrada em "Comprado" é
   exatamente o problema que o módulo resolve: o caixa já está comprometido
   e a compra não aconteceu. Este alerta torna esse intervalo visível sem
   depender de alguém abrir a tela do Financeiro.

   Reaproveita a integração ntfy existente e o mesmo antirrepique do alerta
   de entrega atrasada do Kanban: uma notificação por pedido por dia,
   marcada em localStorage.
   ==================================================================== */

const ALERT_PREFIX = 'limbo-alert';

/**
 * Dispara o alerta para gestor e financeiro. Roda em nível de App, então
 * não depende da tela aberta.
 */
export function useLimboAlert(requests: PurchaseRequest[], currentUser: AppUser | null): void {
  useEffect(() => {
    if (!currentUser || !canViewFinance(currentUser.role)) return;

    const settings = getFinanceSettings();
    if (!settings.limboAlertEnabled) return;

    const today = new Date().toISOString().slice(0, 10);
    const limbo = limboRequests(requests, settings.limboDays, new Date().toISOString());

    for (const item of limbo) {
      const key = `${ALERT_PREFIX}-${item.request.id}-${today}`;
      try {
        if (localStorage.getItem(key)) continue;
        localStorage.setItem(key, '1');
      } catch {
        // sem localStorage o alerta poderia repetir; melhor não notificar
        continue;
      }
      const valor = item.committedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      sendNotification({
        title: `⏳ ${item.request.number} — Aprovado há ${item.daysWaiting} dias, não comprado`,
        message: `${valor} comprometidos desde ${new Date(item.approvedAt).toLocaleDateString('pt-BR')} e a compra ainda não foi efetivada. `
          + `Solicitante ${item.request.requester} (${item.request.sector}), status "${item.request.status}".`,
        priority: item.daysWaiting >= settings.limboDays * 2 ? 5 : 4,
        tags: ['hourglass'],
      });
    }
  }, [requests, currentUser]);
}
