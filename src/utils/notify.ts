const DEFAULT_TOPIC = 'clleao9274';

export function getNtfyTopic(): string {
  try {
    const raw = localStorage.getItem('compras-leao-settings');
    if (raw) {
      const topic = JSON.parse(raw)?.notifications?.ntfyTopic;
      if (typeof topic === 'string' && topic.trim()) return topic.trim();
    }
  } catch { /* usa padrão */ }
  return DEFAULT_TOPIC;
}

export function isPushEnabled(): boolean {
  try {
    const raw = localStorage.getItem('compras-leao-settings');
    if (raw) {
      const enabled = JSON.parse(raw)?.notifications?.pushEnabled;
      if (typeof enabled === 'boolean') return enabled;
    }
  } catch { /* usa padrão */ }
  return true;
}

const NTFY_TOPIC = DEFAULT_TOPIC;

type NtfyPriority = 1 | 2 | 3 | 4 | 5;

interface NtfyOptions {
  title: string;
  message: string;
  priority?: NtfyPriority;
  tags?: string[];
}

function buildUrl(title: string, priority: number, tags: string[]): string {
  const params = new URLSearchParams({
    title,
    priority: String(priority),
    ...(tags.length > 0 ? { tags: tags.join(',') } : {}),
  });
  return `https://ntfy.sh/${getNtfyTopic()}?${params.toString()}`;
}

export async function sendNotification({ title, message, priority = 3, tags = [] }: NtfyOptions) {
  if (!isPushEnabled()) return;
  try {
    await fetch(buildUrl(title, priority, tags), {
      method: 'POST',
      mode: 'no-cors',
      body: message,
    });
    console.log(`[ntfy] "${title}" enviada`);
  } catch (e) {
    console.error('[ntfy] Erro:', e);
  }
}

export async function sendTestNotification(): Promise<{ ok: boolean; error?: string }> {
  try {
    await fetch(buildUrl('🔔 Teste do Sistema', 3, ['bell']), {
      method: 'POST',
      mode: 'no-cors',
      body: `Teste enviado às ${new Date().toLocaleTimeString('pt-BR')}`,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export { NTFY_TOPIC };

