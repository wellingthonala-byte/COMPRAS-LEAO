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
    console.log(`[ntfy] ${title} → status ${res.status}`);
  } catch (e) {
    console.error('[ntfy] Erro ao enviar notificação:', e);
  }
}
