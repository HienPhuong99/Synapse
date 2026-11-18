export interface NotificationMessage {
  title: string;
  body: string;
  level?: 'info' | 'warn' | 'error';
}

export function isValidHttpUrl(raw: string | undefined): raw is string {
  if (!raw) return false;
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function sendNtfyNotification(ntfyTopicUrl: string | undefined, msg: NotificationMessage): Promise<boolean> {
  if (!isValidHttpUrl(ntfyTopicUrl)) return false;

  const priority = msg.level === 'error' ? 'high' : msg.level === 'warn' ? 'default' : 'low';
  try {
    const res = await fetch(ntfyTopicUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        Title: msg.title,
        Priority: priority,
      },
      body: msg.body,
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
