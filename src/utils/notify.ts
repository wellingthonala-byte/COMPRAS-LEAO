const NTFY_TOPIC = 'clleao9274';
const NTFY_URL = `https://ntfy.sh/${NTFY_TOPIC}`;

type NtfyPriority = 1 | 2 | 3 | 4 | 5;

interface NtfyOptions {
  title: string;
  message: string;
  priority?: NtfyPriority;
  tags?: string[];
}

export async function sendNotification({ title, message, priority = 3, tags = [] }: NtfyOptions) {
  try {
    const res = await fetch(NTFY_URL, {
      method: 'POST',
      headers: {
        'Title': title,
        'Priority': String(priority),
        'Tags': tags.join(','),
        'Content-Type': 'text/plain',
      },
      body: message,
    });
    console.log(`[ntfy] "${title}" → HTTP ${res.status}`);
    return res.status;
  } catch (e) {
    console.error('[ntfy] Erro:', e);
    return null;
  }
}

export async function sendTestNotification(): Promise<{ status: number | null; error?: string }> {
  try {
    const res = await fetch(NTFY_URL, {
      method: 'POST',
      headers: {
        'Title': '🔔 Teste do Sistema',
        'Priority': '3',
        'Tags': 'bell',
        'Content-Type': 'text/plain',
      },
      body: `Notificação de teste enviada às ${new Date().toLocaleTimeString('pt-BR')}`,
    });
    return { status: res.status };
  } catch (e) {
    return { status: null, error: String(e) };
  }
}

export { NTFY_TOPIC };

